"use client";

import { useChartRevision } from "@/lib/use-chart-revision";
import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { getAuthGeneration, isCurrentGeneration, type AccountGuard } from "@/lib/account-session";
import { AI_CONSENT_CHANGED_EVENT } from "@/lib/ai-consent";
import { mergeMessages, sameTranscript } from "@/lib/chat-merge";
import { CHAT_MERGED_EVENT, ChatSyncUnavailable, loadSession, markUnsent, pushSessionToServer, bindChatSyncToAccount, saveSession, syncSessionsFromServer, uploadableMessages, type HistoryEntry, fetchSessionFromServer, getEvictedSummary } from "@/lib/chat-sync";
import { syncedSoulRef } from "@/lib/chat-soul";
import { beginUnfinishedWork, registerDraftSource } from "@/lib/draft-guard";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { historyForServer, composerWithUnsent, type SoulRef } from "@/lib/oracle-request";
import { accountKey } from "@/lib/account-session";
import { type Message, type StoredSession } from "../_lib/chat-helpers";

export function useChatState() {
  const { t, lang } = useT();
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  // Soul-compatibility chat state. When the user opens chat from a Souls
  // reading, we receive their full blueprint via sessionStorage. We
  // hold it in component state so EVERY follow-up message carries the
  // soul context to the backend, not just the first one. Without this,
  // the Oracle had full chart data on message 1 and only conversation
  // history on message 2+, which is why follow-ups read as "I need
  // their moon sign and centres".
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [soulBlueprint, setSoulBlueprint] = useState<any>(null);
  const [soulName, setSoulName] = useState<string | null>(null);
  // Who the Dynamics conversation is with (connection or saved person id),
  // sent on every message so the server loads that chart itself.
  const [soulRef, setSoulRef] = useState<SoulRef | null>(null);
  const [input, setInput] = useState("");
  // Opening suggestions: three doors, one per theme, each rotating daily.
  //   SKY: what the sky is doing today or in the coming days. The
  //        forecast-seeded line (lib/today-prompts) leads when cached,
  //        because it could only exist for this user on this day.
  //   SELF: revelation about who they are ("tell me something I likely
  //        don't know about myself"), placement-personalized when the
  //        blueprint is cached.
  //   CHART: diagnostic questions against their chart ("do I have money
  //        blocks?"), the question shapes the Oracle is strongest at.
  // Pools rotate on different daily offsets so the combination changes
  // around. Fail-soft everywhere: a missing cache shrinks a pool, never
  // breaks the chat.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  // Ghost-tap guard: a real user reported the Oracle answering suggestion
  // prompts she never tapped. The chips mount asynchronously and used to
  // render below a still-streaming greeting, so they could appear or move
  // under a finger mid-tap and auto-send. Chips now ignore interactions for
  // their first 450ms on screen (and never render during streaming).
  const suggestionsArmedAt = useRef(0);
  const chartRev = useChartRevision();
  useEffect(() => {
    void (async () => {
      try {
        const day = Math.floor(Date.now() / 86400000);

        let summary: Record<string, string> = {};
        try {
          const bp = JSON.parse(localStorage.getItem(accountKey("solray_blueprint")) || "null");
          summary = (bp && (bp.summary || bp)) || {};
        } catch { /* no blueprint cache */ }
        const moon = summary.moon_sign ? tx(summary.moon_sign, lang) : null;
        const hdType = summary.hd_type ? tx(summary.hd_type, lang) : null;
        const authority = summary.hd_authority ? tx(summary.hd_authority, lang) : null;

        // SKY pool: forecast-seeded first when available.
        const sky: string[] = [];
        try {
          const { buildTodayPrompts, readCachedForecast } = await import("@/lib/today-prompts");
          const tp = buildTodayPrompts(readCachedForecast(), t, lang);
          if (tp.length > 0) sky.push(tp[day % tp.length].question);
        } catch { /* no forecast cache */ }
        sky.push(
          t("chat.suggest_today"),
          t("chat.suggest_sky_days"),
          t("chat.suggest_season"),
        );

        // SELF pool: revelation, placement-flavored when possible.
        const self: string[] = [
          t("chat.suggest_unknown"),
          t("chat.suggest_truth"),
          t("chat.suggest_undervalue"),
        ];
        if (moon) self.push(t("chat.suggest_moon").replace("{moon}", moon));
        if (hdType) self.push(t("chat.suggest_type").replace("{type}", hdType));

        // CHART pool: diagnostics against their actual chart.
        const chart: string[] = [
          t("chat.suggest_money_block"),
          t("chat.suggest_love_block"),
          t("chat.suggest_pattern"),
          t("chat.suggest_work"),
        ];
        if (authority) chart.push(t("chat.suggest_authority").replace("{authority}", authority));

        // One pick per theme, each pool on its own daily stride so the
        // combination shifts rather than marching in lockstep.
        const picked = [
          sky[day % sky.length],
          self[(day * 2 + 1) % self.length],
          chart[(day * 3 + 2) % chart.length],
        ];
        setSuggestions(Array.from(new Set(picked)).slice(0, 3));
      } catch { /* suggestions are decoration; never break chat */ }
      suggestionsArmedAt.current = Date.now();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  // Rebuilt when the chart changes (a birth correction here or in
  // another tab), so no chip names the old Moon or Human Design type.
  }, [lang, chartRev]);
  const [sending, setSending] = useState(false);
  // Read synchronously so a second send is refused at once: set the moment
  // a send is accepted, cleared when it settles.
  const sendingRef = useRef(false);
  useEffect(() => { sendingRef.current = sending; }, [sending]);
  // The last transcript placed in the box: sent with the message as
  // voice_transcript so the server reads the spoken words on their own.
  const lastTranscriptRef = useRef<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const [pastSessions, setPastSessions] = useState<HistoryEntry[]>([]);
  // A conversation evicted from this device's cache being read back from
  // the server as it is opened from History.
  const [historyOpening, setHistoryOpening] = useState<{ id: string; failed: boolean } | null>(null);
  // Which read-back is current: every History selection, rename read-back,
  // panel close and New Chat moves it on, so a late answer is cached but
  // never opens over a newer choice (Codex out13-5 #2).
  const historyReqRef = useRef(0);
  const cancelHistoryReadBack = useCallback(() => {
    historyReqRef.current += 1;
    setHistoryOpening(null);
  }, []);
  // Read an evicted conversation back from the server for `then` (open it,
  // or rename it), with its loading and failure line in History. The
  // transcript is cached whatever happens; `then` runs only while this is
  // still the current request.
  const readBackEvicted = (sid: string, then: (sid: string) => void) => {
    const tok = tokenRef.current;
    if (!tok) return;
    const gen = accountGen;
    const req = ++historyReqRef.current;
    const current = () => historyReqRef.current === req && isMountedRef.current && isCurrentGeneration(gen);
    setHistoryOpening({ id: sid, failed: false });
    void fetchSessionFromServer(sid, tok, gen).then((got) => {
      if (got.kind === "gone" && isMountedRef.current && isCurrentGeneration(gen)) {
        // Gone on the server: the row goes whichever row is current, and
        // voice words waiting for it become the offer to keep or discard,
        // even when this read-back was superseded (Codex out17-5).
        setPastSessions((prev) => prev.filter((s) => s.sessionId !== sid));
        parkedToOrphan(sid);
      }
      if (!current()) return;
      if (got.kind === "found") {
        setHistoryOpening(null);
        setPastSessions((prev) => prev.map((s) => (s.sessionId === sid ? got.session : s)));
        then(sid);
      } else if (got.kind === "gone") {
        setHistoryOpening(null);
        setHistoryError(t("chat.history_gone"));
      } else {
        setHistoryOpening({ id: sid, failed: true });
      }
    });
  };
  // History closed by any means: a read-back still on its way no longer
  // opens anything.
  useEffect(() => {
    if (!showHistory) cancelHistoryReadBack();
  }, [showHistory, cancelHistoryReadBack]);
  const [historyError, setHistoryError] = useState<string | null>(null);

  // (forecast-seeded prompts now feed the unified `suggestions` above)

  // Streaming state
  const [streamingId, setStreamingId] = useState<string | null>(null);
  // Chips become visible the instant streaming ends; re-arm the ghost-tap
  // window at that exact moment, not just at load.
  useEffect(() => {
    if (!streamingId) suggestionsArmedAt.current = Date.now();
  }, [streamingId]);
  const [streamedLength, setStreamedLength] = useState(0);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  // History delete asks once before removing a conversation for good.
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const inputRef = useRef<HTMLTextAreaElement>(null);
  const messagesRef = useRef<Message[]>([]);
  const tokenRef = useRef<string | null>(null);
  // Set false in a cleanup effect; checked before any router.replace inside
  // an awaited /chat response. Without this, a 403 that arrives after the
  // user has already navigated away (e.g. swiped to /today, tapped BottomNav)
  // yanks them off the new page back to /subscribe.
  const isMountedRef = useRef<boolean>(true);
  useEffect(() => {
    isMountedRef.current = true;
    return () => { isMountedRef.current = false; };
  }, []);

  // Voice recording (MediaRecorder + backend Whisper)
  // We record audio to a blob client-side and POST it to /chat/transcribe.
  // This works on every browser that exposes MediaRecorder, including iOS
  // Safari installed as a PWA, where the Web Speech API silently fails.
  const [isRecording, setIsRecording] = useState(false);
  const [transcribing, setTranscribing] = useState(false);
  const [voiceSupported, setVoiceSupported] = useState(false);
  const [voiceError, setVoiceError] = useState<string | null>(null);
  // A notice over the composer after the server closed a conversation (403
  // partner_ai_consent_required): "closed" in the fresh conversation that
  // replaced an ordinary one; "dynamics" in a Dynamics conversation whose
  // partner is no longer sharing, with the offer of an ordinary one.
  // "consent": the member has not agreed to AI processing yet; a calm
  // notice with an Agree button instead of an error bubble in the thread.
  const [chatNotice, setChatNotice] = useState<
    | { kind: "closed" } | { kind: "dynamics"; sessionId: string } | { kind: "consent"; sessionId: string }
    // A voice message landed after the member moved on: its words are in
    // the conversation it was spoken in.
    | { kind: "voice_elsewhere"; sessionId: string; target: string }
    | null
  >(null);
  // Agreed in the sheet: the consent notice has done its job.
  useEffect(() => {
    const onChanged = (e: Event) => {
      if ((e as CustomEvent).detail?.granted) setChatNotice((n) => (n?.kind === "consent" ? null : n));
    };
    window.addEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
    return () => window.removeEventListener(AI_CONSENT_CHANGED_EVENT, onChanged);
  }, []);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  // A voice message under way: held from the moment the microphone is asked
  // for, through recording and stopping, until transcription has taken over
  // and finished (its text then sits in the composer, itself a draft) or
  // the recording is cancelled or fails. The update reload waits for it
  // (lib/draft-guard), so no recording is lost to a deploy.
  const voiceHoldRef = useRef<(() => void) | null>(null);
  // Where and for whom the voice message was started, captured when the
  // microphone is asked for and carried through recording, stopping and
  // transcription (Codex out15-5 #1): the conversation (sent as session_id,
  // so it lands there), the account and its token. Switching
  // conversation while recording never moves the words.
  const voiceOriginRef = useRef<{ session: string; acct: AccountGuard; token: string | null } | null>(null);
  const holdVoice = () => {
    if (!voiceHoldRef.current) voiceHoldRef.current = beginUnfinishedWork();
  };
  const releaseVoice = () => {
    const release = voiceHoldRef.current;
    voiceHoldRef.current = null;
    voiceOriginRef.current = null;
    release?.();
  };
  // Voice words that came back after the member moved to another
  // conversation, waiting for the one they were spoken in: put in its box
  // when it is opened again (never sent on their own). Counted as a draft
  // for the update reload.
  const voiceDraftsRef = useRef<Map<string, { text: string; transcript: string }>>(new Map());
  useEffect(() => registerDraftSource(() => voiceDraftsRef.current.size > 0), []);
  // Voice words whose conversation is gone (deleted here or elsewhere
  // before they arrived, or while they waited): offered to the member
  // wherever they are, to put in this box or to discard, never sent on
  // their own (Codex out16-5 #1). A draft until one of the two is chosen.
  const [voiceOrphan, setVoiceOrphan] = useState<{ text: string; transcript: string } | null>(null);
  const voiceOrphanRef = useRef<{ text: string; transcript: string } | null>(null);
  voiceOrphanRef.current = voiceOrphan;
  useEffect(() => registerDraftSource(() => voiceOrphanRef.current !== null), []);
  const offerOrphanVoice = (w: { text: string; transcript: string }) => {
    setVoiceOrphan((prev) => (prev
      ? { text: `${prev.text} ${w.text}`, transcript: `${prev.transcript} ${w.transcript}` }
      : w));
  };
  // A conversation that is still somewhere the member can open it: cached
  // here, or evicted to make room (read back from the server on opening).
  const conversationExists = (sid: string) => !!loadSession(sid) || !!getEvictedSummary(sid);
  // Words waiting for a conversation that is gone become the offer above.
  const parkedToOrphan = (sid: string) => {
    const parked = voiceDraftsRef.current.get(sid);
    if (!parked) return false;
    voiceDraftsRef.current.delete(sid);
    offerOrphanVoice(parked);
    setChatNotice((n) => (n?.kind === "voice_elsewhere" && n.target === sid ? null : n));
    return true;
  };
  const recoverOrphanVoice = () => {
    const w = voiceOrphanRef.current;
    if (!w) return;
    setVoiceOrphan(null);
    setInput((prev) => composerWithUnsent(w.text, prev));
    lastTranscriptRef.current = w.transcript;
    requestAnimationFrame(() => inputRef.current?.focus());
  };
  const discardOrphanVoice = () => setVoiceOrphan(null);
  // Back in the conversation the words were spoken in: they go into its box.
  useEffect(() => {
    const d = voiceDraftsRef.current.get(sessionId);
    if (!d) return;
    voiceDraftsRef.current.delete(sessionId);
    setInput((prev) => composerWithUnsent(d.text, prev));
    lastTranscriptRef.current = d.transcript;
    setChatNotice((n) => (n?.kind === "voice_elsewhere" && n.target === sessionId ? null : n));
  }, [sessionId]);
  const recordedChunksRef = useRef<Blob[]>([]);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const recordMimeRef = useRef<string>("audio/webm");
  const { token } = useAuth();
  const router = useRouter();
  const searchParams = useSearchParams();

  // Keep refs in sync so beforeunload and cleanup can read current values
  // without stale closures
  useEffect(() => { messagesRef.current = messages; }, [messages]);
  // The composer's unsent text counts as a draft for the update reload
  // (components/VersionCheck), however it got there: typed, or filled in by
  // voice transcription through state, which fires no input event. Sending
  // clears it, and so does the member removing it.
  const composerValueRef = useRef("");
  useEffect(() => { composerValueRef.current = input; }, [input]);
  useEffect(() => registerDraftSource(() => composerValueRef.current.trim() !== ""), []);
  useEffect(() => { tokenRef.current = token; }, [token]);
  // Active session id, read when a /chat reply lands so a reply to one
  // conversation never appends into another.
  const activeSessionRef = useRef<string>("");
  useEffect(() => { activeSessionRef.current = sessionId; }, [sessionId]);

  // The open conversation's partner, read by the sync handlers below. A
  // Dynamics conversation cached here before its transcript named the
  // partner learns it when the synced transcript arrives (another device
  // backfilled it), so follow-ups name the partner without a reopen.
  const soulRefRef = useRef<SoulRef | null>(null);
  useEffect(() => { soulRefRef.current = soulRef; }, [soulRef]);
  const adoptSyncedSoul = (merged: Message[]) => {
    const next = syncedSoulRef(soulRefRef.current, merged);
    if (!next) return;
    soulRefRef.current = next.ref;
    setSoulRef(next.ref);
    if (next.name) setSoulName(next.name);
  };

  // Cross-device chat sync. localStorage stays as the cache for instant
  // reads; the server is the source of truth. On mount (or whenever a
  // fresh token arrives), pull the member's sessions from the server and
  // upload what only this device has (lib/chat-sync).
  //
  // Until that sync has reconciled, nothing is uploaded: a device holding an
  // older copy of a conversation must not write it over the server's newer
  // one. Writes made meanwhile stay local and are queued; once the sync
  // lands, the open conversation is rebuilt from the server's copy plus
  // anything only this device has, and the queue is flushed. If the sync
  // fails (offline, server error), uploads stay off and it is retried with
  // a growing delay, and as soon as the device is back online.
  //
  // The account generation this render belongs to. Every write below checks
  // it, so work finishing after a sign-out never lands in the next account.
  const accountGen = useMemo(() => getAuthGeneration(), [token]);
  const syncReadyRef = useRef(false);
  const pendingPushRef = useRef<Set<string>>(new Set());
  const [syncAttempt, setSyncAttempt] = useState(0);
  const syncFailuresRef = useRef(0);
  useEffect(() => {
    bindChatSyncToAccount(accountGen);
    syncFailuresRef.current = 0;
  }, [accountGen]);
  useEffect(() => {
    if (!token) return;
    const gen = accountGen;
    syncReadyRef.current = false;
    let off = false;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    const retry = () => { if (!off) setSyncAttempt((n) => n + 1); };
    const onOnline = () => retry();
    syncSessionsFromServer(token, gen)
      .then(() => {
        if (off || !isCurrentGeneration(gen)) return;
        syncFailuresRef.current = 0;
        const sid = activeSessionRef.current;
        if (sid) {
          const reconciled = loadSession(sid);
          const current = messagesRef.current;
          const merged = mergeMessages(reconciled?.messages || [], current);
          adoptSyncedSoul(merged);
          if (!sameTranscript(merged, current)) {
            // The persist effect saves and uploads the merged transcript.
            setMessages(merged);
          }
        }
        syncReadyRef.current = true;
        const pending = Array.from(pendingPushRef.current);
        pendingPushRef.current.clear();
        for (const id of pending) {
          const local = loadSession(id);
          if (local) void pushSessionToServer(local, token, gen);
        }
      })
      .catch((e) => {
        if (off || !isCurrentGeneration(gen)) return;
        if (!(e instanceof ChatSyncUnavailable)) return;
        // Not reconciled: uploads stay off (writes are kept on this device
        // and marked unsent). Try again later, or when back online.
        const n = syncFailuresRef.current++;
        retryTimer = setTimeout(retry, Math.min(15_000 * 2 ** n, 300_000));
        window.addEventListener("online", onOnline);
      });
    return () => {
      off = true;
      if (retryTimer) clearTimeout(retryTimer);
      window.removeEventListener("online", onOnline);
    };
  }, [token, accountGen, syncAttempt]);

  // An upload pulled in turns another device added to the open
  // conversation: show them here too.
  useEffect(() => {
    const onMerged = (e: Event) => {
      const d = (e as CustomEvent).detail as { sessionId?: string; messages?: Message[] } | undefined;
      if (!d || !d.sessionId || d.sessionId !== activeSessionRef.current || !Array.isArray(d.messages)) return;
      const current = messagesRef.current;
      const merged = mergeMessages(d.messages, current);
      adoptSyncedSoul(merged);
      if (!sameTranscript(merged, current)) setMessages(merged);
    };
    window.addEventListener(CHAT_MERGED_EVENT, onMerged);
    return () => window.removeEventListener(CHAT_MERGED_EVENT, onMerged);
  }, []);

  // persistSession: local first (instant render), server second (cross-device).
  // Use this everywhere in the component instead of saveSession() so the
  // session log syncs to the server. Server failure is non-fatal; local
  // copy is always saved so the user never loses a message.
  const persistSession = (session: StoredSession) => {
    if (!token || !isCurrentGeneration(accountGen)) return;
    saveSession(session);
    if (syncReadyRef.current) {
      void pushSessionToServer(session, token, accountGen);
    } else {
      markUnsent(session.sessionId);
      pendingPushRef.current.add(session.sessionId);
    }
  };

  // ── Session-close synthesis ───────────────────────────────────────────────
  // Fires when the user navigates away or closes the tab. Uses fetch with
  // keepalive:true so the browser sends the request even as the page unloads.
  const triggerSessionSynthesis = useCallback(() => {
    const tok = tokenRef.current;
    const msgs = messagesRef.current;
    // The conversation being closed: read from the ref (this callback is
    // memoised, and is called before a switch commits the next session id).
    // The server checks this session's provenance before synthesizing and
    // keeps nothing without it.
    const sid = activeSessionRef.current;
    if (!tok || !msgs.length || !sid) return;

    // Only what belongs to the transcript: a message still waiting for its
    // outcome, interrupted or refused (too long, withdrawn) never reaches
    // memory synthesis, and does not count towards its minimum.
    const history = historyForServer(uploadableMessages(msgs));
    const userCount = history.filter((m) => m.role === "user").length;
    // Match the backend threshold: any 2+ turn exchange is worth synthesizing
    if (userCount < 2) return;

    const API_URL = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    fetch(`${API_URL}/chat/synthesize`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${tok}`,
      },
      body: JSON.stringify({ conversation_history: history, session_id: sid }),
      keepalive: true,
    }).catch(() => {});
  }, []);

  // Wire to beforeunload + pagehide + visibilitychange so mobile Safari and
  // Chrome both get a synthesis trigger when the tab is backgrounded or
  // closed. beforeunload alone is unreliable on iOS.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") triggerSessionSynthesis();
    };
    window.addEventListener("beforeunload", triggerSessionSynthesis);
    window.addEventListener("pagehide", triggerSessionSynthesis);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", triggerSessionSynthesis);
      window.removeEventListener("pagehide", triggerSessionSynthesis);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      triggerSessionSynthesis();
    };
  }, [triggerSessionSynthesis]);

  // ── Streaming effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!streamingId) return;
    const msg = messages.find((m) => m.id === streamingId);
    if (!msg) return;

    if (streamedLength >= msg.content.length) {
      setStreamingId(null);
      return;
    }

    // Reveal speed tuned to feel like fluent reading, not a typewriter.
    // Long messages reveal a handful of characters per tick so a 1500-char
    // response finishes in under 4 seconds instead of 15.
    const len = msg.content.length;
    let charsPerTick: number;
    let tickDelay: number;
    if (len > 1200) {
      charsPerTick = 5;
      tickDelay = 12;
    } else if (len > 600) {
      charsPerTick = 3;
      tickDelay = 12;
    } else {
      charsPerTick = 1;
      tickDelay = 10;
    }
    const timer = setTimeout(() => {
      setStreamedLength((l) => Math.min(l + charsPerTick, len));
    }, tickDelay);

    return () => clearTimeout(timer);
  }, [streamingId, streamedLength, messages]);

  return {
    accountGen, activeSessionRef, cancelHistoryReadBack, chatNotice, confirmDeleteId,
    conversationExists, discardOrphanVoice, historyError, historyOpening, holdVoice, input, inputRef,
    isMountedRef, isRecording, lang, lastTranscriptRef, mediaRecorderRef, mediaStreamRef, messages,
    offerOrphanVoice, parkedToOrphan, pastSessions, persistSession, readBackEvicted, recordMimeRef,
    recordedChunksRef, recoverOrphanVoice, releaseVoice, renameValue, renamingId, router,
    searchParams, sending, sendingRef, sessionId, setChatNotice, setConfirmDeleteId, setHistoryError,
    setHistoryOpening, setInput, setIsRecording, setMessages, setPastSessions, setRenameValue,
    setRenamingId, setSending, setSessionId, setShowHistory, setSoulBlueprint, setSoulName,
    setSoulRef, setStreamedLength, setStreamingId, setTranscribing, setVoiceError, setVoiceSupported,
    showHistory, soulBlueprint, soulRef, streamedLength, streamingId, suggestions,
    suggestionsArmedAt, t, token, tokenRef, transcribing, triggerSessionSynthesis, voiceDraftsRef,
    voiceError, voiceOriginRef, voiceOrphan, voiceSupported
  };
}
