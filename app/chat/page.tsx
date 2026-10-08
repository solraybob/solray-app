"use client";

import { useEffect, useMemo, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError, detailCode, trackRequest } from "@/lib/api";
import { voiceCrisisTurn, voiceResultAction } from "@/lib/voice-result";
import { captureAccount, getAuthGeneration, isCurrentGeneration, isStaleAccountError } from "@/lib/account-session";
import { AI_CONSENT_CHANGED_EVENT, AI_CONSENT_REQUIRED_CODE, openAiConsentSheet } from "@/lib/ai-consent";
import { mergeMessages, sameTranscript } from "@/lib/chat-merge";
import {
  CHAT_MERGED_EVENT,
  CHAT_STATUS_EVENT,
  isOwnStatusEvent,
  ChatSyncUnavailable,
  deleteSessionOnServer,
  getSessionIds,
  loadSession,
  beginSend,
  type SendLifecycle,
  markRenamePending,
  markUnsent,
  messageStatuses,
  noteNewSession,
  pushSessionToServer,
  removeCachedSession,
  storeTranscript,
  bindChatSyncToAccount,
  saveSession,
  saveSessionIds,
  settleMessage,
  forgetMessage,
  syncSessionsFromServer,
  updateStoredSession,
  uploadableMessages,
  type ChatMessage,
  type StoredSession as ChatStoredSession,
  type HistoryEntry,
  fetchSessionFromServer,
  getEvictedSummary,
  historySessions,
  restoreEvicted,
} from "@/lib/chat-sync";
import { readSoulCtx, resolveSoulCtx, writeSoulCtx, syncedSoulRef, type SoulCtx } from "@/lib/chat-soul";
import { registerDraftSource } from "@/lib/draft-guard";
import ReactMarkdown from "react-markdown";
import { useT, fill } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { errorText } from "@/lib/errors";
import { signalOracleReply } from "@/lib/native-push";
import { oracleErrorKey, ORACLE_ERROR_KEYS, isPartnerConsentRefusal, MESSAGE_TOO_LONG_CODE } from "@/lib/oracle-errors";
import {
  soulRequestFields, historyForServer, soulFromTranscript, voiceMessage, voiceTranscriptFor, composerWithUnsent,
  familyForTranscript, type FamilyRef, type SoulRef,
} from "@/lib/oracle-request";
import { Orb, Wordmark } from "@/components/Wordmark";
import CrisisCard from "@/components/CrisisCard";
import { asCrisisCard } from "@/lib/crisis-card";
import { answerFromChat, readChatRefusal, withAnswer } from "@/lib/chat-outcome";
import { accountKey, takeHandoff } from "@/lib/account-session";

// isError marks a transport-level error rather than an Oracle reply. It
// renders with distinct styling so the member is never misled into thinking
// error copy came from the Oracle.
type Message = ChatMessage;
type StoredSession = ChatStoredSession;

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSessionId() {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
  // Not on the server yet: its first upload is a plain write, no read first.
  noteNewSession(id);
  return id;
}

function todayLabel() {
  // The label names the conversation in history, so it follows the app
  // language (the same saved choice the language provider reads).
  let locale = "en-GB";
  try { if ((localStorage.getItem("solray_language") || "").startsWith("es")) locale = "es"; } catch { /* default */ }
  return new Date().toLocaleDateString(locale, {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// Device cache and server sync for chat history: lib/chat-sync.ts.

// Dynamics context (the other person's chart) belongs to the conversation it
// was opened for. Kept per session on this device (lib/chat-soul) so
// reopening that conversation restores it, and opening any other
// conversation clears it.
function soulRefOf(sc: SoulCtx | null): SoulRef | null {
  if (!sc) return null;
  return {
    connectionId: sc.connectionId ?? null, savedPersonId: sc.savedPersonId ?? null, blueprint: sc.blueprint ?? null,
    family: sc.family ?? null,
  };
}
function getSoulCtx(sessionId: string, messages?: Message[]): SoulCtx | null {
  // A saved person who was not confirmed yet when the reading began is
  // named by their confirmed id once the server has them.
  const local = resolveSoulCtx(readSoulCtx(sessionId));
  if (local) return local;
  // Not opened on this device (synced from another one, or after a
  // reinstall): the transcript's opening message names the partner.
  const fromTranscript = soulFromTranscript(messages);
  return fromTranscript ? { ...fromTranscript, blueprint: null } : null;
}
function setSoulCtx(sessionId: string, ctx: SoulCtx | null) {
  writeSoulCtx(sessionId, ctx);
}

// ─── Text renderer ──────────────────────────────────────────────────────────

function MessageContent({ content, showCursor, isUser }: { content: string; showCursor?: boolean; isUser?: boolean }) {
  // Transcript style: no bubble, no border, no background. The user
  // message reads as the question (the quiet ink tier); the Oracle's
  // reply reads as the answer (full presence, primary color). Same
  // font size on both so the page reads as a continuous conversation
  // the way Claude.ai does, not a chat app.
  const wrapClass = isUser
    ? "font-body text-text-secondary leading-relaxed"
    : "font-body text-text-primary leading-relaxed";

  // While streaming, render plain text. react-markdown re-parses the entire
  // string on every reveal tick, which is a re-parse storm on long replies
  // and the main source of jank in chat. Plain text during the stream is
  // cheap; markdown is parsed exactly once when the message finalizes.
  if (showCursor) {
    return (
      <div className={wrapClass} style={{ fontSize: 17 }}>
        <span className="whitespace-pre-wrap">{content}</span>
        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
      </div>
    );
  }

  return (
    <div className={wrapClass} style={{ fontSize: 17 }}>
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold">{children}</strong>
          ),
          h1: ({ children }) => (
            <h1 className="font-heading text-xl text-text-primary mb-2 mt-3 first:mt-0" style={{ fontWeight: 700 }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-heading text-lg text-text-primary mb-2 mt-3 first:mt-0" style={{ fontWeight: 700 }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-heading text-base text-amber-sun mb-1 mt-2 first:mt-0">{children}</h3>
          ),
          em: ({ children }) => (
            <em className="">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li>{children}</li>
          ),
        }}
      >
        {content}
      </ReactMarkdown>
      {showCursor && (
        <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />
      )}
    </div>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

function ChatPageInner() {
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
  }, [lang]);
  const [sending, setSending] = useState(false);
  // Read synchronously by the voice path: set the moment a send is
  // accepted, cleared when it settles.
  const sendingRef = useRef(false);
  useEffect(() => { sendingRef.current = sending; }, [sending]);
  // A crisis voice message that arrived while another message was still
  // sending: it waits here (and in the box) and goes out as soon as that
  // send settles. Never dropped.
  const pendingVoiceRef = useRef<{ text: string; transcript: string; session: string } | null>(null);
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
        // Gone on the server: the row goes whichever row is current.
        setPastSessions((prev) => prev.filter((s) => s.sessionId !== sid));
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
    { kind: "closed" } | { kind: "dynamics"; sessionId: string } | { kind: "consent"; sessionId: string } | null
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

  // ── Build a greeting message ──────────────────────────────────────────────
  // Returns null when the forecast endpoint fails, so the caller can
  // skip rendering a fake first line rather than ship invented Oracle
  // copy. The user starts the conversation plainly in that case.
  const buildGreeting = useCallback(
    async (forToken: string | null): Promise<Message | null> => {
      let content = "";

      try {
        const data = await apiFetch("/forecast/today", {}, forToken);

        // Use the AI morning greeting if it exists and is specific (more than 10 words)
        const mg: string = data?.morning_greeting || "";
        const wordCount = mg.trim().split(/\s+/).length;
        if (mg && wordCount > 10) {
          content = mg;
        } else {
          // Composed from i18n keys, with chart vocabulary run through tx(),
          // so a Spanish member gets a Spanish first line, never English.
          const tr = t;
          const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
          const term = (s: string) => (lang === "en" ? s : tx(cap(s), lang));
          // Build a rich greeting from today's transits + tightest aspect
          let sunSign = "";
          let moonSign = "";

          if (Array.isArray(data?.transits)) {
            const sunT = data.transits.find(
              (t: { planet?: string; name?: string }) =>
                t.planet?.toLowerCase() === "sun" || t.name?.toLowerCase() === "sun"
            );
            const moonT = data.transits.find(
              (t: { planet?: string; name?: string }) =>
                t.planet?.toLowerCase() === "moon" || t.name?.toLowerCase() === "moon"
            );
            sunSign = (sunT as { sign?: string })?.sign || "";
            moonSign = (moonT as { sign?: string })?.sign || "";
          } else if (data?.transits && typeof data.transits === "object") {
            const t = data.transits as Record<string, { sign?: string }>;
            sunSign = t.sun?.sign || t.Sun?.sign || "";
            moonSign = t.moon?.sign || t.Moon?.sign || "";
          }

          // Find the tightest (most exact) natal aspect active today
          let aspectStr = "";
          let aspectQuestion = "";
          if (Array.isArray(data?.aspects) && data.aspects.length > 0) {
            const sorted = [...data.aspects].sort(
              (a: { orb?: number }, b: { orb?: number }) =>
                (a.orb ?? 99) - (b.orb ?? 99)
            );
            const top = sorted[0] as {
              planet?: string;
              transiting_planet?: string;
              aspect?: string;
              type?: string;
              target?: string;
              natal_planet?: string;
              orb?: number;
            };
            const planet = top.planet || top.transiting_planet || "";
            const aspectType = top.aspect || top.type || "";
            const target = top.target || top.natal_planet || "";
            if (planet && aspectType && target) {
              aspectStr = tr("chat.greet_aspect")
                .replace("{planet}", term(planet))
                .replace("{aspect}", lang === "en" ? aspectType : term(aspectType).toLowerCase())
                .replace("{target}", term(target));
              // Frame a personal question based on the planet involved
              const QUESTION_PLANETS = ["mars", "venus", "mercury", "jupiter", "saturn", "uranus", "neptune", "pluto", "moon", "sun"];
              const pKey = planet.toLowerCase();
              aspectQuestion = QUESTION_PLANETS.includes(pKey)
                ? tr(`chat.greet_q_${pKey}`)
                : tr("chat.greet_q_default");
            }
          }

          // Compose the greeting
          const skyParts = [
            sunSign && tr("chat.greet_sun").replace("{sign}", term(sunSign)),
            moonSign && tr("chat.greet_moon").replace("{sign}", term(moonSign)),
          ]
            .filter(Boolean)
            .join(", ");

          if (aspectStr) {
            const skyIntro = skyParts ? `${skyParts}. ` : "";
            content = `${skyIntro}${aspectStr} ${aspectQuestion}`;
          } else if (skyParts) {
            content = tr("chat.greet_sky_only").replace("{sky}", skyParts);
          } else {
            content = tr("chat.greet_plain");
          }
        }

      } catch {
        // Forecast API failed. The previous version of this branch
        // composed a synthetic Oracle greeting from cached profile
        // data ("Virgo Sun, Pisces Moon. The morning is yours. What
        // needs clarity today?"). That is invented Oracle copy
        // produced specifically because the live sky failed, which
        // violates the "fail honestly, never fictionally" rule. We
        // now skip the greeting entirely on forecast failure and let
        // the user start the conversation plainly. No fake first
        // line. Caught by Codex audit P1.2.
        return null;
      }

      return {
        id: "greeting",
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      };
    },
    [lang, t]
  );

  // ── Initialise session on mount ───────────────────────────────────────────
  // A failed automatic opening (the "Go deeper" question, a Dynamics
  // opening), handled as an ordinary send's failure: a length refusal is
  // refused (never uploaded) and, in the open conversation, goes back to the
  // box; a care turn's support card is drawn first; any other failure gets
  // its note after the message. Out of sight, everything is kept in the
  // conversation's saved copy (the refused message with Edit).
  const openingFailed = (err: unknown, o: {
    sid: string; life: SendLifecycle; userMsg: Message; before: Message[];
    land: (next: Message[]) => void; note: string;
  }) => {
    const tooLong = err instanceof ApiError && err.code === MESSAGE_TOO_LONG_CODE;
    if (tooLong && isCurrentGeneration(accountGen)) o.life.refused();
    // The account changed while waiting: nothing to show or store.
    if (isStaleAccountError(err)) return;
    const failedAt = Date.now();
    const { support } = readChatRefusal(err, failedAt);
    const cards = support ? [support] : [];
    const visible = isMountedRef.current && activeSessionRef.current === o.sid;
    const note = (content: string): Message => ({
      id: (failedAt + 2).toString(),
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      isError: true,
    });
    if (tooLong && visible) {
      o.land([...o.before, ...cards, note(t("oracle_errors.message_too_long_kept"))]);
      setInput((prev) => composerWithUnsent(o.userMsg.content, prev));
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (tooLong) {
      o.land([...o.before, o.userMsg, ...cards]);
      return;
    }
    o.land([...o.before, o.userMsg, ...cards, note(o.note)]);
  };

  useEffect(() => {
    if (!token) return;

    async function init() {
      // Check for compatibility context injected from Souls page
      // Check for profile-element prompt (from Ask buttons on profile page)
      // Handoffs are taken (read and removed) only when this tab still
      // belongs to the member who wrote them (lib/account-session).
      const profilePromptRaw = takeHandoff("solray_chat_prompt");
      if (profilePromptRaw) {
        try {
          const ctx = JSON.parse(profilePromptRaw) as { topic: string; question: string };
          const sid = generateSessionId();
          setSessionId(sid);
          const userMsg: Message = {
            id: `${Date.now()}`,
            role: "user",
            content: ctx.question,
            timestamp: new Date().toISOString(),
          };
          // Targeted entry (Go deeper on a breakthrough, Ask buttons on
          // profile/cycles): open directly on the topic. No morning greeting
          // prepended; that belongs only to a cold open of the chat tab.
          // Previously the day's italic greeting sat above the user's real
          // question, which read as the wrong context.
          const seed = [userMsg];
          const newSession: StoredSession = {
            sessionId: sid,
            date: todayLabel(),
            customName: ctx.topic,
            messages: seed,
          };
          // The same life as an ordinary send: pending (never uploaded)
          // until /chat answers, before it is shown or saved.
          const life = beginSend(userMsg.id);
          persistSession(newSession);
          setMessages(seed);
          // A seeded question is never a Dynamics conversation.
          setSoulBlueprint(null);
          setSoulName(null);
          setSoulRef(null);
          setSending(true);
          // The member may open another conversation before this answer
          // arrives. Then it is stored with its own conversation instead of
          // being written over the one on screen.
          const land = (next: Message[], stream?: Message) => {
            if (activeSessionRef.current === sid) {
              setMessages(next);
              if (stream) {
                setStreamedLength(0);
                setStreamingId(stream.id);
              }
            }
            persistSession({ ...newSession, messages: next });
          };
          try {
            const data = await apiFetch("/chat", {
              method: "POST",
              body: JSON.stringify({ message: ctx.question, conversation_history: [], session_id: sid }),
            }, token);
            life.answered();
            // Honest empty-response handling, parallel to sendMessage.
            // The previous version of this branch fell back to "I
            // hear you." which is invented Oracle copy. Caught by
            // Codex audit P2.4.
            // The same reading of the answer as an ordinary send
            // (lib/chat-outcome): a crisis or support card is kept whole,
            // with its call and text buttons, and a crisis turn tags the
            // question too. Only the Oracle's own words stream.
            const answer = answerFromChat(data, t("chat.error_no_response"));
            const next = withAnswer(seed, userMsg.id, answer);
            land(next, answer.reply.crisis || answer.reply.isError ? undefined : answer.reply);
          } catch (err) {
            // Surface the failure as a visible error message rather
            // than silently swallowing it. Previous version left the
            // user with their seeded question and no honest signal
            // that anything failed.
            openingFailed(err, {
              sid, life, userMsg, before: [], land,
              note: t(readChatRefusal(err).noteKey),
            });
          } finally {
            life.finish(isMountedRef.current && activeSessionRef.current === sid && isCurrentGeneration(accountGen));
            if (isMountedRef.current) setSending(false);
          }
          return;
        } catch {
          // fall through
        }
      }

      const isCompat = searchParams?.get("compat") === "1";
      if (isCompat) {
        try {
          const raw = takeHandoff("solray_compat_context");
          if (raw) {
            const ctx = JSON.parse(raw) as {
              soulName: string;
              introMessage: string;
              soulBlueprint?: Record<string, unknown> | null;
              soulConnectionId?: string | null;
              savedPersonId?: string | null;
              // A saved person the server had not confirmed yet.
              localPersonId?: string | null;
              // A family reading: everyone else selected, by reference.
              familyPartners?: FamilyRef[] | null;
            };
            const family: FamilyRef[] = Array.isArray(ctx.familyPartners)
              ? ctx.familyPartners.filter((f) => f && (f.connectionId || f.savedPersonId))
              : [];

            // Hoist the soul context into component state so every
            // follow-up message in this session re-passes the blueprint
            // to the backend. Without this, only the first message had
            // soul context and the Oracle "forgot" their chart on msg 2+.
            setSoulBlueprint(ctx.soulBlueprint ?? null);
            setSoulName(ctx.soulName ?? null);
            const compatRef: SoulRef = {
              connectionId: ctx.soulConnectionId ?? null,
              savedPersonId: ctx.savedPersonId ?? null,
              blueprint: ctx.soulBlueprint ?? null,
              family,
            };
            setSoulRef(compatRef);

            const sid = generateSessionId();
            setSessionId(sid);

            const greeting: Message = {
              id: "greeting",
              role: "assistant",
              content: fill(t("prompts.compat_opening"), { name: ctx.soulName }),
              timestamp: new Date().toISOString(),
              // Travels with the transcript to the member's other devices,
              // so follow-ups there still name who the reading is with.
              ...((ctx.soulConnectionId || ctx.savedPersonId) ? {
                soul: {
                  name: ctx.soulName ?? null,
                  connection_id: ctx.soulConnectionId ?? null,
                  saved_person_id: ctx.savedPersonId ?? null,
                  ...(family.length > 0 ? { family: familyForTranscript(family) } : {}),
                },
              } : {}),
            };
            const userMsg: Message = {
              id: `${Date.now()}`,
              role: "user",
              content: ctx.introMessage,
              timestamp: new Date().toISOString(),
            };

            const newSession: StoredSession = {
              sessionId: sid,
              date: todayLabel(),
              customName: fill(t("prompts.compat_session"), { name: ctx.soulName }),
              messages: [greeting, userMsg],
            };
            // The same life as an ordinary send (see the seeded question).
            const life = beginSend(userMsg.id);
            // The partner's chart belongs to this conversation only.
            // An unconfirmed saved person's local id is kept too: once the
            // server confirms them, the upload writes their id into this
            // transcript (lib/chat-soul withSoulBackfill).
            setSoulCtx(sid, {
              name: ctx.soulName ?? null,
              blueprint: ctx.soulBlueprint ?? null,
              connectionId: ctx.soulConnectionId ?? null,
              savedPersonId: ctx.savedPersonId ?? null,
              localPersonId: ctx.localPersonId ?? null,
              family,
            });
            persistSession(newSession);
            setMessages([greeting, userMsg]);
            setSending(true);
            // Same guard as a normal send: if another conversation is open by
            // the time the reading arrives, it is stored with its own
            // conversation, never appended to the one on screen.
            const land = (next: Message[], stream?: Message) => {
              if (activeSessionRef.current === sid) {
                setMessages(next);
                if (stream) {
                  setStreamedLength(0);
                  setStreamingId(stream.id);
                }
              }
              persistSession({ ...newSession, messages: next });
            };

            // Auto-send the compatibility message
            try {
              const data = await apiFetch(
                "/chat",
                {
                  method: "POST",
                  body: JSON.stringify({
                    message: ctx.introMessage,
                    conversation_history: [],
                    session_id: sid,
                    ...soulRequestFields(compatRef),
                  }),
                },
                token
              );
              life.answered();
              // Read as an ordinary send reads it (lib/chat-outcome): a
              // crisis or support card is kept whole and drawn without
              // streaming; a crisis turn tags the opening message too.
              const answer = answerFromChat(data, t("chat.error_no_response"));
              // An empty reply is a failure, not a license to invent one.
              if (answer.reply.isError) throw new Error("empty souls reply");
              const next = withAnswer(newSession.messages, userMsg.id, answer);
              land(next, answer.reply.crisis ? undefined : answer.reply);
            } catch (err) {
              // The previous version of this branch shipped an
              // Oracle-flavored fallback string for the souls compat
              // flow that asserted vague mirror-energy-grow content
              // about the user and the connection. Especially
              // dangerous in Souls because users trust compat
              // readings as chart-grounded. Now surfaces a visible
              // error message in the same isError style as the main
              // chat path. Caught by Codex audit P1.1.
              openingFailed(err, {
                sid, life, userMsg, before: [greeting], land,
                note: oracleErrorKey(err)
                  ? t(oracleErrorKey(err) as string)
                  : fill(t("prompts.compat_failed"), { name: ctx.soulName }),
              });
            } finally {
              life.finish(isMountedRef.current && activeSessionRef.current === sid && isCurrentGeneration(accountGen));
              if (isMountedRef.current) setSending(false);
            }
            return;
          }
        } catch {
          // Fall through to normal init
        }
      }

      const ids = getSessionIds();
      const lastId = ids[0];
      const last = lastId ? loadSession(lastId) : null;

      if (last && last.messages.length > 0) {
        setSessionId(last.sessionId);
        setMessages(last.messages);
        const sc = getSoulCtx(last.sessionId, last.messages);
        setSoulBlueprint(sc?.blueprint ?? null);
        setSoulName(sc?.name ?? null);
        setSoulRef(soulRefOf(sc));
      } else {
        const sid = generateSessionId();
        setSessionId(sid);
        // Open on the quiet anchor (the messages.length === 0 state), not an
        // auto-generated greeting. The Oracle speaks once the person does.
        const newSession: StoredSession = {
          sessionId: sid,
          date: todayLabel(),
          messages: [],
        };
        persistSession(newSession);
        setMessages([]);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, buildGreeting]);

  // ── Persist messages whenever they change ─────────────────────────────────
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const existing = loadSession(sessionId);
    persistSession({
      sessionId,
      date: todayLabel(),
      customName: existing?.customName,
      messages,
    });
  }, [messages, sessionId]);

  // Messages without an answer kept on this device (lib/chat-sync): sent
  // just before the app closed or Chat was left ("interrupted"), or refused
  // as too long out of sight ("refused"). Read again whenever the thread or
  // a send changes.
  const [statusTick, setStatusTick] = useState(0);
  // A status changed out of sight (a send from a page since left was
  // refused, or released as interrupted): redraw, for this account only.
  useEffect(() => {
    const onStatus = (e: Event) => { if (isOwnStatusEvent(e)) setStatusTick((n) => n + 1); };
    window.addEventListener(CHAT_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(CHAT_STATUS_EVENT, onStatus);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const msgStatuses = useMemo(() => messageStatuses(), [messages, sending, statusTick]);

  // ── Auto-scroll (only if user hasn't scrolled up) ────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The ref is the source of truth for the streaming tick. State is just
  // for re-rendering the "Scroll to bottom" pill. Streaming fires every
  // 5-10ms; React state updates are batched, so a state-only read can be
  // stale by several ticks and yank the user back down. The ref updates
  // synchronously inside the touchstart listener, so the very next
  // streaming tick reads the new value and bails. State follows for UI.
  const autoScrollRef = useRef(true);
  const [autoScroll, setAutoScroll] = useState(true);
  // Jump-to-bottom pill visibility, driven by ACTUAL scroll position (not the
  // autoScroll flag, which a stray tap flips, making the pill appear while
  // you're already at the bottom). Kept separate so the streaming-pin logic
  // below stays untouched.
  const [showJumpButton, setShowJumpButton] = useState(false);
  const isProgrammaticScroll = useRef(false);

  const setAutoScrollBoth = useCallback((v: boolean) => {
    autoScrollRef.current = v;
    setAutoScroll(v);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onUserIntent = () => {
      // Sync write so the next streaming tick (which may fire within
      // the same frame) sees this immediately. State follows.
      autoScrollRef.current = false;
      setAutoScroll(false);
    };
    el.addEventListener("touchstart", onUserIntent, { passive: true });
    el.addEventListener("wheel",      onUserIntent, { passive: true });
    el.addEventListener("mousedown",  onUserIntent, { passive: true });

    const onScroll = () => {
      if (isProgrammaticScroll.current) return;
      // Re-enable auto-scroll only when the user has explicitly scrolled
      // all the way back to the bottom themselves. Earlier this used a
      // 30px threshold, which snapped the user back down whenever their
      // momentum scroll briefly crossed near-bottom mid-drag, making
      // scroll-up during streaming feel broken. With a 4px floor (and
      // the explicit "jump to bottom" button still available below)
      // they stay in control of their position the moment they touch
      // the screen.
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (dist <= 4) {
        autoScrollRef.current = true;
        setAutoScroll(true);
        setShowJumpButton(false);
      } else if (dist > 80) {
        // Genuinely scrolled away: show the pill. Hysteresis (show >80,
        // hide <=4) prevents flicker mid-drag.
        setShowJumpButton(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onUserIntent);
      el.removeEventListener("wheel",      onUserIntent);
      el.removeEventListener("mousedown",  onUserIntent);
      el.removeEventListener("scroll",     onScroll);
    };
  }, []);

  useEffect(() => {
    // Read the REF, not the state. State may be stale by 1-N ticks.
    if (!autoScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    isProgrammaticScroll.current = true;
    el.scrollTop = el.scrollHeight;
    const t = setTimeout(() => { isProgrammaticScroll.current = false; }, 50);
    return () => clearTimeout(t);
  }, [messages, streamedLength]);

  const resetScroll = useCallback(() => {
    setAutoScrollBoth(true);
    setShowJumpButton(false);
  }, [setAutoScrollBoth]);

  // ── New Chat ──────────────────────────────────────────────────────────────
  const startNewChat = useCallback(async () => {
    // Never switch sessions while a reply is in flight.
    if (!token || sending) return;
    // A History read-back still on its way no longer opens anything.
    cancelHistoryReadBack();
    // Synthesize the session we're leaving so memory carries forward into
    // the new one. Without this, clicking "+ New" loses everything that
    // wasn't already checkpointed in-session.
    triggerSessionSynthesis();
    setChatNotice(null);
    // A fresh chat is NOT a compat session unless the user re-enters via
    // Souls. Clear any cached soul context so we don't leak Rut's chart
    // into Bob's regular Higher Self chat.
    setSoulBlueprint(null);
    setSoulName(null);
    setSoulRef(null);
    const sid = generateSessionId();
    setSessionId(sid);
    // A new chat opens on the quiet anchor (the empty state); the Oracle
    // speaks once the person does, no auto-generated greeting.
    const newSession: StoredSession = {
      sessionId: sid,
      date: todayLabel(),
      messages: [],
    };
    persistSession(newSession);
    setMessages([]);
    setShowHistory(false);
  }, [token, sending, buildGreeting, triggerSessionSynthesis, cancelHistoryReadBack]);

  // ── Load past session ─────────────────────────────────────────────────────
  const loadPastSession = useCallback((sid: string) => {
    if (sending) return;
    // Synthesize the session we're leaving so recent context is not lost
    // when we hop back into an older one.
    const session = loadSession(sid);
    if (!session && getEvictedSummary(sid)) {
      // Evicted from this device to make room: read it back from the
      // server first, with its own loading and failure state in History.
      // (No synthesis yet: the conversation on screen stays open until
      // this one is here, and only if it is still the one chosen.)
      readBackEvicted(sid, (id) => openLoadedRef.current(id));
      return;
    }
    // Any other choice supersedes a read-back still on its way.
    cancelHistoryReadBack();
    triggerSessionSynthesis();
    if (session) {
      setChatNotice(null);
      setSessionId(session.sessionId);
      setMessages(session.messages);
      // Restore this conversation's own Dynamics context, or clear the one
      // left over from the conversation we are leaving.
      const sc = getSoulCtx(session.sessionId, session.messages);
      setSoulBlueprint(sc?.blueprint ?? null);
      setSoulName(sc?.name ?? null);
      setSoulRef(soulRefOf(sc));
      setShowHistory(false);
      setRenamingId(null);
      setHistoryOpening(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSessionSynthesis, sending, accountGen, t, cancelHistoryReadBack]);
  // The newest loadPastSession, for a read-back that lands later.
  const openLoadedRef = useRef(loadPastSession);
  openLoadedRef.current = loadPastSession;

  // ── Open history panel ────────────────────────────────────────────────────
  const openHistory = useCallback(() => {
    // Cached conversations, and those evicted from this device's cache
    // (listed from their summary, read back from the server on opening).
    setPastSessions(historySessions());
    setHistoryOpening(null);
    setHistoryError(null);
    setShowHistory(true);
    setRenamingId(null);
    setConfirmDeleteId(null);
  }, []);

  // ── Rename helpers ────────────────────────────────────────────────────────
  const startRename = useCallback(
    (e: React.MouseEvent, sid: string, currentName: string) => {
      e.stopPropagation();
      // An evicted conversation is read back first (its rename travels
      // with the transcript, through the pending-rename upload); the
      // editor opens once it is here, if still wanted.
      if (!loadSession(sid) && getEvictedSummary(sid)) {
        setRenamingId(null);
        readBackEvicted(sid, (id) => {
          setRenamingId(id);
          setRenameValue(currentName);
        });
        return;
      }
      cancelHistoryReadBack();
      setRenamingId(sid);
      setRenameValue(currentName);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountGen, t, cancelHistoryReadBack]
  );

  const commitRename = useCallback(
    (sid: string) => {
      const session = loadSession(sid);
      if (!session) {
        // Never a silent no-op: the editor closes and says why.
        setRenamingId(null);
        setHistoryError(t("chat.history_load_failed"));
        return;
      }
      const newName = renameValue.trim();
      const updated: StoredSession = {
        ...session,
        customName: newName || undefined,
      };
      // Only a rename made here holds its name against the server's copy.
      markRenamePending(sid);
      persistSession(updated);
      setPastSessions((prev) =>
        prev.map((s) => (s.sessionId === sid ? updated : s))
      );
      setRenamingId(null);
    },
    [renameValue, t]
  );

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback(
    (e: React.MouseEvent, sid: string) => {
      e.stopPropagation();
      if (sending) return;
      setHistoryError(null);
      // Snapshot so a failed server delete can be undone locally.
      const snapshot = loadSession(sid);
      const evictedSnap = snapshot ? null : getEvictedSummary(sid);
      const prevIds = getSessionIds();
      // Local removal first (instant UX), then propagate to server so the
      // session doesn't reappear on the next sync from another device.
      removeCachedSession(sid);
      setSoulCtx(sid, null);
      const ids = prevIds.filter((id) => id !== sid);
      saveSessionIds(ids);
      setPastSessions((prev) => prev.filter((s) => s.sessionId !== sid));
      if (token) {
        // The answer may land after a sign-out (and the next account's
        // sign-in): then it belongs to nobody on this device and must not
        // write the old conversation back into the shared cache.
        const acct = captureAccount();
        const restore = () => {
          if (!acct.live) return;
          if (snapshot) {
            storeTranscript(snapshot);
            markUnsent(sid);
          } else if (evictedSnap) {
            restoreEvicted(sid, evictedSnap);
          }
          const current = getSessionIds();
          if ((snapshot || evictedSnap) && !current.includes(sid)) {
            const at = Math.max(0, prevIds.indexOf(sid));
            current.splice(Math.min(at, current.length), 0, sid);
            saveSessionIds(current);
          }
          if (!isMountedRef.current) return;
          setPastSessions(historySessions());
          setHistoryError(t("chat.delete_failed"));
        };
        // Runs after any upload already queued for this conversation, so a
        // late upload can never recreate it on the server.
        void deleteSessionOnServer(sid, token, acct.generation).then((gone) => {
          if (!gone) restore();
        });
      }
      // If we just deleted the active session, start fresh
      if (sid === sessionId) {
        startNewChat();
      }
    },
    [sessionId, startNewChat, token, sending, t]
  );

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
        updateStoredSession(sentSessionId, accountGen, (saved) => withAnswer(saved, userMsg.id, answer));
        return;
      }
      // A conversation that had no id yet gets the one the server issued,
      // and keeps it for every later turn (care mode and provenance live
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
      // The fixed crisis card (or the support card): drawn whole as a card
      // with call and text buttons, never typed out and never offered as
      // something "that landed".
      const card = asCrisisCard(data.crisis_card) || asCrisisCard(data.support_card);
      if (card) {
        // A crisis turn: both messages are tagged, so they stay in the
        // member's own transcript but never go back to the AI.
        const crisisTurn = data.crisis_turn === true || card.variant === "standard" || card.variant === "urgent";
        const cardMsg: Message = {
          id: (Date.now() + 1).toString(),
          role: "assistant",
          content,
          timestamp: new Date().toISOString(),
          crisis: card,
          ...(crisisTurn ? { safety: "crisis" as const } : {}),
        };
        setMessages((prev) => [
          ...prev.map((m) => (crisisTurn && m.id === userMsg.id ? { ...m, safety: "crisis" as const } : m)),
          cardMsg,
        ]);
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
      // support card any refusal after the safety gate may carry (also one
      // whose detail used to be a plain sentence and is now an object), the
      // note after it, and whether it is the subscription refusal.
      const refusal = readChatRefusal(err);
      const refusalSupport = refusal.support;
      const offscreen = !isMountedRef.current || activeSessionRef.current !== sentSessionId;
      if (offscreen && (tooLong || refusalSupport)) {
        // Out of sight: the message stays in its conversation's saved copy
        // (a length refusal marked refused, with a way back to the box;
        // another failure as interrupted, with Send again), and the support
        // card, if any, goes in after it.
        if (refusalSupport) {
          updateStoredSession(sentSessionId, accountGen, (saved) =>
            saved.some((m) => m.id === refusalSupport.id) ? saved : [...saved, refusalSupport]);
        }
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
        // A care turn: the server sends the soft support card with the
        // refusal. It goes in the thread first, whatever happens next.
        const partnerSupportMsg: Message | null = refusalSupport;
        if (partnerSupportMsg && sentSoulRef) setMessages((prev) => [...prev, partnerSupportMsg]);
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
        // The support card, if the server sent one, opens the fresh one.
        const freshMessages = partnerSupportMsg ? [partnerSupportMsg] : [];
        persistSession({ sessionId: freshId, date: todayLabel(), messages: freshMessages });
        setMessages(freshMessages);
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
        // Too long to send (a long voice note, say): the server read it for
        // safety first and nothing else happened. The words leave the
        // thread and go back into the box, whole, to be shortened; the
        // spoken part keeps travelling as voice_transcript.
        if (tooLong) {
          // Refused (recorded above): never uploaded, whatever this device
          // saves meanwhile. A care turn's support card goes in the thread
          // first, before the note.
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== userMsg.id),
            ...(refusalSupport ? [refusalSupport] : []),
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
        // A member without AI consent who may be struggling: the server
        // sends a short support card with their line alongside the consent
        // prompt. It goes in the thread first.
        const noteAt = Date.now();
        if (refusalSupport) setMessages((prev) => [...prev, refusalSupport]);
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
      // Only the bare subscription refusal goes to the paywall; a 403 that
      // carries a support card (a connection not accepted, say) is a
      // refusal of this reading, said in the thread below.
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
      // be reached. Never the server's raw text. A support card goes first.
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: t(refusal.noteKey),
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, ...(refusalSupport ? [refusalSupport] : []), errMsg]);
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

  // Latest sendMessage for callbacks created once (the voice transcriber).
  const sendMessageRef = useRef(sendMessage);
  sendMessageRef.current = sendMessage;

  // A crisis voice message that waited for another send goes out as soon
  // as that send settles, in the conversation it was spoken in. Elsewhere
  // its words stay in the box for the member to send.
  useEffect(() => {
    if (sending) return;
    const p = pendingVoiceRef.current;
    if (!p) return;
    pendingVoiceRef.current = null;
    if (activeSessionRef.current !== p.session) return;
    void sendMessageRef.current(p.text, { voiceTranscript: p.transcript });
  }, [sending]);

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

  // Tear down recorder + mic stream on unmount so the iOS mic indicator
  // doesn't linger after the user navigates away mid-recording. Covers
  // both the web MediaRecorder path AND the native Capacitor
  // VoiceRecorder path; previously only the web path was cleaned up,
  // so a native recording session could keep the mic indicator alive
  // after leaving chat. Caught by Codex audit P2.6.
  useEffect(() => {
    return () => {
      try {
        if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
          mediaRecorderRef.current.stop();
        }
      } catch {
        // ignore
      }
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;

      // Cancel any active native recording. Fire-and-forget; we are on
      // the unmount path and cannot await. The plugin call is
      // idempotent, calling cancel when nothing is recording is a
      // no-op.
      if (nativeRecordingRef.current) {
        nativeRecordingRef.current = false;
        void import("@/lib/native-voice").then(({ cancelNativeRecording }) => {
          cancelNativeRecording().catch(() => {});
        }).catch(() => {});
      }
    };
  }, []);

  // Pick a MediaRecorder mimeType the current browser actually supports.
  // Order matters: Chrome/Android prefer webm/opus, iOS Safari only does mp4.
  const pickRecorderMime = useCallback((): string => {
    const candidates = [
      "audio/webm;codecs=opus",
      "audio/webm",
      "audio/mp4;codecs=mp4a.40.2",
      "audio/mp4",
      "audio/aac",
    ];
    for (const m of candidates) {
      if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported?.(m)) {
        return m;
      }
    }
    return ""; // let the browser default
  }, []);

  // Send a recorded blob to the backend Whisper endpoint and append the
  // transcript to whatever the user has typed so far.
  const transcribeBlob = useCallback(async (blob: Blob, mime: string) => {
    if (!blob.size) {
      setTranscribing(false);
      return;
    }
    const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
    const ext = mime.includes("mp4") || mime.includes("aac") ? "m4a" : "webm";
    const form = new FormData();
    form.append("file", blob, `voice.${ext}`);

    setTranscribing(true);
    // Who and where this was spoken: checked again when the text lands.
    const acct = captureAccount();
    const spokenIn = activeSessionRef.current;
    // The conversation it was spoken in: a crisis transcript puts it in
    // care mode on the server straight away.
    if (spokenIn) form.append("session_id", spokenIn);
    const landing = (crisis: boolean) => voiceResultAction({
      sameAccount: acct.live,
      mounted: isMountedRef.current,
      sameConversation: activeSessionRef.current === spokenIn,
      crisis,
    });
    try {
      const authToken = tokenRef.current || token;
      const { res, body } = await trackRequest(async () => {
        const r = await fetch(`${apiUrl}/chat/transcribe`, {
          method: "POST",
          headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
          body: form,
        });
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const b: any = await r.json().catch(() => null);
        return { res: r, body: b };
      });
      if (landing(false) === "drop") return;
      if (!res.ok) {
        let detail = "";
        let code = "";
        try {
          detail = errorText(body?.detail, "");
          code = detailCode(body?.detail) || "";
        } catch {
          // ignore
        }
        // Voice goes to a transcription provider: without AI consent the
        // server refuses, and the consent sheet explains why.
        if (res.status === 403 && code === AI_CONSENT_REQUIRED_CODE) {
          openAiConsentSheet();
          throw new Error(t("chat.consent_needed"));
        }
        // Today's voice limit and the other known refusals: plain words.
        if (code && ORACLE_ERROR_KEYS[code]) {
          throw new Error(t(ORACLE_ERROR_KEYS[code]));
        }
        // If the backend says transcription isn't configured, show a calm
        // user-facing line instead of the raw server string.
        if (res.status === 503 && /configured|GROQ|OPENAI/i.test(detail)) {
          throw new Error(t("chat.voice_warming_up"));
        }
        throw new Error(detail || `${t("chat.voice_transcription_failed")} (${res.status})`);
      }
      const data = body;
      const transcript = (data?.transcript || "").trim();
      if (!transcript) {
        setVoiceError(t("chat.voice_nothing_heard"));
        return;
      }
      // The server heard someone in crisis. Send what they said straight
      // away, as a normal message: /chat answers it with the crisis lines
      // in their language. No editing step in between.
      // Only into the conversation it was spoken in; if the member has
      // moved to another one, the words wait in the box below instead.
      // The words are kept in the box until a send is accepted: if another
      // message is still sending, this one waits (pendingVoiceRef) and
      // goes out right after it. The transcript travels as
      // voice_transcript, so typed words around it cannot lower its
      // safety class on the server.
      if (data?.crisis === true && landing(true) === "send") {
        const vm = voiceMessage(inputRef.current?.value || "", transcript);
        // The server already established the crisis card for these words:
        // drawn now, from this response, as the reply to them. Nothing has
        // to reach /chat first, so a failed record or a slower judge there
        // can never lose it.
        const turn = voiceCrisisTurn(data, vm.text, asCrisisCard);
        if (turn) {
          setMessages((prev) => [...prev, turn.user as Message, turn.card as Message]);
          setInput("");
          lastTranscriptRef.current = null;
          return;
        }
        setInput(vm.text);
        lastTranscriptRef.current = vm.voiceTranscript;
        const pending = { text: vm.text, transcript: vm.voiceTranscript, session: spokenIn };
        if (sendingRef.current) {
          pendingVoiceRef.current = pending;
        } else {
          void sendMessageRef.current(vm.text, { voiceTranscript: vm.voiceTranscript }).then((sent) => {
            // Refused (another send got there first): wait for it instead.
            if (sent === false) pendingVoiceRef.current = pending;
          });
        }
        return;
      }
      lastTranscriptRef.current = transcript;
      setInput((prev) => {
        const base = prev.replace(/\s+$/, "");
        return base ? base + " " + transcript : transcript;
      });
      // Focus so the user can edit before sending.
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err: unknown) {
      if (landing(false) === "drop") return;
      const msg = err instanceof Error ? err.message : t("chat.voice_failed");
      setVoiceError(msg);
    } finally {
      if (isMountedRef.current) setTranscribing(false);
    }
  }, [token, t]);

  // True while a native (Capacitor) voice recording is active. Distinct
  // from the MediaRecorder web flow because the stop/transcribe path
  // looks completely different. We track which mode is active so the
  // stop button knows where to dispatch.
  const nativeRecordingRef = useRef<boolean>(false);

  const stopRecording = useCallback(async () => {
    // Native path: ask the Capacitor plugin to stop, get the blob back,
    // hand it to the same transcribeBlob() the web flow uses.
    if (nativeRecordingRef.current) {
      nativeRecordingRef.current = false;
      try {
        const { stopNativeRecording } = await import("@/lib/native-voice");
        const result = await stopNativeRecording();
        setIsRecording(false);
        if (result) {
          await transcribeBlob(result.blob, result.mimeType);
        } else {
          setVoiceError(t("chat.voice_no_audio"));
        }
      } catch (err) {
        setIsRecording(false);
        console.warn("[chat] native stop failed", err);
        setVoiceError(t("chat.voice_stop_failed"));
      }
      return;
    }
    // Web path: stop the MediaRecorder; its onstop handler runs the
    // transcription flow.
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stop();
      }
    } catch {
      // ignore
    }
  }, [transcribeBlob]);

  const toggleRecording = useCallback(async () => {
    if (typeof window === "undefined") return;

    if (isRecording) {
      stopRecording();
      return;
    }

    setVoiceError(null);

    // Native (Capacitor) shell: use the proper iOS/Android microphone
    // API via the capacitor-voice-recorder plugin. This is the path
    // that finally lets paying iOS users use voice from inside the
    // installed app, with no WebKit cage and no Safari workaround.
    try {
      const { isRunningInCapacitor } = await import("@/lib/native-push");
      if (isRunningInCapacitor()) {
        const { startNativeRecording, cancelNativeRecording } = await import("@/lib/native-voice");
        const ok = await startNativeRecording();
        // The member left the chat while the microphone was starting (the
        // permission prompt can take a while): stop it at once instead of
        // leaving a recording running with no screen to end it.
        if (!isMountedRef.current) {
          if (ok) await cancelNativeRecording().catch(() => {});
          return;
        }
        if (ok) {
          nativeRecordingRef.current = true;
          setIsRecording(true);
        } else {
          setVoiceError(t("chat.voice_perm_denied_native"));
        }
        return;
      }
    } catch (err) {
      console.warn("[chat] native voice path failed, falling back to web", err);
      // Fall through to the web MediaRecorder path below.
    }

    // Detect the runtime context first so we can give an accurate error
    // when getUserMedia fails. Three contexts behave very differently:
    //
    //   1. Regular browser (Safari, Chrome, Firefox tab): getUserMedia
    //      shows the system permission prompt the first time, and
    //      respects the user's grant on subsequent calls.
    //
    //   2. Installed PWA on iOS Safari (Add to Home Screen): a
    //      long-standing WKWebView limitation means getUserMedia often
    //      throws NotAllowedError even when iOS Settings shows the
    //      microphone enabled for solray.ai. There is no JS-side
    //      workaround. Users must either (a) use the regular Safari
    //      tab, or (b) wait for our native Capacitor build, which uses
    //      a proper native mic API.
    //
    //   3. Installed PWA on Android Chrome: works as expected, no
    //      special handling needed.
    const isStandalonePWA = (() => {
      if (typeof window === "undefined") return false;
      const nav = window.navigator as unknown as { standalone?: boolean };
      const matchesStandalone = window.matchMedia?.("(display-mode: standalone)")?.matches;
      return Boolean(nav.standalone) || Boolean(matchesStandalone);
    })();
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent || "")
      || (navigator.platform === "MacIntel" && (navigator as unknown as { maxTouchPoints?: number }).maxTouchPoints! > 1);

    // Detect Chrome so we can give Chrome-specific guidance for its
    // three-layer permission model (OS → browser → site).
    const ua = navigator.userAgent || "";
    const isChrome = /Chrome\/\d/.test(ua) && !/Edg\/|OPR\//.test(ua);

    // Ask the Permissions API what the OS-level grant actually says.
    // Useful for distinguishing "user denied" from "user granted but
    // the platform still won't honor it" (the iOS PWA case, or a
    // Chrome OS-permission block on macOS/Windows).
    let permissionState: PermissionState | "unknown" = "unknown";
    try {
      const res = await (navigator.permissions as unknown as {
        query: (d: { name: PermissionName }) => Promise<PermissionStatus>;
      })?.query?.({ name: "microphone" as PermissionName });
      if (res?.state) permissionState = res.state;
    } catch { /* ignore, fall through to getUserMedia */ }

    // Diagnostic dump: anytime mic prep happens, log a single object
    // with everything we know. Open DevTools → Console and tap mic to
    // capture this. Helps differentiate "site permission blocked",
    // "OS permission blocked", "iOS PWA cage", and "hardware muted".
    // Mic preflight diagnostics. Gated behind the dev environment OR
    // an explicit ?mic_debug=1 query param so a power user (or
    // OpenClaw debugging on the Mac) can flip them on without a
    // rebuild. Previously gated with "|| true" which meant every
    // single mic attempt logged user-agent + permission state in
    // production, fine for a one-week debug window but not for a
    // polished paid app. Caught by Codex audit P3.8.
    const micDebug =
      process.env.NODE_ENV !== "production" ||
      (typeof window !== "undefined" && new URLSearchParams(window.location.search).get("mic_debug") === "1");
    if (micDebug) {
      // eslint-disable-next-line no-console
      console.log("[solray-mic] preflight", {
        userAgent: ua,
        isChrome,
        isIOS,
        isStandalonePWA,
        permissionState,
        host: window.location.host,
        protocol: window.location.protocol,
      });
    }

    // Ask for the mic.
    let stream: MediaStream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      // Left the chat while the permission prompt was open: release the mic.
      if (!isMountedRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
    } catch (err: unknown) {
      const e = err as { name?: string; message?: string };
      const name = e?.name || "";
      // eslint-disable-next-line no-console
      console.error("[solray-mic] getUserMedia failed", {
        name, message: e?.message,
        permissionState, isChrome, isIOS, isStandalonePWA,
      });
      if (name === "NotAllowedError" || name === "SecurityError") {
        if ((permissionState === "granted" || permissionState === "unknown") && isIOS && isStandalonePWA) {
          // iOS PWA WebKit cage. Offer the Safari fallback link.
          setVoiceError(t("chat.voice_ios_pwa"));
        } else if (isChrome && permissionState === "granted") {
          // Chrome thinks the site has permission, but the browser
          // got NotAllowedError anyway. That means the OS layer is
          // blocking, macOS Privacy & Security or Windows mic
          // privacy. The user has to flip a system toggle, no
          // browser-side fix.
          setVoiceError(t("chat.voice_chrome_os_block"));
        } else if (isChrome && permissionState === "denied") {
          // Chrome's per-site permission says blocked. The fix is
          // the lock icon, toggling Chrome's general mic setting
          // does not override a per-site block.
          setVoiceError(t("chat.voice_chrome_site_block"));
        } else if (isChrome) {
          // Chrome with unknown permission state, most likely a
          // first-time block-popup answer. Same fix as denied.
          setVoiceError(t("chat.voice_chrome_denied"));
        } else if (permissionState === "denied") {
          setVoiceError(t("chat.voice_denied_browser"));
        } else if (isIOS && isStandalonePWA) {
          setVoiceError(t("chat.voice_ios_pwa"));
        } else {
          setVoiceError(t("chat.voice_blocked"));
        }
      } else if (name === "NotFoundError" || name === "OverconstrainedError") {
        setVoiceError(t("chat.voice_not_found"));
      } else {
        setVoiceError(t("chat.voice_open_failed"));
      }
      return;
    }

    const mime = pickRecorderMime();
    recordMimeRef.current = mime || "audio/webm";

    let recorder: MediaRecorder;
    try {
      recorder = mime ? new MediaRecorder(stream, { mimeType: mime }) : new MediaRecorder(stream);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      setVoiceError(t("chat.voice_cant_record"));
      return;
    }

    recordedChunksRef.current = [];
    mediaRecorderRef.current = recorder;
    mediaStreamRef.current = stream;

    recorder.ondataavailable = (e) => {
      if (e.data && e.data.size > 0) {
        recordedChunksRef.current.push(e.data);
      }
    };

    recorder.onstop = () => {
      const chunks = recordedChunksRef.current;
      const usedMime = recordMimeRef.current || recorder.mimeType || "audio/webm";
      const blob = new Blob(chunks, { type: usedMime });
      // Release the mic immediately so the iOS recording indicator clears.
      mediaStreamRef.current?.getTracks().forEach((t) => t.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      recordedChunksRef.current = [];
      setIsRecording(false);
      transcribeBlob(blob, usedMime);
    };

    recorder.onerror = () => {
      setVoiceError(t("chat.voice_stopped_unexpectedly"));
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setIsRecording(false);
    };

    try {
      recorder.start();
      setIsRecording(true);
    } catch {
      stream.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      mediaRecorderRef.current = null;
      setVoiceError(t("chat.voice_start_failed"));
    }
  }, [isRecording, pickRecorderMime, stopRecording, transcribeBlob]);

  // Auto-grow textarea as user types. Keeps text visible (no sideways scroll)
  // and caps at 6 lines so the composer never eats the conversation.
  const resizeInput = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = 22; // matches text-base leading
    const maxHeight = lineHeight * 6 + 24; // ~6 lines + vertical padding
    const next = Math.min(el.scrollHeight, maxHeight);
    el.style.height = `${next}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, []);

  useEffect(() => {
    resizeInput();
  }, [input, resizeInput]);

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // Per-message actions: copy the reply, and a quiet "this landed" resonance
  // mark that feeds the Akashic loop with an explicit, clean signal (the
  // positive twin of the implicit affirmation detection). Both are subtle and
  // sit only under finalized Oracle replies.
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [resonatedIds, setResonatedIds] = useState<Set<string>>(new Set());

  const copyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      window.setTimeout(() => setCopiedId((c) => (c === id ? null : c)), 1800);
    } catch { /* clipboard blocked; no-op */ }
  };

  const markResonance = async (id: string, text: string) => {
    if (resonatedIds.has(id)) return;
    setResonatedIds((prev) => new Set(prev).add(id));
    try {
      await apiFetch(
        "/chat/feedback",
        { method: "POST", body: JSON.stringify({ oracle_text: text, direction: "landed" }) },
        token,
      );
    } catch { /* best-effort; the mark stays for the user regardless */ }
  };

  return (
    <ProtectedRoute>
      <div className="bg-forest-deep flex flex-col" style={{ position: "relative", height: "calc(100dvh - var(--sat, 0px))", overflow: "hidden" }}>
        {/* Calm ambient background: a soft amber glow over forest, drawn with
            CSS instead of a 1200px remote image so opening the Oracle never
            waits on a decorative download on the critical path. */}
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            top: 0, left: 0, right: 0, bottom: 0,
            pointerEvents: "none",
            zIndex: 0,
            background: "transparent",
          }}
        />
        {/* mundane's Mirror header, to the value:
              .head{display:flex;justify-content:space-between;align-items:baseline}
              .mark{font-weight:800;font-size:17px;line-height:1;letter-spacing:-.045em}
              .rule{height:1px;background:var(--line);margin-top:12px}
              .ico{width:34px;height:34px;border:none;background:none;border-radius:50%;
                display:flex;align-items:center;justify-content:center;color:var(--ink3);
                transition:color .18s ease,background .18s ease}
              .ico svg{width:17px;height:17px}  .ico:active{background:rgba(34,32,28,.06)}
              .convlab{font-size:11px;letter-spacing:.3em;text-transform:uppercase;
                color:var(--ink3);margin-top:12px;display:flex;
                justify-content:space-between;gap:10px}
            The mark, then the actions as 17px line icons; the words PAST and
            NEW were two more pieces of lettering competing with the answer. */}
        {/* The gutter sits outside the column, as it does for the messages
            and the composer below, so the date line and the rule start where
            the messages start on a wide screen. */}
        <div className="w-full px-5 pt-3">
        <div className="max-w-lg lg:max-w-[620px] mx-auto">
          <div className="flex items-center justify-between lg:justify-end" style={{ minHeight: 34 }}>
            {/* The fixed DesktopHeader carries the mark from lg up, so this
                one steps aside there rather than printing solray twice. */}
            <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
            <span className="flex items-center" style={{ marginRight: -8 }}>
              <button
                onClick={openHistory}
                title={t("chat.previous_chats")}
                aria-label={t("chat.previous_chats")}
                className="sol-ico"
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M3 5h14M3 10h14M3 15h9" />
                </svg>
              </button>
              <button
                onClick={startNewChat}
                disabled={sending}
                title={t("chat.new_chat")}
                aria-label={t("chat.new_chat")}
                className="sol-ico"
                style={sending ? { opacity: 0.4 } : undefined}
              >
                <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round">
                  <path d="M10 4v12M4 10h12" />
                </svg>
              </button>
            </span>
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <div
            className="font-body uppercase"
            style={{
              fontSize: 11,
              letterSpacing: "0.3em",
              color: "rgb(var(--rgb-text-muted))",
              marginTop: 12,
              display: "flex",
              justifyContent: "space-between",
              gap: 10,
            }}
          >
            <span style={{ color: "rgb(var(--rgb-text-secondary))" }}>
              {new Date().toLocaleDateString(undefined, { weekday: "long", day: "numeric", month: "long" })}
            </span>
          </div>
        </div>
        </div>

        {/* Scroll to bottom button, shows when user has scrolled up */}
        {showJumpButton && (
          <button
            onClick={() => {
              const el = scrollContainerRef.current;
              if (el) el.scrollTop = el.scrollHeight;
              setAutoScrollBoth(true);
              setShowJumpButton(false);
            }}
            className="fixed z-50 active:scale-95 transition-transform"
            style={{ bottom: "120px", left: "50%", marginLeft: "-16px", background: "rgba(18,22,21,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.28)", border: "1px solid rgba(176,46,114,0.45)" }}
            aria-label={t("chat.scroll_to_bottom")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(236,231,221,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 pb-48" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          <div className="max-w-lg lg:max-w-[620px] mx-auto space-y-6">

            {/* Empty / loading anchor, visible while the greeting loads and as
                the honest fallback when no greeting could be built (slow or
                failed forecast). A single quiet in-voice line orients a new
                user and asserts nothing about their chart, so it is never a
                blank screen and never a fabrication. */}
            {messages.length === 0 && (
              <div className="pt-2 pb-8 animate-fade-in">
                <p
                  className="font-body text-text-secondary"
                  style={{ fontSize: 17, lineHeight: 1.62, maxWidth: "26em" }}
                >
                  {t("chat.empty_invocation")}
                </p>
              </div>
            )}


            {messages.map((msg) => {
              const isStreaming = streamingId === msg.id;
              const displayContent = isStreaming
                ? msg.content.slice(0, streamedLength)
                : msg.content;

              // ── Greeting message, rendered as a centered invocation,
              //    not a chat bubble. This is the first thing a user sees
              //    when they open chat: a full-width poetic moment, not UI.
              if (msg.id === "greeting") {
                return (
                  <div key={msg.id} className="pt-2 pb-4 animate-fade-in">
                    {/* The Oracle's opening, set as an answer: left, ink, 17px
                        at 1.62, the way the Mirror sets its own first line. */}
                    <p
                      className="font-body text-text-primary"
                      style={{ fontSize: 17, lineHeight: 1.62, maxWidth: "26em" }}
                    >
                      {isStreaming ? displayContent : msg.content}
                      {isStreaming && <span className="inline-block w-0.5 h-4 bg-current ml-0.5 animate-pulse align-middle" />}
                    </p>
                  </div>
                );
              }

              // The fixed crisis or support card: its own card with call and
              // text buttons, not an Oracle bubble.
              if (msg.crisis) {
                return <CrisisCard key={msg.id} card={msg.crisis} />;
              }

              // Error messages render with distinct styling so the user
              // is never misled into thinking transport-level error copy
              // came from the Oracle. Ember-tinted, smaller,
              // labelled. Replaces the previous mockReplies fallback that
              // styled fortune-cookie strings as if the Oracle had said
              // them.
              if (msg.isError) {
                return (
                  <div key={msg.id} className="flex justify-start animate-fade-in">
                    <div className="max-w-[80%]">
                      <div
                        className="rounded-2xl px-4 py-3 rounded-bl-sm"
                        style={{
                          background: "rgb(var(--rgb-ember) / 0.08)",
                          border: "1px solid rgb(var(--rgb-ember) / 0.30)",
                        }}
                      >
                        <p
                          className="font-body text-[13px] tracking-[0.22em] uppercase mb-1 font-bold"
                          style={{ color: "rgb(var(--rgb-ember))", opacity: 0.85 }}
                        >
                          {t("chat.connection")}
                        </p>
                        <p className="font-body text-text-primary text-[17px] leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                      <span className="font-body text-text-secondary text-[14px] mt-1 px-1">
                        {formatTime(msg.timestamp)}
                      </span>
                    </div>
                  </div>
                );
              }

              return (
                <div
                  key={msg.id}
                  className="animate-slide-up"
                >
                  <MessageContent content={displayContent} showCursor={isStreaming} isUser={msg.role === "user"} />
                  <span
                    className="font-body text-[13px] mt-2 mb-2 block tracking-[0.3em] uppercase font-bold"
                    style={{ color: "rgb(var(--rgb-text-muted))" }}
                  >
                    {msg.role === "user" ? t("chat.you") : t("chat.oracle")} · {formatTime(msg.timestamp)}
                  </span>
                  {msg.role === "user" && (msgStatuses[msg.id] === "interrupted" || msgStatuses[msg.id] === "refused") && (
                    <div className="flex flex-wrap items-center gap-x-5 gap-y-1 mb-4 -mt-1">
                      <span className="font-body text-[14px] text-text-secondary w-full">
                        {msgStatuses[msg.id] === "refused" ? t("chat.turn_too_long") : t("chat.turn_interrupted")}
                      </span>
                      {msgStatuses[msg.id] === "refused" ? (
                        <button
                          onClick={() => editRefused(msg)}
                          className="font-body text-[12px] tracking-[0.18em] uppercase font-bold text-text-secondary hover:text-text-primary transition-colors"
                        >
                          {t("chat.turn_edit")}
                        </button>
                      ) : (
                        <>
                          <button
                            onClick={() => resendInterrupted(msg)}
                            disabled={sending}
                            className="font-body text-[12px] tracking-[0.18em] uppercase font-bold text-text-secondary hover:text-text-primary transition-colors disabled:opacity-50"
                          >
                            {t("chat.turn_send_again")}
                          </button>
                          <button
                            onClick={() => removeInterrupted(msg)}
                            disabled={sending}
                            className="font-body text-[12px] tracking-[0.18em] uppercase font-bold text-text-muted hover:text-text-secondary transition-colors disabled:opacity-50"
                          >
                            {t("chat.turn_remove")}
                          </button>
                        </>
                      )}
                    </div>
                  )}
                  {msg.role !== "user" && msg.id !== "greeting" && !isStreaming && !msg.isError && (msg.content || "").trim() && (
                    <div className="flex items-center gap-5 mb-4 -mt-1">
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        aria-label={t("chat.copy_reply")}
                        className="flex items-center gap-1.5 text-text-muted hover:text-text-secondary transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                        )}
                        <span className="font-body text-[12px] tracking-[0.18em] uppercase font-bold">{copiedId === msg.id ? t("chat.copied") : t("chat.copy")}</span>
                      </button>
                      <button
                        onClick={() => markResonance(msg.id, msg.content)}
                        disabled={resonatedIds.has(msg.id)}
                        aria-label={t("chat.this_landed")}
                        className="flex items-center gap-1.5 transition-colors"
                        style={{ color: resonatedIds.has(msg.id) ? "rgb(var(--rgb-wisteria))" : undefined }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={resonatedIds.has(msg.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={resonatedIds.has(msg.id) ? "" : "text-text-muted"}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></svg>
                        <span className={`font-body text-[12px] tracking-[0.18em] uppercase ${resonatedIds.has(msg.id) ? "" : "text-text-muted"} font-bold`}>{resonatedIds.has(msg.id) ? t("chat.landed") : t("chat.this_landed")}</span>
                      </button>
                    </div>
                  )}
                </div>
              );
            })}

            {/* First-session tappable prompts. Computed from today's
                cached forecast, so each chip is specific to this user's
                actual chart and today's actual sky. Shown only when the
                user has not sent any message yet, the greeting may have
                arrived already but no user turn has happened. Tap fills
                input and auto-sends, removing typing friction on the
                first interaction. Hidden as soon as the user types or
                taps one. Codex UX hook 2. */}
            {suggestions.length > 0 && !soulBlueprint && !soulRef &&
              !messages.some((m) => m.role === "user") &&
              !sending && !streamingId && (
                <div className="flex flex-col gap-0 items-start pt-2 pb-1 animate-fade-in" style={{ borderTop: "1px solid rgb(var(--rgb-border))", marginTop: 18 }}>
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => {
                        if (Date.now() - suggestionsArmedAt.current < 450) return;
                        sendMessage(s);
                      }}
                      className="font-body text-left w-full transition-opacity hover:opacity-70 active:scale-[0.995] bg-transparent"
                      style={{
                        background: "transparent",
                        border: 0,
                        borderBottom: "1px solid rgb(var(--rgb-border))",
                        padding: "14px 2px",
                        fontSize: 17,
                        lineHeight: 1.5,
                        color: "rgb(var(--rgb-text-secondary))",
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              )}

            {sending && (
              <ThinkingIndicator />
            )}

          </div>
        </div>

        {/* Input */}
        <div className="fixed bottom-0 left-0 right-0 border-t px-5 pt-3" style={{ paddingBottom: "calc(80px + var(--sab, 0px))", background: "rgb(var(--rgb-bg-deep))", borderColor: "rgb(var(--rgb-border))" }}>
          <div className="max-w-lg lg:max-w-[620px] mx-auto">
            {chatNotice && (chatNotice.kind === "closed" || chatNotice.sessionId === sessionId) && (
              <div
                role="status"
                className="mb-3 rounded-2xl px-4 py-3"
                style={chatNotice.kind === "consent" ? {
                  background: "rgb(var(--rgb-card))",
                  border: "1px solid rgb(var(--rgb-border))",
                } : {
                  background: "rgb(var(--rgb-ember) / 0.08)",
                  border: "1px solid rgb(var(--rgb-ember) / 0.30)",
                }}
              >
                {chatNotice.kind === "consent" && (
                  <p className="font-body text-text-primary text-[15px] leading-relaxed">
                    {t("chat.consent_notice")}
                  </p>
                )}
                {chatNotice.kind === "closed" && (
                  <p className="font-body text-text-primary text-[15px] leading-relaxed">
                    {t("chat.conversation_closed_partner")}
                  </p>
                )}
                <div className="flex items-center gap-5 mt-2">
                  {chatNotice.kind === "consent" && (
                    <button
                      onClick={() => openAiConsentSheet()}
                      className="font-body font-bold text-[14px] rounded-full px-5"
                      style={{ minHeight: 40, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))" }}
                    >
                      {t("chat.consent_agree")}
                    </button>
                  )}
                  {chatNotice.kind === "dynamics" && (
                    <button
                      onClick={() => { setChatNotice(null); startNewChat(); }}
                      disabled={sending}
                      className="font-body text-[15px] underline underline-offset-4 text-amber-sun hover:opacity-80 transition-opacity"
                    >
                      {t("chat.start_ordinary_conversation")}
                    </button>
                  )}
                  <button
                    onClick={() => setChatNotice(null)}
                    className="font-body text-[15px] text-text-secondary hover:opacity-80 transition-opacity"
                  >
                    {t("chat.dismiss_notice")}
                  </button>
                </div>
              </div>
            )}
            {isRecording && (
              <div className="flex items-center gap-2 mb-2 font-body text-[15px] tracking-[0.14em] uppercase font-bold" style={{ color: "rgb(var(--rgb-ember))" }}>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "rgb(var(--rgb-ember))", boxShadow: "0 0 8px rgba(200,162,122,0.9)" }}
                />
                {t("chat.recording_tap_stop")}
              </div>
            )}
            {transcribing && !isRecording && (
              <div className="flex items-center gap-2 mb-2 font-body text-[15px] tracking-[0.14em] uppercase text-text-secondary font-bold">
                <LoadingSpinner size="sm" />
                {t("chat.transcribing")}
              </div>
            )}
            {voiceError && !isRecording && !transcribing && (() => {
              // The voice error string can carry an inline {action}…{/action}
              // marker. When the marker is present we render a tappable
              // "Use voice in Safari" link that opens the current chat
              // URL outside the PWA shell. The x-safari-https:// scheme
              // forces a real Safari tab from inside the standalone PWA;
              // browsers that don't recognise it fall through to the
              // regular https:// navigation, which most setups still
              // route into the system browser.
              const m = voiceError.match(/^(.*?)\{action\}(.+?)\{\/action\}(.*)$/);
              if (!m) {
                return (
                  <div className="mb-2 font-body text-[15px] text-text-secondary">{voiceError}</div>
                );
              }
              const [, before, label, after] = m;
              const openInSafari = () => {
                if (typeof window === "undefined") return;
                const target = window.location.href;
                // x-safari-https:// is the iOS-only deep link that
                // launches the URL in Safari from inside any app or
                // PWA. On Android / desktop this scheme is unknown
                // and the assignment silently fails; we fall back to
                // window.open to open in a new tab.
                try {
                  window.location.href = "x-safari-" + target;
                } catch { /* ignore, fall through */ }
                setTimeout(() => {
                  // If the deep link didn't move us off the page within
                  // 300ms, the OS didn't recognise the scheme. Open in
                  // a new tab instead.
                  if (document.hidden) return;
                  window.open(target, "_blank", "noopener");
                }, 300);
              };
              return (
                <div className="mb-2 font-body text-[15px] text-text-secondary">
                  {before}
                  <button
                    onClick={openInSafari}
                    className="underline underline-offset-4 text-amber-sun hover:opacity-80 transition-opacity"
                  >
                    {label}
                  </button>
                  {after}
                </div>
              );
            })()}
            <div
              className="flex gap-3 items-end"
              style={{ borderTop: "1px solid rgb(var(--rgb-border))", paddingTop: 10 }}
            >
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? t("chat.listening_placeholder") : t("chat.speak_freely")}
                className="flex-1 bg-transparent border-0 px-1 py-3 text-text-primary placeholder-text-muted font-body text-base transition-colors focus:outline-none"
                style={{
                  resize: "none",
                  overflowY: "hidden",
                  lineHeight: "1.4",
                  maxHeight: "156px",
                  whiteSpace: "pre-wrap",
                  overflowWrap: "break-word",
                  wordBreak: "break-word",
                }}
                onFocus={(e) => {
                  // Theme tokens, not literals: the hardcoded dark-forest
                  // values used to stick a dark green border onto the
                  // light-mode input after focus.
                  e.target.style.borderColor = "transparent";
                  e.target.style.boxShadow = "none";
                }}
                onBlur={(e) => {
                  e.target.style.borderColor = "rgb(var(--rgb-border))";
                  e.target.style.boxShadow = "none";
                }}
              />
              {voiceSupported && (
                <button
                  onClick={toggleRecording}
                  disabled={sending || transcribing}
                  aria-label={isRecording ? t("chat.stop_voice") : t("chat.start_voice")}
                  aria-pressed={isRecording}
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 active:scale-95 disabled:opacity-50 shrink-0 self-end"
                  style={{
                    background: isRecording ? "rgb(var(--rgb-ember) / 0.12)" : "transparent",
                    border: "1px solid rgb(var(--rgb-border))",
                    color: isRecording ? "rgb(var(--rgb-ember))" : "rgb(var(--rgb-text-muted))",
                    boxShadow: "none",
                  }}
                >
                  {transcribing ? (
                    <LoadingSpinner size="sm" />
                  ) : isRecording ? (
                    // Stop icon (rounded square)
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                      <rect x="5" y="5" width="14" height="14" rx="2" />
                    </svg>
                  ) : (
                    // Mic icon
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                      <rect x="9" y="3" width="6" height="12" rx="3" />
                      <path d="M5 11a7 7 0 0 0 14 0" />
                      <line x1="12" y1="18" x2="12" y2="22" />
                      <line x1="8" y1="22" x2="16" y2="22" />
                    </svg>
                  )}
                </button>
              )}
              <button
                onClick={() => sendMessage()}
                disabled={!input.trim() || sending}
                className="h-11 px-2 flex items-center justify-center transition-all duration-200 hover:opacity-70 active:scale-95 disabled:opacity-30 shrink-0 self-end font-body text-[17px] font-bold bg-transparent"
                style={{ color: "rgb(var(--rgb-ember))" }}
              >
                {sending ? <LoadingSpinner size="sm" /> : t("chat.send")}
              </button>
            </div>
          </div>
        </div>

        {/* History Panel */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowHistory(false)}>
            <div
              className="bg-forest-dark border border-forest-border rounded-t-2xl w-full max-w-lg flex flex-col max-h-[70dvh] mb-16"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Fixed header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
                <h2 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 700 }}>{t("chat.previous_chats")}</h2>
                <button
                  onClick={() => setShowHistory(false)}
                  aria-label={t("common.close")}
                  className="text-text-secondary hover:text-text-primary flex items-center justify-center"
                  style={{ width: 44, height: 44, marginRight: -12 }}
                >
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              {historyError && (
                <p role="alert" className="font-body text-[14px] px-5 pb-3 shrink-0" style={{ color: "rgb(var(--rgb-ember))" }}>
                  {historyError}
                </p>
              )}
              {/* Scrollable list */}
              <div className="overflow-y-auto flex-1 px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
                {pastSessions.length === 0 ? (
                  <p className="font-body text-text-secondary text-[17px] text-center py-6">{t("chat.no_previous")}</p>
                ) : (
                  <div className="space-y-2">
                    {pastSessions.map((s) => (
                      <div key={s.sessionId} className="relative">
                        {renamingId === s.sessionId ? (
                          /* Inline rename input */
                          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-forest-card" style={{ border: "1px solid rgb(var(--rgb-wisteria))" }}>
                            <input
                              autoFocus
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") commitRename(s.sessionId);
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              onBlur={() => commitRename(s.sessionId)}
                              placeholder={s.date}
                              className="flex-1 bg-transparent text-text-primary font-body text-[17px] outline-none placeholder-text-secondary"
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitRename(s.sessionId); }}
                              className="font-body text-[14px]" style={{ color: "var(--wisteria)" }}
                            >
                              {t("common.save")}
                            </button>
                          </div>
                        ) : confirmDeleteId === s.sessionId ? (
                          /* Delete confirmation: one conversation, gone for good */
                          <div className="px-4 py-3 rounded-xl bg-forest-card" style={{ border: "1px solid rgb(var(--rgb-ember) / .5)" }}>
                            <p className="font-body text-text-primary text-[15px] mb-2">
                              {t("chat.delete_confirm")}
                            </p>
                            <div className="flex items-center gap-2">
                              <button
                                onClick={(e) => { setConfirmDeleteId(null); deleteSession(e, s.sessionId); }}
                                disabled={sending}
                                className="font-body font-bold text-[14px] rounded-full px-4"
                                style={{ minHeight: 44, color: "rgb(var(--rgb-ember))", border: "1px solid rgb(var(--rgb-ember) / .5)" }}
                              >
                                {t("chat.delete_chat")}
                              </button>
                              <button
                                onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(null); }}
                                className="font-body text-[14px] text-text-secondary rounded-full px-4"
                                style={{ minHeight: 44 }}
                              >
                                {t("common.cancel")}
                              </button>
                            </div>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => loadPastSession(s.sessionId)}
                              disabled={sending}
                              className={`flex-1 min-w-0 text-left px-4 py-3 rounded-xl border transition-colors ${
                                s.sessionId === sessionId
                                  ? "bg-forest-card text-text-primary"
                                  : "border-forest-border bg-forest-card text-text-secondary hover:text-text-primary"
                              }`}
                              style={s.sessionId === sessionId ? { border: "1px solid rgb(var(--rgb-wisteria))" } : undefined}
                            >
                              <p className="font-body text-text-primary text-[17px] truncate mb-0.5">
                                {s.customName || s.date}
                              </p>
                              <p className="font-body text-text-secondary text-[15px] truncate">
                                {s.evicted
                                  ? (s.evicted.preview || t("chat.no_messages"))
                                  : (s.messages.find((m) => m.role === "user")?.content || t("chat.no_messages"))}
                              </p>
                              {historyOpening?.id === s.sessionId && (
                                <p
                                  role={historyOpening.failed ? "alert" : "status"}
                                  className="font-body text-[14px] mt-1"
                                  style={historyOpening.failed ? { color: "rgb(var(--rgb-ember))" } : undefined}
                                >
                                  {historyOpening.failed ? t("chat.history_load_failed") : t("chat.history_loading")}
                                </p>
                              )}
                            </button>
                            {/* Rename pencil */}
                            <button
                              onClick={(e) => startRename(e, s.sessionId, s.customName || s.date)}
                              title={t("chat.rename_chat")}
                              aria-label={t("chat.rename_chat")}
                              className="w-11 h-11 flex items-center justify-center text-text-secondary transition-colors shrink-0"
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "rgb(var(--rgb-wisteria))"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ""}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            {/* Delete trash */}
                            <button
                              onClick={(e) => { e.stopPropagation(); setConfirmDeleteId(s.sessionId); }}
                              disabled={sending}
                              title={t("chat.delete_chat")}
                              aria-label={t("chat.delete_chat")}
                              className="w-11 h-11 flex items-center justify-center text-text-secondary transition-colors shrink-0"
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "rgb(var(--rgb-ember))"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ""}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <polyline points="3 6 5 6 21 6"/>
                                <path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/>
                                <path d="M10 11v6M14 11v6"/>
                                <path d="M9 6V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2"/>
                              </svg>
                            </button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

      </div>
    </ProtectedRoute>
  );
}

// Rotating presence copy shown beneath the spinning sun while the Oracle
// is forming its reply. The first phrase appears immediately so the user
// always sees presence. Subsequent phrases fade in only if the wait runs
// long, so a fast reply never flashes through three pieces of copy.
// Lines are written in the Oracle's voice: quiet, present, never busy.
const THINKING_PHRASE_KEYS = [
  "chat.thinking_listening",
  "chat.thinking_reading",
  "chat.thinking_settle",
];

function ThinkingIndicator() {
  const { t } = useT();
  const THINKING_PHRASES = THINKING_PHRASE_KEYS.map((k) => t(k));
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    // Step to the next phrase every 2.6 seconds, capped at the last one
    // so we don't loop through copy if the API is genuinely slow.
    const t1 = setTimeout(() => setIdx(1), 2600);
    const t2 = setTimeout(() => setIdx(2), 5400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex flex-col items-start gap-3 animate-fade-in pl-2">
      {/* the orb, breathing, not the old logo spinning like a coin */}
      <Orb size={40} style={{ animation: "orbBreathe 11s ease-in-out infinite" }} />
      <p
        key={idx}
        className="animate-fade-in"
        style={{
          fontFamily: "var(--font-heading, 'Zen Kaku Gothic New', system-ui, sans-serif)",
          
          fontWeight: 700,
          fontSize: "1rem",
          color: "rgb(var(--rgb-text-secondary))",
          opacity: 0.82,
          letterSpacing: "0.01em",
          marginLeft: 4,
        }}
      >
        {THINKING_PHRASES[idx]}
      </p>
    </div>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-forest-deep flex items-center justify-center"><span className="rounded-full" style={{ width: "8px", height: "8px", background: "var(--wisteria)", boxShadow: "0 0 16px rgba(176,46,114,0.5)", animation: "pulse 2.4s ease-in-out infinite" }} /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}
