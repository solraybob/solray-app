"use client";

import { useEffect } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { isCurrentGeneration, isStaleAccountError } from "@/lib/account-session";
import { AI_CONSENT_REQUIRED_CODE } from "@/lib/ai-consent";
import { loadSession, beginSend, settleMessage, forgetMessage, updateStoredSession, uploadableMessages } from "@/lib/chat-sync";
import { syncedSoulRef } from "@/lib/chat-soul";
import { signalOracleReply } from "@/lib/native-push";
import { oracleErrorKey, ORACLE_ERROR_KEYS, isPartnerConsentRefusal, MESSAGE_TOO_LONG_CODE } from "@/lib/oracle-errors";
import { soulRequestFields, historyForServer, voiceTranscriptFor, composerWithUnsent } from "@/lib/oracle-request";
import { answerFromChat, readChatRefusal, withAnswer } from "@/lib/chat-outcome";
import { type Message, todayLabel, generateSessionId } from "../_lib/chat-helpers";
import type { useChatState } from "./useChatState";
import type { useChatSessions } from "./useChatSessions";

export function useChatSend(pageCtx: ReturnType<typeof useChatState> & ReturnType<typeof useChatSessions>) {
  const {
    accountGen, activeSessionRef, input, inputRef, isMountedRef, lastTranscriptRef, mediaRecorderRef,
    messages, persistSession, router, sending, sendingRef, sessionId, setChatNotice, setInput,
    setMessages, setSending, setSessionId, setShowHistory, setSoulBlueprint, setSoulName, setSoulRef,
    setStatusTick, setStreamedLength, setStreamingId, setVoiceSupported, soulRef, t, token
  } = pageCtx;
  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (overrideText?: string, opts?: { voiceTranscript?: string; replaceId?: string }) => {
    // overrideText lets a tappable prompt or auto-send path bypass the
    // input state without waiting for setInput to flush. Falls back to
    // the live input value. Resolves false when nothing was sent.
    const text = (overrideText ?? input).trim();
    if (!text || sending || sendingRef.current) return false;
    sendingRef.current = true;
    const voiceTranscript = opts?.voiceTranscript ?? voiceTranscriptFor(text, lastTranscriptRef.current);
    lastTranscriptRef.current = null;

    // If voice is active, stop it so the final transcript commits before send.
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") rec.stop();
    } catch {
      // ignore
    }

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: text,
      timestamp: new Date().toISOString(),
    };
    // Not uploaded to the transcript until /chat has answered: a message
    // the server refuses (too long) must never come back through sync.
    // Stored with the cached conversation, so leaving Chat or closing the
    // app before the answer keeps it out too (lib/chat-sync).
    const life = beginSend(userMsg.id);
    // Sending an interrupted message again: the new one replaces it.
    const baseMessages = opts?.replaceId ? messages.filter((m) => m.id !== opts.replaceId) : messages;
    if (opts?.replaceId) forgetMessage(opts.replaceId);

    const updatedMessages = [...baseMessages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setSending(true);
    setChatNotice(null);
    const sentSessionId = sessionId;
    // Whether this turn is a Dynamics reading (decides how a closed
    // conversation is handled below).
    // The partner this conversation is with, also when only its synced
    // transcript names them so far.
    const sendSoulRef = syncedSoulRef(soulRef, baseMessages)?.ref ?? soulRef;
    const sentSoulRef = sendSoulRef;

    // Error bubbles go along marked isError, so the server drops them
    // instead of reading them back as the Oracle's own words. Messages that
    // never got an answer (interrupted, refused) are not part of it.
    const history = historyForServer(uploadableMessages(updatedMessages.slice(0, -1)));

    try {
      // Build the request body. In a Dynamics chat every message names who
      // it is with (connection or saved person), so the server keeps the
      // other chart in view for the whole session, not just message 1.
      const body: Record<string, unknown> = {
        message: userMsg.content,
        conversation_history: history,
        session_id: sentSessionId,
        ...soulRequestFields(sendSoulRef),
        ...(voiceTranscript ? { voice_transcript: voiceTranscript } : {}),
      };

      const data = await apiFetch(
        "/chat",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        token
      );
      // Answered: part of the transcript from now on.
      life.answered();
      // The active conversation changed while waiting, or the member left
      // Chat: do not append this reply into a different session; it goes
      // into the saved copy of its own conversation instead of being lost.
      if (!isMountedRef.current || activeSessionRef.current !== sentSessionId) {
        const answer = answerFromChat(data, t("chat.error_no_response"));
        updateStoredSession(sentSessionId, accountGen, (saved) => withAnswer(saved, answer));
        return;
      }
      // A conversation that had no id yet gets the one the server issued,
      // and keeps it for every later turn (provenance lives
      // on it server-side).
      if (!sentSessionId && typeof data.session_id === "string" && data.session_id) {
        activeSessionRef.current = data.session_id;
        setSessionId(data.session_id);
      }

      // Honest empty-response handling. If the backend returned 200 but
      // both response and message fields are empty, surface that as an
      // error rather than inventing Oracle copy ("I hear you." was the
      // previous fallback string here, which is fictional content
      // presented as the Oracle's reply).
      const content = data.response || data.message;
      if (!content) {
        const errMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content: t("chat.error_no_response"),
          timestamp: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, errMsg]);
        return;
      }
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      // Kick off streaming effect
      setStreamedLength(0);
      setStreamingId(reply.id);
      // A real Oracle reply is the "seen value" moment for the push ask.
      signalOracleReply();
    } catch (err) {
      // Too long to send: refused, whatever happens on screen below. Recorded
      // first, before any check of where the member is now, so it can never
      // be uploaded later (Codex out8-5 #2).
      const tooLong = err instanceof ApiError && err.code === MESSAGE_TOO_LONG_CODE;
      // (Under the account it was sent from; after an account change the
      // old account's copy keeps it as an interrupted message, out of uploads.)
      if (tooLong && isCurrentGeneration(accountGen)) {
        life.refused();
      }
      // How this failure reads (lib/chat-outcome readChatRefusal): the
      // note it leaves and whether it is the subscription refusal.
      const refusal = readChatRefusal(err);
      const offscreen = !isMountedRef.current || activeSessionRef.current !== sentSessionId;
      if (offscreen && tooLong) {
        // Out of sight: the message stays in its conversation's saved copy,
        // marked refused, with a way back to the box.
        return;
      }
      // If the user has already navigated away from /chat by the time the
      // response lands, do nothing. Whichever page they're on now will
      // handle its own auth/access state. Specifically, never call
      // router.replace from a stale chat handler, it yanks the user off
      // the new page they're trying to use.
      if (!isMountedRef.current) return;
      if (isStaleAccountError(err)) return;
      // A member this conversation carries is no longer sharing their chart
      // (withdrew AI consent, went Private, ended the connection): the
      // server closed the conversation.
      if (isPartnerConsentRefusal(err)) {
        if (activeSessionRef.current !== sentSessionId) return;
        if (sentSoulRef) {
          // Dynamics with that partner: the existing partner-consent copy in
          // the thread, and the offer of an ordinary conversation.
          const note: Message = {
            id: (Date.now() + 1).toString(),
            role: "assistant",
            content: t(ORACLE_ERROR_KEYS.partner_ai_consent_required),
            timestamp: new Date().toISOString(),
            isError: true,
          };
          setMessages((prev) => [...prev, note]);
          setChatNotice({ kind: "dynamics", sessionId: sentSessionId });
          return;
        }
        // Ordinary conversation: it cannot continue. The unsent message
        // leaves the closed conversation and waits in the composer of a
        // fresh one (never sent on its own). No session-close synthesis:
        // the server keeps nothing from a conversation in this state.
        persistSession({
          sessionId: sentSessionId,
          date: todayLabel(),
          customName: loadSession(sentSessionId)?.customName,
          messages: updatedMessages.slice(0, -1),
        });
        setSoulBlueprint(null);
        setSoulName(null);
        setSoulRef(null);
        const freshId = generateSessionId();
        setSessionId(freshId);
        persistSession({ sessionId: freshId, date: todayLabel(), messages: [] });
        setMessages([]);
        setShowHistory(false);
        setInput((prev) => (prev.trim() ? `${text}\n\n${prev}` : text));
        setChatNotice({ kind: "closed" });
        requestAnimationFrame(() => inputRef.current?.focus());
        return;
      }
      // Missing AI consent (the consent sheet is already open, lib/api), a
      // private or unconsented partner chart, today's limit or a message
      // that is too long: none is a billing problem. Say so plainly in the
      // thread, no paywall redirect.
      const known = oracleErrorKey(err);
      if (known) {
        if (activeSessionRef.current !== sentSessionId) return;
        // Too long to send (a long voice note, say): nothing else happened.
        // The words leave the thread and go back into the box, whole, to be
        // shortened; the spoken part keeps travelling as voice_transcript.
        if (tooLong) {
          // Refused (recorded above): never uploaded, whatever this device
          // saves meanwhile.
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== userMsg.id),
            {
              id: (Date.now() + 2).toString(),
              role: "assistant",
              content: t("oracle_errors.message_too_long_kept"),
              timestamp: new Date().toISOString(),
              isError: true,
            },
          ]);
          setInput((prev) => composerWithUnsent(text, prev));
          lastTranscriptRef.current = voiceTranscript ?? null;
          requestAnimationFrame(() => inputRef.current?.focus());
          return;
        }
        const noteAt = Date.now();
        // Missing AI consent is not an error: the sheet is open, and if it
        // is put aside a quiet notice over the composer offers it again.
        if (err instanceof ApiError && err.code === AI_CONSENT_REQUIRED_CODE) {
          setChatNotice({ kind: "consent", sessionId: sentSessionId });
          return;
        }
        const note: Message = {
          id: (noteAt + 2).toString(),
          role: "assistant",
          content: t(known),
          timestamp: new Date().toISOString(),
          isError: true,
        };
        setMessages((prev) => [...prev, note]);
        return;
      }
      // Only the bare subscription refusal goes to the paywall; a coded 403
      // (a connection not accepted, say) is a refusal of this reading, said
      // in the thread below.
      if (refusal.paywall) {
        router.replace("/subscribe");
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      if (activeSessionRef.current !== sentSessionId) return;
      // Transport / server error. The previous version of this branch
      // shipped a hardcoded array of five "Oracle-flavored" fortune
      // cookie strings and picked one at random to display as if the
      // Oracle had actually said it. That is fictional content
      // presented as the user's personalised reply, which is exactly
      // the failure mode this product cannot ship. We now surface a
      // visible error message in the thread, marked as an error so it
      // renders distinctly from genuine Oracle replies.
      // A refusal from the server (any shape of detail) says the Oracle
      // could not answer this; offline or a server error says it could not
      // be reached. Never the server's raw text.
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: t(refusal.noteKey),
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      // Not settled above: a failure. Shown in this conversation, the
      // message is part of the transcript from now on (the error note
      // follows it). Out of sight (the member left Chat or this
      // conversation, or the account changed), nobody saw it fail: it stays
      // out of uploads as an interrupted message, kept and shown with a
      // way to send it again.
      life.finish(isMountedRef.current && activeSessionRef.current === sentSessionId && isCurrentGeneration(accountGen));
      sendingRef.current = false;
      if (isMountedRef.current) setSending(false);
    }
    return true;
  };

  // Takes a message without an answer out of the thread (and the saved
  // copy, also when it was the last one).
  const dropUnanswered = (id: string) => {
    const next = messages.filter((m) => m.id !== id);
    setMessages(next);
    if (next.length === 0 && sessionId) {
      persistSession({ sessionId, date: todayLabel(), customName: loadSession(sessionId)?.customName, messages: next });
    }
    setStatusTick((n) => n + 1);
  };
  // An interrupted message, sent again: the new message replaces it.
  const resendInterrupted = (msg: Message) => {
    if (sending || sendingRef.current) return;
    void sendMessage(msg.content, { replaceId: msg.id });
  };
  // An interrupted message the member does not want: withdrawn for good.
  const removeInterrupted = (msg: Message) => {
    settleMessage(msg.id, true);
    dropUnanswered(msg.id);
  };
  // A message refused as too long while Chat was closed: back to the box,
  // whole, to be shortened (it stays refused, never uploaded).
  const editRefused = (msg: Message) => {
    dropUnanswered(msg.id);
    setInput((prev) => composerWithUnsent(msg.content, prev));
    requestAnimationFrame(() => inputRef.current?.focus());
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // Detect MediaRecorder + getUserMedia support once on mount.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const ok = typeof window.MediaRecorder !== "undefined"
      && !!navigator.mediaDevices
      && typeof navigator.mediaDevices.getUserMedia === "function";
    setVoiceSupported(ok);
  }, []);

  return { editRefused, handleKeyDown, removeInterrupted, resendInterrupted, sendMessage };
}
