"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import ReactMarkdown from "react-markdown";
import { useT } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO string for serialisation
  // When true, this message represents a transport-level error rather
  // than an Oracle reply. Renders with distinct styling (no Cormorant
  // serif, no Higher-Self framing) so the user is never misled into
  // thinking error fallback copy came from the Oracle. Replaces the
  // earlier mockReplies fortune-cookie fallback.
  isError?: boolean;
}

interface StoredSession {
  sessionId: string;
  date: string; // human-readable date label
  customName?: string; // user-renamed label
  messages: Message[];
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function generateSessionId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function todayLabel() {
  return new Date().toLocaleDateString("en-GB", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// localStorage is now the CACHE; the server is the source of truth.
// On any signed-in load, we hydrate from the server and overwrite the
// local cache. saveSession writes locally first (instant render) then
// fires-and-forgets a PUT to /chat/sessions/{id} so the server stays
// in sync. Devices that come online later read the server's copy.

function getSessionIds(): string[] {
  try {
    return JSON.parse(localStorage.getItem("solray_chat_sessions") || "[]");
  } catch {
    return [];
  }
}

function saveSessionIds(ids: string[]) {
  localStorage.setItem("solray_chat_sessions", JSON.stringify(ids));
}

function loadSession(sessionId: string): StoredSession | null {
  try {
    const raw = localStorage.getItem(`solray_chat_${sessionId}`);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveSession(session: StoredSession) {
  localStorage.setItem(`solray_chat_${session.sessionId}`, JSON.stringify(session));
  const ids = getSessionIds();
  if (!ids.includes(session.sessionId)) {
    ids.unshift(session.sessionId);
    saveSessionIds(ids);
  }
}

// ─── Server sync ────────────────────────────────────────────────────────────
// Push a session to the server. Best-effort: failures don't block local save.
// On success we record the server's last_message_at into the local meta so
// the next sync compares like-with-like.
async function pushSessionToServer(session: StoredSession, token: string | null): Promise<void> {
  if (!token) return;
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
  try {
    const res = await fetch(`${apiUrl}/chat/sessions/${encodeURIComponent(session.sessionId)}`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({
        session_id: session.sessionId,
        custom_name: session.customName || null,
        date_label: session.date || null,
        messages: session.messages || [],
      }),
    });
    if (res.ok) {
      const out = await res.json().catch(() => ({} as Record<string, string>));
      if (out && typeof out.last_message_at === "string") {
        setSessionLocalMeta(session.sessionId, out.last_message_at);
      }
    }
  } catch {
    // Local copy still saved; server sync will retry on next save.
  }
}

// Track per-session last_message_at locally so we can compare with remote
// on sync. Without this, a stale local copy (laptop after a week) would
// overwrite a fresh server copy (phone wrote yesterday) when the user
// opens the local one and the persist-on-message effect fires. Codex
// audit P0 (the blocker before TestFlight).
const SESSION_META_KEY = "solray_chat_session_meta";
type LocalMeta = Record<string, { last_message_at: string }>;

function getLocalMeta(): LocalMeta {
  try { return JSON.parse(localStorage.getItem(SESSION_META_KEY) || "{}") as LocalMeta; } catch { return {}; }
}
function setLocalMeta(meta: LocalMeta) {
  try { localStorage.setItem(SESSION_META_KEY, JSON.stringify(meta)); } catch { /* ignore quota */ }
}
function setSessionLocalMeta(sessionId: string, last_message_at: string) {
  const meta = getLocalMeta();
  meta[sessionId] = { last_message_at };
  setLocalMeta(meta);
}

// One-time migration flag: after the first sync where local-only sessions
// are pushed to the server, mark this device as migrated. Subsequent syncs
// treat local-only sessions as "deleted on another device" and remove them
// from the local cache, so cross-device deletes propagate cleanly.
const MIGRATION_FLAG = "solray_chat_migrated_v1";

// Pull all sessions from server, reconcile against local cache, return
// the unified id list. Falls back to local on network failure.
async function syncSessionsFromServer(token: string | null): Promise<string[]> {
  if (!token) return getSessionIds();
  const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
  try {
    // 1. Fetch the lightweight list (includes last_message_at).
    const listRes = await fetch(`${apiUrl}/chat/sessions`, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!listRes.ok) return getSessionIds();
    const listJson = await listRes.json();
    const remoteSessions: Array<{ session_id: string; custom_name: string | null; date_label: string | null; message_count: number; last_message_at: string | null }> =
      listJson.sessions || [];

    const localIds = new Set(getSessionIds());
    const localMeta = getLocalMeta();
    const fetched: string[] = [];

    // 2. Reconcile each remote session: pull from server when remote is
    //    newer than local OR local doesn't have it.
    for (const s of remoteSessions) {
      fetched.push(s.session_id);
      const remoteAt = s.last_message_at || "";
      const localAt = localMeta[s.session_id]?.last_message_at || "";
      const needPull = !localIds.has(s.session_id) || (remoteAt && remoteAt > localAt);
      if (needPull) {
        try {
          const fullRes = await fetch(`${apiUrl}/chat/sessions/${encodeURIComponent(s.session_id)}`, {
            headers: { Authorization: `Bearer ${token}` },
          });
          if (fullRes.ok) {
            const full = await fullRes.json();
            const stored: StoredSession = {
              sessionId: full.session_id,
              date: full.date_label || "",
              customName: full.custom_name || undefined,
              messages: full.messages || [],
            };
            localStorage.setItem(`solray_chat_${stored.sessionId}`, JSON.stringify(stored));
            if (full.last_message_at) {
              setSessionLocalMeta(stored.sessionId, full.last_message_at);
            }
          }
        } catch { /* skip; will retry on next sync */ }
      }
    }

    // 3. Local-only reconciliation. Two paths:
    //    a) FIRST migration on this device: push local-only sessions UP.
    //       This is the existing-user case where localStorage holds real
    //       history that's never been to the server.
    //    b) After migration: local-only means deleted on another device,
    //       so remove from local cache. Otherwise a delete on phone
    //       resurrects on desktop forever.
    const remoteIds = new Set(remoteSessions.map((s) => s.session_id));
    const localIdArr = Array.from(localIds);
    const migrated = localStorage.getItem(MIGRATION_FLAG) === "1";
    for (const localId of localIdArr) {
      if (remoteIds.has(localId)) continue;
      if (!migrated) {
        const local = loadSession(localId);
        if (local) {
          await pushSessionToServer(local, token);
          if (local.messages?.length) {
            setSessionLocalMeta(localId, new Date().toISOString());
          }
          fetched.push(localId);
        }
      } else {
        // Treat as deleted on another device: drop from local cache.
        localStorage.removeItem(`solray_chat_${localId}`);
        const meta = getLocalMeta();
        delete meta[localId];
        setLocalMeta(meta);
      }
    }
    if (!migrated) localStorage.setItem(MIGRATION_FLAG, "1");

    // 4. Save unified id list, server-order takes precedence.
    const allIds = Array.from(new Set(fetched));
    saveSessionIds(allIds);
    return allIds;
  } catch {
    return getSessionIds();
  }
}

// ─── Text renderer ──────────────────────────────────────────────────────────

function MessageContent({ content, showCursor, isUser }: { content: string; showCursor?: boolean; isUser?: boolean }) {
  // Transcript style: no bubble, no border, no background. The user
  // message reads as the question (italic, quieter); the Oracle's
  // reply reads as the answer (full presence, primary color). Same
  // font size on both so the page reads as a continuous conversation
  // the way Claude.ai does, not a chat app.
  const wrapClass = isUser
    ? "font-body italic text-text-secondary leading-relaxed"
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
            <h1 className="font-heading text-xl text-text-primary mb-2 mt-3 first:mt-0" style={{ fontWeight: 400 }}>{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-heading text-lg text-text-primary mb-2 mt-3 first:mt-0" style={{ fontWeight: 400 }}>{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-heading text-base text-amber-sun mb-1 mt-2 first:mt-0">{children}</h3>
          ),
          em: ({ children }) => (
            <em className="italic">{children}</em>
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
  const [input, setInput] = useState("");
  // Opening suggestions: ONE set of three doors, composed deliberately.
  //   1. Today-anchored: from lib/today-prompts (Codex UX hook 2), seeded
  //      by the cached forecast, the line that could only exist for this
  //      user on this day ("Tell me more about Saturn squaring my Sun").
  //   2. Placement-anchored: from the cached blueprint (Moon sign, HD
  //      type, authority), translated via tx for Spanish.
  //   3. One deep universal question, rotated daily.
  // Fallbacks fill from the universal pool, so there are always exactly
  // three. Replaces the arrangement where the forecast chips and the
  // blueprint chips both rendered and stacked six prompts. Fail-soft:
  // errors mean fewer chips, never a broken chat.
  const [suggestions, setSuggestions] = useState<string[]>([]);
  useEffect(() => {
    void (async () => {
      try {
        const day = Math.floor(Date.now() / 86400000);
        const picked: string[] = [];

        try {
          const { buildTodayPrompts, readCachedForecast } = await import("@/lib/today-prompts");
          const tp = buildTodayPrompts(readCachedForecast());
          if (tp.length > 0) picked.push(tp[day % tp.length].question);
        } catch { /* no forecast cache */ }

        try {
          const bp = JSON.parse(localStorage.getItem("solray_blueprint") || "null");
          const summary: Record<string, string> = (bp && (bp.summary || bp)) || {};
          const placement: string[] = [];
          if (summary.moon_sign) placement.push(t("chat.suggest_moon").replace("{moon}", tx(summary.moon_sign, lang)));
          if (summary.hd_type) placement.push(t("chat.suggest_type").replace("{type}", tx(summary.hd_type, lang)));
          if (summary.hd_authority) placement.push(t("chat.suggest_authority").replace("{authority}", tx(summary.hd_authority, lang)));
          if (placement.length > 0) picked.push(placement[day % placement.length]);
        } catch { /* no blueprint cache */ }

        const universal = [
          t("chat.suggest_truth"),
          t("chat.suggest_pattern"),
          t("chat.suggest_work"),
          t("chat.suggest_season"),
          t("chat.suggest_today"),
        ];
        for (let i = 0; picked.length < 3 && i < universal.length; i++) {
          const candidate = universal[(day + i) % universal.length];
          if (!picked.includes(candidate)) picked.push(candidate);
        }
        setSuggestions(Array.from(new Set(picked)).slice(0, 3));
      } catch { /* suggestions are decoration; never break chat */ }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lang]);
  const [sending, setSending] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const [pastSessions, setPastSessions] = useState<StoredSession[]>([]);

  // (forecast-seeded prompts now feed the unified `suggestions` above)

  // Streaming state
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamedLength, setStreamedLength] = useState(0);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
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
  useEffect(() => { tokenRef.current = token; }, [token]);

  // Cross-device chat sync. localStorage stays as the cache for instant
  // reads; the server is the source of truth. On mount (or whenever a
  // fresh token arrives), pull the user's sessions from the server and
  // migrate any local-only sessions up. Runs once per token change.
  useEffect(() => {
    if (!token) return;
    void syncSessionsFromServer(token);
  }, [token]);

  // persistSession: local first (instant render), server second (cross-device).
  // Use this everywhere in the component instead of saveSession() so the
  // session log syncs to the server. Server failure is non-fatal; local
  // copy is always saved so the user never loses a message.
  const persistSession = (session: StoredSession) => {
    saveSession(session);
    void pushSessionToServer(session, token);
  };

  // ── Session-close synthesis ───────────────────────────────────────────────
  // Fires when the user navigates away or closes the tab. Uses fetch with
  // keepalive:true so the browser sends the request even as the page unloads.
  const triggerSessionSynthesis = useCallback(() => {
    const tok = tokenRef.current;
    const msgs = messagesRef.current;
    if (!tok || !msgs.length) return;

    const history = msgs
      .filter((m) => m.id !== "greeting")
      .map((m) => ({ role: m.role, content: m.content }));
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
      body: JSON.stringify({ conversation_history: history }),
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
              aspectStr = `${planet} ${aspectType}s your natal ${target} today.`;
              // Frame a personal question based on the planet involved
              const planetQ: Record<string, string> = {
                mars: "Where are you pushing against something that might need to breathe?",
                venus: "What relationship or desire has been quietly asking for your attention?",
                mercury: "What conversation have you been rehearsing but not yet had?",
                jupiter: "What is expanding in your life that you haven't fully acknowledged yet?",
                saturn: "What structure in your life is being tested right now?",
                uranus: "What change is arriving that part of you already knew was coming?",
                neptune: "What have you been sensing that you haven't quite put into words?",
                pluto: "What are you ready to let go of, even if it's uncomfortable?",
                moon: "What are you feeling right now that you haven't allowed yourself to feel fully?",
                sun: "What part of yourself are you being asked to step into more completely?",
              };
              const pKey = planet.toLowerCase();
              aspectQuestion = planetQ[pKey] || "What does your body already know about this?";
            }
          }

          // Compose the greeting
          const skyParts = [sunSign && `Sun in ${sunSign}`, moonSign && `Moon in ${moonSign}`]
            .filter(Boolean)
            .join(", ");

          if (aspectStr) {
            const skyIntro = skyParts ? `${skyParts}. ` : "";
            content = `${skyIntro}${aspectStr} ${aspectQuestion}`;
          } else if (skyParts) {
            content = `${skyParts}. The sky is holding something specific for you today. What's already stirring?`;
          } else {
            content = "The sky is moving today. What's stirring in you?";
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
    []
  );

  // ── Initialise session on mount ───────────────────────────────────────────
  useEffect(() => {
    if (!token) return;

    async function init() {
      // Check for compatibility context injected from Souls page
      // Check for profile-element prompt (from Ask buttons on profile page)
      const profilePromptRaw = sessionStorage.getItem("solray_chat_prompt");
      if (profilePromptRaw) {
        try {
          const ctx = JSON.parse(profilePromptRaw) as { topic: string; question: string };
          sessionStorage.removeItem("solray_chat_prompt");
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
          persistSession(newSession);
          setMessages(seed);
          setSending(true);
          try {
            const data = await apiFetch("/chat", {
              method: "POST",
              body: JSON.stringify({ message: ctx.question, conversation_history: [] }),
            }, token);
            // Honest empty-response handling, parallel to sendMessage.
            // The previous version of this branch fell back to "I
            // hear you." which is invented Oracle copy. Caught by
            // Codex audit P2.4.
            const content = data.response || data.message;
            if (!content) {
              const errMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: t("chat.error_no_response"),
                timestamp: new Date().toISOString(),
                isError: true,
              };
              const next = [...seed, errMsg];
              setMessages(next);
              persistSession({ ...newSession, messages: next });
              return;
            }
            const reply: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content,
              timestamp: new Date().toISOString(),
            };
            const next = [...seed, reply];
            setMessages(next);
            setStreamedLength(0);
            setStreamingId(reply.id);
            persistSession({ ...newSession, messages: next });
          } catch {
            // Surface the failure as a visible error message rather
            // than silently swallowing it. Previous version left the
            // user with their seeded question and no honest signal
            // that anything failed.
            const errMsg: Message = {
              id: (Date.now() + 1).toString(),
              role: "assistant",
              content: t("chat.error_unreachable"),
              timestamp: new Date().toISOString(),
              isError: true,
            };
            const next = [...seed, errMsg];
            setMessages(next);
            persistSession({ ...newSession, messages: next });
          } finally {
            setSending(false);
          }
          return;
        } catch {
          // fall through
        }
      }

      const isCompat = searchParams?.get("compat") === "1";
      if (isCompat) {
        try {
          const raw = sessionStorage.getItem("solray_compat_context");
          if (raw) {
            const ctx = JSON.parse(raw) as {
              soulName: string;
              introMessage: string;
              soulBlueprint?: Record<string, unknown> | null;
            };
            sessionStorage.removeItem("solray_compat_context");

            // Hoist the soul context into component state so every
            // follow-up message in this session re-passes the blueprint
            // to the backend. Without this, only the first message had
            // soul context and the Oracle "forgot" their chart on msg 2+.
            setSoulBlueprint(ctx.soulBlueprint ?? null);
            setSoulName(ctx.soulName ?? null);

            const sid = generateSessionId();
            setSessionId(sid);

            const greeting: Message = {
              id: "greeting",
              role: "assistant",
              content: `Reading the dynamic between you and ${ctx.soulName}…`,
              timestamp: new Date().toISOString(),
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
              customName: `You & ${ctx.soulName}`,
              messages: [greeting, userMsg],
            };
            persistSession(newSession);
            setMessages([greeting, userMsg]);

            // Auto-send the compatibility message
            try {
              const data = await apiFetch(
                "/chat",
                {
                  method: "POST",
                  body: JSON.stringify({
                    message: ctx.introMessage,
                    conversation_history: [],
                    soul_blueprint: ctx.soulBlueprint || null,
                  }),
                },
                token
              );
              const reply: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: data.response || data.message || `I feel the thread between you and ${ctx.soulName}. Let me read it.`,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, reply]);
              setStreamedLength(0);
              setStreamingId(reply.id);
              persistSession({ ...newSession, messages: [...newSession.messages, reply] });
            } catch {
              // The previous version of this branch shipped an
              // Oracle-flavored fallback string for the souls compat
              // flow that asserted vague mirror-energy-grow content
              // about the user and the connection. Especially
              // dangerous in Souls because users trust compat
              // readings as chart-grounded. Now surfaces a visible
              // error message in the same isError style as the main
              // chat path. Caught by Codex audit P1.1.
              const errMsg: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `The Oracle couldn't open the reading between you and ${ctx.soulName} just now. Try again in a moment.`,
                timestamp: new Date().toISOString(),
                isError: true,
              };
              setMessages((prev) => [...prev, errMsg]);
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
    if (!token) return;
    // Synthesize the session we're leaving so memory carries forward into
    // the new one. Without this, clicking "+ New" loses everything that
    // wasn't already checkpointed in-session.
    triggerSessionSynthesis();
    // A fresh chat is NOT a compat session unless the user re-enters via
    // Souls. Clear any cached soul context so we don't leak Rut's chart
    // into Bob's regular Higher Self chat.
    setSoulBlueprint(null);
    setSoulName(null);
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
  }, [token, buildGreeting, triggerSessionSynthesis]);

  // ── Load past session ─────────────────────────────────────────────────────
  const loadPastSession = useCallback((sid: string) => {
    // Synthesize the session we're leaving so recent context is not lost
    // when we hop back into an older one.
    triggerSessionSynthesis();
    const session = loadSession(sid);
    if (session) {
      setSessionId(session.sessionId);
      setMessages(session.messages);
      setShowHistory(false);
      setRenamingId(null);
    }
  }, [triggerSessionSynthesis]);

  // ── Open history panel ────────────────────────────────────────────────────
  const openHistory = useCallback(() => {
    const ids = getSessionIds();
    const sessions = ids
      .map((id) => loadSession(id))
      .filter((s): s is StoredSession => s !== null);
    setPastSessions(sessions);
    setShowHistory(true);
    setRenamingId(null);
  }, []);

  // ── Rename helpers ────────────────────────────────────────────────────────
  const startRename = useCallback(
    (e: React.MouseEvent, sid: string, currentName: string) => {
      e.stopPropagation();
      setRenamingId(sid);
      setRenameValue(currentName);
    },
    []
  );

  const commitRename = useCallback(
    (sid: string) => {
      const session = loadSession(sid);
      if (!session) return;
      const newName = renameValue.trim();
      const updated: StoredSession = {
        ...session,
        customName: newName || undefined,
      };
      persistSession(updated);
      setPastSessions((prev) =>
        prev.map((s) => (s.sessionId === sid ? updated : s))
      );
      setRenamingId(null);
    },
    [renameValue]
  );

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback(
    (e: React.MouseEvent, sid: string) => {
      e.stopPropagation();
      // Local removal first (instant UX), then propagate to server so the
      // session doesn't reappear on the next sync from another device.
      localStorage.removeItem(`solray_chat_${sid}`);
      const ids = getSessionIds().filter((id) => id !== sid);
      saveSessionIds(ids);
      setPastSessions((prev) => prev.filter((s) => s.sessionId !== sid));
      if (token) {
        const apiUrl = (process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000").trim();
        void fetch(`${apiUrl}/chat/sessions/${encodeURIComponent(sid)}`, {
          method: "DELETE",
          headers: { Authorization: `Bearer ${token}` },
        }).catch(() => { /* network failure: server retains; will re-sync on next pull */ });
      }
      // If we just deleted the active session, start fresh
      if (sid === sessionId) {
        startNewChat();
      }
    },
    [sessionId, startNewChat, token]
  );

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async (overrideText?: string) => {
    // overrideText lets a tappable prompt or auto-send path bypass the
    // input state without waiting for setInput to flush. Falls back to
    // the live input value.
    const text = (overrideText ?? input).trim();
    if (!text || sending) return;

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

    const updatedMessages = [...messages, userMsg];
    setMessages(updatedMessages);
    setInput("");
    setSending(true);

    const history = updatedMessages
      .filter((m) => m.id !== "greeting")
      .slice(0, -1)
      .map((m) => ({ role: m.role, content: m.content }));

    try {
      // Build the request body. If we're in a soul-compatibility chat,
      // re-pass the cached soul_blueprint on every message so the Oracle
      // keeps full chart context across the whole session, not just msg 1.
      const body: Record<string, unknown> = {
        message: userMsg.content,
        conversation_history: history,
      };
      if (soulBlueprint) {
        body.soul_blueprint = soulBlueprint;
      }

      const data = await apiFetch(
        "/chat",
        {
          method: "POST",
          body: JSON.stringify(body),
        },
        token
      );

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
    } catch (err) {
      // If the user has already navigated away from /chat by the time the
      // response lands, do nothing. Whichever page they're on now will
      // handle its own auth/access state. Specifically, never call
      // router.replace from a stale chat handler, it yanks the user off
      // the new page they're trying to use.
      if (!isMountedRef.current) return;
      if (err instanceof ApiError && err.status === 403) {
        router.replace("/subscribe");
        return;
      }
      if (err instanceof ApiError && err.status === 401) {
        router.replace("/login");
        return;
      }
      // Transport / server error. The previous version of this branch
      // shipped a hardcoded array of five "Oracle-flavored" fortune
      // cookie strings and picked one at random to display as if the
      // Oracle had actually said it. That is fictional content
      // presented as the user's personalised reply, which is exactly
      // the failure mode this product cannot ship. We now surface a
      // visible error message in the thread, marked as an error so it
      // renders distinctly from genuine Oracle replies.
      const errMsg: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: t("chat.error_unreachable"),
        timestamp: new Date().toISOString(),
        isError: true,
      };
      setMessages((prev) => [...prev, errMsg]);
    } finally {
      if (isMountedRef.current) setSending(false);
    }
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
    try {
      const authToken = tokenRef.current || token;
      const res = await fetch(`${apiUrl}/chat/transcribe`, {
        method: "POST",
        headers: authToken ? { Authorization: `Bearer ${authToken}` } : undefined,
        body: form,
      });
      if (!res.ok) {
        let detail = "";
        try {
          const j = await res.json();
          detail = j?.detail || "";
        } catch {
          // ignore
        }
        // If the backend says transcription isn't configured, show a calm
        // user-facing line instead of the raw server string.
        if (res.status === 503 && /configured|GROQ|OPENAI/i.test(detail)) {
          throw new Error(t("chat.voice_warming_up"));
        }
        throw new Error(detail || `${t("chat.voice_transcription_failed")} (${res.status})`);
      }
      const data = await res.json();
      const transcript = (data?.transcript || "").trim();
      if (!transcript) {
        setVoiceError(t("chat.voice_nothing_heard"));
        return;
      }
      setInput((prev) => {
        const base = prev.replace(/\s+$/, "");
        return base ? base + " " + transcript : transcript;
      });
      // Focus so the user can edit before sending.
      requestAnimationFrame(() => inputRef.current?.focus());
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : t("chat.voice_failed");
      setVoiceError(msg);
    } finally {
      setTranscribing(false);
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
        const { startNativeRecording } = await import("@/lib/native-voice");
        const ok = await startNativeRecording();
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
      <div className="bg-forest-deep flex flex-col" style={{ position: "relative", height: "100dvh", overflow: "hidden" }}>
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
            background: "radial-gradient(120% 55% at 50% 0%, rgba(216,162,74,0.07), transparent 60%)",
          }}
        />
        {/* Header, Souls reference pattern: tag left, ORACLE absolute center, chat buttons right */}
        <div className="relative overflow-hidden" style={{ borderBottom: "1px solid rgba(26,48,32,0.5)" }}>
          <div className="absolute inset-0 pointer-events-none">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="https://images.unsplash.com/photo-1532693322450-2cb5c511067d?w=800&q=60" alt="" aria-hidden="true" loading="lazy" decoding="async" className="absolute inset-0 w-full h-full object-cover" style={{ opacity: 0.07 }} />
            <div className="absolute inset-0" style={{ background: "linear-gradient(180deg, rgb(var(--rgb-bg-deep) / 0.5) 0%, rgb(var(--rgb-bg-deep) / 0.85) 100%)" }} />
          </div>
          <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-2 pb-3 relative z-10">
            <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1" style={{ color: "var(--wisteria)" }}>
              {t("chat.higher_self")}
            </p>
            <div className="relative flex items-center justify-between" style={{ height: "26px" }}>
              <button
                onClick={openHistory}
                title={t("chat.previous_chats")}
                className="px-3 py-1 rounded-lg bg-forest-card border border-forest-border font-body text-text-secondary text-[12px] tracking-widest transition-colors flex items-center gap-1.5"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#9b86a0"; (e.currentTarget as HTMLElement).style.color = "#9b86a0"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ""; (e.currentTarget as HTMLElement).style.color = ""; }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 14" />
                </svg>
                {t("chat.past")}
              </button>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                ORACLE
              </h1>
              <button
                onClick={startNewChat}
                title={t("chat.new_chat")}
                className="px-3 py-1 rounded-lg bg-forest-card border border-forest-border font-body text-text-secondary text-[12px] tracking-widest transition-colors"
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = "#9b86a0"; (e.currentTarget as HTMLElement).style.color = "#9b86a0"; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = ""; (e.currentTarget as HTMLElement).style.color = ""; }}
              >
                {t("chat.new")}
              </button>
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
            style={{ bottom: "120px", left: "50%", marginLeft: "-16px", background: "rgba(18,22,21,0.72)", backdropFilter: "blur(12px)", WebkitBackdropFilter: "blur(12px)", width: "32px", height: "32px", borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 2px 10px rgba(0,0,0,0.28)", border: "1px solid rgba(155,134,160,0.45)" }}
            aria-label={t("chat.scroll_to_bottom")}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="rgba(236,231,221,0.75)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="6 9 12 15 18 9"/>
            </svg>
          </button>
        )}

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 pb-48" style={{ minHeight: 0, WebkitOverflowScrolling: "touch" }}>
          <div className="max-w-lg lg:max-w-3xl mx-auto space-y-6">

            {/* Empty / loading anchor, visible while the greeting loads and as
                the honest fallback when no greeting could be built (slow or
                failed forecast). A single quiet in-voice line orients a new
                user and asserts nothing about their chart, so it is never a
                blank screen and never a fabrication. */}
            {messages.length === 0 && (
              <div className="flex flex-col items-center text-center pt-4 pb-10 animate-fade-in">
                <span
                  className="rounded-full mb-8"
                  style={{
                    width: "10px", height: "10px",
                    background: "var(--wisteria)",
                    boxShadow: "0 0 18px rgba(155,134,160,0.55)",
                    animation: "pulse 2.4s ease-in-out infinite",
                  }}
                />
                <p
                  className="font-heading italic text-text-primary/75 leading-relaxed max-w-[300px]"
                  style={{ fontSize: "1.35rem", fontWeight: 300, letterSpacing: "0.01em" }}
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
                  <div key={msg.id} className="flex flex-col items-center text-center pt-4 pb-4 animate-fade-in">
                    {/* The greeting text, Cormorant Garamond, italic, large */}
                    <p
                      className="font-heading text-text-primary/80 leading-relaxed max-w-[280px]"
                      style={{ fontSize: "1.15rem", fontWeight: 300, fontStyle: "italic", letterSpacing: "0.01em" }}
                    >
                      {isStreaming ? displayContent : msg.content}
                      {isStreaming && <span className="inline-block w-0.5 h-4 bg-wisteria/60 ml-0.5 animate-pulse" />}
                    </p>
                    <div className="mt-5 w-12 h-px bg-forest-border/60" />
                  </div>
                );
              }

              // Error messages render with distinct styling so the user
              // is never misled into thinking transport-level error copy
              // came from the Oracle. Non-italic, ember-tinted, smaller,
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
                          background: "rgba(212, 122, 82, 0.08)",
                          border: "1px solid rgba(212, 122, 82, 0.30)",
                        }}
                      >
                        <p
                          className="font-body text-[11px] tracking-[0.22em] uppercase mb-1"
                          style={{ color: "var(--ember, #d47a52)", opacity: 0.85 }}
                        >
                          {t("chat.connection")}
                        </p>
                        <p className="font-body text-text-primary text-[15px] leading-relaxed">
                          {msg.content}
                        </p>
                      </div>
                      <span className="font-body text-text-secondary text-[12px] mt-1 px-1">
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
                    className="font-body text-[11px] mt-2 mb-2 block tracking-[0.22em] uppercase"
                    style={{ color: "rgb(var(--rgb-wisteria) / 0.75)" }}
                  >
                    {msg.role === "user" ? t("chat.you") : t("chat.oracle")} · {formatTime(msg.timestamp)}
                  </span>
                  {msg.role !== "user" && msg.id !== "greeting" && !isStreaming && !msg.isError && (msg.content || "").trim() && (
                    <div className="flex items-center gap-5 mb-4 -mt-1">
                      <button
                        onClick={() => copyMessage(msg.id, msg.content)}
                        aria-label={t("chat.copy_reply")}
                        className="flex items-center gap-1.5 text-text-secondary/60 hover:text-text-secondary transition-colors"
                      >
                        {copiedId === msg.id ? (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                        ) : (
                          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a2 2 0 0 1 2-2h10" /></svg>
                        )}
                        <span className="font-body text-[10px] tracking-[0.18em] uppercase">{copiedId === msg.id ? t("chat.copied") : t("chat.copy")}</span>
                      </button>
                      <button
                        onClick={() => markResonance(msg.id, msg.content)}
                        disabled={resonatedIds.has(msg.id)}
                        aria-label={t("chat.this_landed")}
                        className="flex items-center gap-1.5 transition-colors"
                        style={{ color: resonatedIds.has(msg.id) ? "rgb(var(--rgb-wisteria))" : undefined }}
                      >
                        <svg width="12" height="12" viewBox="0 0 24 24" fill={resonatedIds.has(msg.id) ? "currentColor" : "none"} stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" className={resonatedIds.has(msg.id) ? "" : "text-text-secondary/60"}><path d="M12 3l1.9 5.6L19.5 10l-5.6 1.9L12 17.5l-1.9-5.6L4.5 10l5.6-1.4z" /></svg>
                        <span className={`font-body text-[10px] tracking-[0.18em] uppercase ${resonatedIds.has(msg.id) ? "" : "text-text-secondary/60"}`}>{resonatedIds.has(msg.id) ? t("chat.landed") : t("chat.this_landed")}</span>
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
            {suggestions.length > 0 && !soulBlueprint &&
              !messages.some((m) => m.role === "user") &&
              !sending && (
                <div className="flex flex-col gap-2 items-center pt-2 pb-1 animate-fade-in">
                  {suggestions.map((s) => (
                    <button
                      key={s}
                      onClick={() => sendMessage(s)}
                      className="font-body text-[13px] leading-snug text-text-primary text-left max-w-[300px] px-4 py-2.5 rounded-2xl transition-all hover:opacity-90 active:scale-[0.99]"
                      style={{
                        background: "rgba(155,134,160,0.06)",
                        border: "1px solid rgba(155,134,160,0.22)",
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
        <div className="fixed bottom-0 left-0 right-0 bg-forest-dark border-t border-forest-border px-5 pt-3" style={{ paddingBottom: "calc(80px + env(safe-area-inset-bottom, 0px))" }}>
          <div className="max-w-lg lg:max-w-3xl mx-auto">
            {isRecording && (
              <div className="flex items-center gap-2 mb-2 font-body text-[13px] tracking-[0.14em] uppercase" style={{ color: "#c8a27a" }}>
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full animate-pulse"
                  style={{ background: "#c8a27a", boxShadow: "0 0 8px rgba(200,162,122,0.9)" }}
                />
                {t("chat.recording_tap_stop")}
              </div>
            )}
            {transcribing && !isRecording && (
              <div className="flex items-center gap-2 mb-2 font-body text-[13px] tracking-[0.14em] uppercase text-text-secondary">
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
                  <div className="mb-2 font-body text-[13px] text-text-secondary">{voiceError}</div>
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
                <div className="mb-2 font-body text-[13px] text-text-secondary">
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
            <div className="flex gap-3 items-end">
              <textarea
                ref={inputRef}
                rows={1}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                placeholder={isRecording ? t("chat.listening_placeholder") : t("chat.speak_freely")}
                className="flex-1 bg-forest-card border border-forest-border rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary font-body text-base transition-colors"
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
                  e.target.style.borderColor = "rgb(var(--rgb-wisteria))";
                  e.target.style.boxShadow = "0 0 0 2px rgb(var(--rgb-wisteria) / 0.25)";
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
                    background: isRecording
                      ? "linear-gradient(135deg, #c8a27a, #8a6a48)"
                      : "rgb(var(--rgb-mist) / 0.12)",
                    border: isRecording
                      ? "1px solid rgba(200,162,122,0.6)"
                      : "1px solid rgb(var(--rgb-mist) / 0.35)",
                    color: isRecording ? "#f2ecd8" : "var(--mist)",
                    boxShadow: isRecording ? "0 0 16px rgba(200,162,122,0.35)" : undefined,
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
                className="w-11 h-11 rounded-xl flex items-center justify-center transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 shrink-0 self-end"
                style={{
                  // The gradient is fixed dark wisteria in both themes, so
                  // the glyph stays cream explicitly. text-text-primary
                  // flipped it to near-black in light mode.
                  background: "linear-gradient(135deg, #9b86a0, #5a4a5e)",
                  color: "#f2ecd8",
                }}
              >
                {sending ? (
                  <LoadingSpinner size="sm" />
                ) : (
                  <svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor">
                    <path d="M22 2L11 13M22 2L15 22L11 13M22 2L2 9L11 13" stroke="currentColor" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                  </svg>
                )}
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
                <h2 className="font-heading text-text-primary" style={{ fontSize: "1.05rem", fontWeight: 400 }}>{t("chat.previous_chats")}</h2>
                <button onClick={() => setShowHistory(false)} className="text-text-secondary hover:text-text-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              {/* Scrollable list */}
              <div className="overflow-y-auto flex-1 px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
                {pastSessions.length === 0 ? (
                  <p className="font-body text-text-secondary text-[15px] text-center py-6">{t("chat.no_previous")}</p>
                ) : (
                  <div className="space-y-2">
                    {pastSessions.map((s) => (
                      <div key={s.sessionId} className="relative">
                        {renamingId === s.sessionId ? (
                          /* Inline rename input */
                          <div className="flex items-center gap-2 px-4 py-3 rounded-xl bg-forest-card" style={{ border: "1px solid #9b86a0" }}>
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
                              className="flex-1 bg-transparent text-text-primary font-body text-[15px] outline-none placeholder-text-secondary"
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitRename(s.sessionId); }}
                              className="font-body text-[12px]" style={{ color: "var(--wisteria)" }}
                            >
                              {t("common.save")}
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => loadPastSession(s.sessionId)}
                              className={`flex-1 min-w-0 text-left px-4 py-3 rounded-xl border transition-colors ${
                                s.sessionId === sessionId
                                  ? "bg-forest-card text-text-primary"
                                  : "border-forest-border bg-forest-card text-text-secondary hover:text-text-primary"
                              }`}
                              style={s.sessionId === sessionId ? { border: "1px solid #9b86a0" } : undefined}
                            >
                              <p className="font-body text-text-primary text-[15px] truncate mb-0.5">
                                {s.customName || s.date}
                              </p>
                              <p className="font-body text-text-secondary text-[13px] truncate">
                                {s.messages.find((m) => m.role === "user")?.content || t("chat.no_messages")}
                              </p>
                            </button>
                            {/* Rename pencil */}
                            <button
                              onClick={(e) => startRename(e, s.sessionId, s.customName || s.date)}
                              title={t("chat.rename_chat")}
                              className="w-8 h-8 flex items-center justify-center text-text-secondary transition-colors shrink-0"
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#9b86a0"}
                              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = ""}
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                              </svg>
                            </button>
                            {/* Delete trash */}
                            <button
                              onClick={(e) => deleteSession(e, s.sessionId)}
                              title={t("chat.delete_chat")}
                              className="w-8 h-8 flex items-center justify-center text-text-secondary transition-colors shrink-0"
                              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = "#d47a52"}
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
      <img
        src="/logo.jpg"
        alt="thinking"
        style={{
          width: 48,
          height: 48,
          borderRadius: "50%",
          animation: "spin 1.2s linear infinite",
          objectFit: "cover",
          boxShadow: "0 0 24px rgba(155,134,160,0.45)",
          filter: "drop-shadow(0 0 12px rgba(155,134,160,0.35))",
        }}
      />
      <p
        key={idx}
        className="animate-fade-in"
        style={{
          fontFamily: "var(--font-heading, 'Cormorant Garamond', Georgia, serif)",
          fontStyle: "italic",
          fontWeight: 400,
          fontSize: "1rem",
          color: "var(--text-secondary, #8a9e8d)",
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
    <Suspense fallback={<div className="min-h-screen bg-forest-deep flex items-center justify-center"><span className="rounded-full" style={{ width: "8px", height: "8px", background: "var(--wisteria)", boxShadow: "0 0 16px rgba(155,134,160,0.5)", animation: "pulse 2.4s ease-in-out infinite" }} /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}
