"use client";

import { useEffect, useRef, useState, useCallback, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import ReactMarkdown from "react-markdown";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO string for serialisation
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

// ─── Text renderer ──────────────────────────────────────────────────────────

function MessageContent({ content, showCursor }: { content: string; showCursor?: boolean }) {
  return (
    <div className="font-body text-sm leading-relaxed">
      <ReactMarkdown
        components={{
          p: ({ children }) => <p className="mb-3 last:mb-0">{children}</p>,
          strong: ({ children }) => (
            <strong className="font-semibold text-text-primary">{children}</strong>
          ),
          h1: ({ children }) => (
            <h1 className="font-heading text-xl text-text-primary mb-2 mt-3 first:mt-0">{children}</h1>
          ),
          h2: ({ children }) => (
            <h2 className="font-heading text-lg text-text-primary mb-2 mt-3 first:mt-0">{children}</h2>
          ),
          h3: ({ children }) => (
            <h3 className="font-heading text-base text-amber-sun mb-1 mt-2 first:mt-0">{children}</h3>
          ),
          em: ({ children }) => (
            <em className="italic text-text-secondary">{children}</em>
          ),
          ul: ({ children }) => (
            <ul className="list-disc list-inside mb-3 space-y-1">{children}</ul>
          ),
          ol: ({ children }) => (
            <ol className="list-decimal list-inside mb-3 space-y-1">{children}</ol>
          ),
          li: ({ children }) => (
            <li className="text-text-primary">{children}</li>
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
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [energyTag, setEnergyTag] = useState("Gate 57. Intuition");
  const [showHistory, setShowHistory] = useState(false);
  const [pastSessions, setPastSessions] = useState<StoredSession[]>([]);

  // Streaming state
  const [streamingId, setStreamingId] = useState<string | null>(null);
  const [streamedLength, setStreamedLength] = useState(0);

  // Rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();
  const searchParams = useSearchParams();

  // ── Streaming effect ──────────────────────────────────────────────────────
  useEffect(() => {
    if (!streamingId) return;
    const msg = messages.find((m) => m.id === streamingId);
    if (!msg) return;

    if (streamedLength >= msg.content.length) {
      setStreamingId(null);
      return;
    }

    const charDelay = msg.content.length > 600 ? 5 : 10;
    const timer = setTimeout(() => {
      setStreamedLength((l) => l + 1);
    }, charDelay);

    return () => clearTimeout(timer);
  }, [streamingId, streamedLength, messages]);

  // ── Build a greeting message ──────────────────────────────────────────────
  const buildGreeting = useCallback(
    async (forToken: string | null): Promise<Message> => {
      let content = "";

      try {
        const data = await apiFetch("/forecast/today", {}, forToken);

        if (data?.morning_greeting) {
          content = data.morning_greeting;
        } else {
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

          let aspectStr = "";
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
            const orb =
              top.orb != null
                ? ` within ${Math.round(top.orb * 10) / 10} degrees`
                : "";
            if (planet && aspectType && target) {
              aspectStr = `${planet} ${aspectType}s your natal ${target} today${orb}.`;
            }
          }

          if (sunSign || moonSign) {
            const skyLine = [
              sunSign && `Sun in ${sunSign}`,
              moonSign && `Moon in ${moonSign}`,
            ]
              .filter(Boolean)
              .join(", ");
            content = `${skyLine}.${aspectStr ? " " + aspectStr : ""} What does your body already know about this?`;
          } else if (aspectStr) {
            content = `${aspectStr} What does your body already know about this?`;
          } else {
            content = "The sky is moving today. What's stirring in you?";
          }
        }

        if (data?.tags?.human_design) {
          setEnergyTag(data.tags.human_design);
        }
      } catch {
        try {
          const user = await apiFetch("/users/me", {}, forToken);
          const natalSun =
            (user?.natal_chart as { sun?: { sign?: string } })?.sun?.sign ||
            (user as { sun_sign?: string })?.sun_sign ||
            "";
          const natalMoon =
            (user?.natal_chart as { moon?: { sign?: string } })?.moon?.sign ||
            (user as { moon_sign?: string })?.moon_sign ||
            "";

          if (natalSun || natalMoon) {
            const parts = [
              natalSun && `${natalSun} Sun`,
              natalMoon && `${natalMoon} Moon`,
            ]
              .filter(Boolean)
              .join(", ");
            content = `${parts}. The morning is yours. What needs clarity today?`;
          } else {
            content = "The morning is yours. What needs clarity today?";
          }
        } catch {
          content = "The morning is yours. What needs clarity today?";
        }
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
      const isCompat = searchParams?.get("compat") === "1";
      if (isCompat) {
        try {
          const raw = sessionStorage.getItem("solray_compat_context");
          if (raw) {
            const ctx = JSON.parse(raw) as {
              soulName: string;
              introMessage: string;
            };
            sessionStorage.removeItem("solray_compat_context");

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
            saveSession(newSession);
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
              saveSession({ ...newSession, messages: [...newSession.messages, reply] });
            } catch {
              const reply: Message = {
                id: (Date.now() + 1).toString(),
                role: "assistant",
                content: `I feel the thread between you and ${ctx.soulName}. Your energies hold a particular kind of mirror for each other, one that invites both recognition and growth.`,
                timestamp: new Date().toISOString(),
              };
              setMessages((prev) => [...prev, reply]);
              setStreamedLength(0);
              setStreamingId(reply.id);
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
        const greeting = await buildGreeting(token);
        const newSession: StoredSession = {
          sessionId: sid,
          date: todayLabel(),
          messages: [greeting],
        };
        saveSession(newSession);
        setMessages([greeting]);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, buildGreeting]);

  // ── Persist messages whenever they change ─────────────────────────────────
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const existing = loadSession(sessionId);
    saveSession({
      sessionId,
      date: todayLabel(),
      customName: existing?.customName,
      messages,
    });
  }, [messages, sessionId]);

  // ── Auto-scroll (only if user hasn't scrolled up) ────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Detect if user has manually scrolled up
  const handleScroll = useCallback(() => {
    const el = scrollContainerRef.current;
    if (!el) return;
    const distFromBottom = el.scrollHeight - el.scrollTop - el.clientHeight;
    setAutoScroll(distFromBottom < 60);
  }, []);

  // Auto-scroll when new content arrives, but only if user is near the bottom
  useEffect(() => {
    if (autoScroll) {
      const el = scrollContainerRef.current;
      if (el) el.scrollTop = el.scrollHeight;
    }
  }, [messages, streamedLength, autoScroll]);

  // When user sends message, re-enable auto-scroll
  const resetScroll = useCallback(() => {
    setAutoScroll(true);
  }, []);

  // ── New Chat ──────────────────────────────────────────────────────────────
  const startNewChat = useCallback(async () => {
    if (!token) return;
    const sid = generateSessionId();
    setSessionId(sid);
    const greeting = await buildGreeting(token);
    const newSession: StoredSession = {
      sessionId: sid,
      date: todayLabel(),
      messages: [greeting],
    };
    saveSession(newSession);
    setMessages([greeting]);
    setShowHistory(false);
  }, [token, buildGreeting]);

  // ── Load past session ─────────────────────────────────────────────────────
  const loadPastSession = useCallback((sid: string) => {
    const session = loadSession(sid);
    if (session) {
      setSessionId(session.sessionId);
      setMessages(session.messages);
      setShowHistory(false);
      setRenamingId(null);
    }
  }, []);

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
      saveSession(updated);
      setPastSessions((prev) =>
        prev.map((s) => (s.sessionId === sid ? updated : s))
      );
      setRenamingId(null);
    },
    [renameValue]
  );

  // ── Send message ──────────────────────────────────────────────────────────
  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
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
      const data = await apiFetch(
        "/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: userMsg.content,
            conversation_history: history,
          }),
        },
        token
      );

      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || data.message || "I hear you.",
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      // Kick off streaming effect
      setStreamedLength(0);
      setStreamingId(reply.id);
    } catch {
      const mockReplies = [
        "The pattern you're sensing is real. Trust that recognition. Your intuition rarely lies at this depth.",
        "There is wisdom in what you're sitting with. Let it breathe a little longer before you act.",
        "I see the tension you're holding. What would it feel like to release just one layer of it today?",
        "This is the question beneath the question. What does your body tell you when you sit quietly with it?",
        "You already know. The knowing lives in a place quieter than thought.",
      ];
      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: mockReplies[Math.floor(Math.random() * mockReplies.length)],
        timestamp: new Date().toISOString(),
      };
      setMessages((prev) => [...prev, reply]);
      setStreamedLength(0);
      setStreamingId(reply.id);
    } finally {
      setSending(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  const formatTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString("en-GB", {
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep flex flex-col">
        {/* Header */}
        <div className="bg-forest-deep/90 backdrop-blur-sm border-b border-forest-border/50 px-5 pt-12 pb-4">
          <div className="max-w-lg mx-auto">
            <p className="text-text-secondary text-[10px] font-body tracking-[0.2em] uppercase mb-1">
              Your Higher Self
            </p>
            <div className="flex items-center justify-between">
              <h1 className="font-heading text-2xl text-text-primary">Solray</h1>
              <div className="flex items-center gap-2">
                <button
                  onClick={openHistory}
                  title="Previous chats"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-forest-card transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                <button
                  onClick={startNewChat}
                  title="New chat"
                  className="px-3 py-1 rounded-lg bg-forest-card border border-forest-border text-text-secondary text-[10px] font-body tracking-wide hover:border-amber-sun hover:text-amber-sun transition-colors"
                >
                  + New
                </button>
                <span className="px-3 py-1 rounded-full border border-forest-border text-text-secondary text-[10px] font-body tracking-wide">
                  {energyTag}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Messages */}
        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-5 py-4 pb-32" onScroll={handleScroll}>
          <div className="max-w-lg mx-auto space-y-4">
            {messages.map((msg) => {
              const isStreaming = streamingId === msg.id;
              const displayContent = isStreaming
                ? msg.content.slice(0, streamedLength)
                : msg.content;

              return (
                <div
                  key={msg.id}
                  className={`flex animate-slide-up ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`max-w-[80%] ${msg.role === "user" ? "items-end" : "items-start"} flex flex-col`}>
                    <div
                      className={`rounded-2xl px-4 py-3 ${
                        msg.role === "user"
                          ? "bg-amber-sun text-forest-deep rounded-br-sm"
                          : "bg-forest-card border border-forest-border text-text-primary rounded-bl-sm"
                      }`}
                    >
                      <MessageContent content={displayContent} showCursor={isStreaming} />
                    </div>
                    <span className="text-text-secondary text-[10px] font-body mt-1 px-1">
                      {formatTime(msg.timestamp)}
                    </span>
                  </div>
                </div>
              );
            })}

            {sending && (
              <div className="flex justify-start animate-fade-in pl-2">
                <img
                  src="/logo.jpg"
                  alt="thinking"
                  style={{
                    width: 48,
                    height: 48,
                    borderRadius: "50%",
                    animation: "spin 1.2s linear infinite",
                    objectFit: "cover",
                  }}
                />
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>
        </div>

        {/* Input */}
        <div className="fixed bottom-0 left-0 right-0 bg-forest-dark border-t border-forest-border px-5 py-3 pb-20">
          <div className="max-w-lg mx-auto flex gap-3 items-center">
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Speak freely…"
              className="flex-1 bg-forest-card border border-forest-border rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors"
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || sending}
              className="w-11 h-11 rounded-xl bg-amber-sun text-forest-deep flex items-center justify-center transition-all duration-200 hover:opacity-90 active:scale-95 disabled:opacity-30 shrink-0"
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

        {/* History Panel */}
        {showHistory && (
          <div className="fixed inset-0 z-50 flex items-end justify-center" onClick={() => setShowHistory(false)}>
            <div
              className="bg-forest-dark border border-forest-border rounded-t-2xl w-full max-w-lg flex flex-col max-h-[70vh] mb-16"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Fixed header */}
              <div className="flex items-center justify-between px-5 pt-5 pb-4 shrink-0">
                <h2 className="font-heading text-lg text-text-primary">Previous Chats</h2>
                <button onClick={() => setShowHistory(false)} className="text-text-secondary hover:text-text-primary">
                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                  </svg>
                </button>
              </div>
              {/* Scrollable list */}
              <div className="overflow-y-auto flex-1 px-5 pb-8" style={{ WebkitOverflowScrolling: "touch" }}>
                {pastSessions.length === 0 ? (
                  <p className="text-text-secondary font-body text-sm text-center py-6">No previous chats yet.</p>
                ) : (
                  <div className="space-y-2">
                    {pastSessions.map((s) => (
                      <div key={s.sessionId} className="relative">
                        {renamingId === s.sessionId ? (
                          /* Inline rename input */
                          <div className="flex items-center gap-2 px-4 py-3 rounded-xl border border-amber-sun bg-forest-card">
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
                              className="flex-1 bg-transparent text-text-primary font-body text-sm outline-none placeholder-text-secondary"
                            />
                            <button
                              onMouseDown={(e) => { e.preventDefault(); commitRename(s.sessionId); }}
                              className="text-amber-sun text-xs font-body"
                            >
                              Save
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => loadPastSession(s.sessionId)}
                              className={`flex-1 text-left px-4 py-3 rounded-xl border transition-colors ${
                                s.sessionId === sessionId
                                  ? "border-amber-sun bg-forest-card text-text-primary"
                                  : "border-forest-border bg-forest-card text-text-secondary hover:border-amber-sun/50 hover:text-text-primary"
                              }`}
                            >
                              <p className="font-body text-xs tracking-wide mb-1 text-text-secondary">
                                {s.customName || s.date}
                              </p>
                              <p className="font-body text-sm truncate">
                                {s.messages.find((m) => m.role === "user")?.content || "No messages yet"}
                              </p>
                            </button>
                            {/* Rename pencil */}
                            <button
                              onClick={(e) => startRename(e, s.sessionId, s.customName || s.date)}
                              title="Rename chat"
                              className="w-8 h-8 flex items-center justify-center text-text-secondary hover:text-amber-sun transition-colors shrink-0"
                            >
                              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                                <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                                <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
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

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-forest-deep flex items-center justify-center"><LoadingSpinner size="lg" /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}
