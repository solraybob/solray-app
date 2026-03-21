"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string; // ISO string for serialisation
}

interface StoredSession {
  sessionId: string;
  date: string; // human-readable date label
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

function MessageContent({ content }: { content: string }) {
  const paragraphs = content.split(/\n\n+/);
  return (
    <>
      {paragraphs.map((para, pi) => (
        <p key={pi} className={`font-body text-sm leading-relaxed ${pi < paragraphs.length - 1 ? "mb-3" : ""}`}>
          {para.split(/\n/).map((line, li, arr) => (
            <span key={li}>
              {line}
              {li < arr.length - 1 && <br />}
            </span>
          ))}
        </p>
      ))}
    </>
  );
}

// ─── Main Page ──────────────────────────────────────────────────────────────

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [sessionId, setSessionId] = useState<string>("");
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [energyTag, setEnergyTag] = useState("Gate 57 — Intuition");
  const [showHistory, setShowHistory] = useState(false);
  const [pastSessions, setPastSessions] = useState<StoredSession[]>([]);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();

  // ── Build a greeting message ──────────────────────────────────────────────
  const buildGreeting = useCallback(
    async (forToken: string | null): Promise<Message> => {
      let content = "";

      try {
        const data = await apiFetch("/forecast/today", {}, forToken);

        if (data?.morning_greeting) {
          // AI-generated greeting takes priority
          content = data.morning_greeting;
        } else {
          // Build from raw transit data
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

          // Most significant aspect = lowest orb
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
        // Forecast failed — fall back to natal chart from /users/me
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
      const ids = getSessionIds();
      const lastId = ids[0];
      const last = lastId ? loadSession(lastId) : null;

      if (last && last.messages.length > 0) {
        // restore last session
        setSessionId(last.sessionId);
        setMessages(last.messages);
      } else {
        // new session with fresh greeting
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
  }, [token, buildGreeting]);

  // ── Persist messages whenever they change ─────────────────────────────────
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    saveSession({ sessionId, date: todayLabel(), messages });
  }, [messages, sessionId]);

  // ── Auto-scroll ───────────────────────────────────────────────────────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

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
  }, []);

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

    // Build conversation history (exclude greeting if it's the only prior message)
    const history = updatedMessages
      .filter((m) => m.id !== "greeting")
      .slice(0, -1) // exclude the message we just added (it's sent as "message")
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
    } catch {
      const mockReplies = [
        "The pattern you're sensing is real. Trust that recognition — your intuition rarely lies at this depth.",
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
                {/* Previous chats icon */}
                <button
                  onClick={openHistory}
                  title="Previous chats"
                  className="w-8 h-8 flex items-center justify-center rounded-lg text-text-secondary hover:text-text-primary hover:bg-forest-card transition-colors"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
                  </svg>
                </button>
                {/* New chat button */}
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
        <div className="flex-1 overflow-y-auto px-5 py-4 pb-32">
          <div className="max-w-lg mx-auto space-y-4">
            {messages.map((msg) => (
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
                    <MessageContent content={msg.content} />
                  </div>
                  <span className="text-text-secondary text-[10px] font-body mt-1 px-1">
                    {formatTime(msg.timestamp)}
                  </span>
                </div>
              </div>
            ))}

            {sending && (
              <div className="flex justify-start animate-fade-in">
                <div className="bg-forest-card border border-forest-border rounded-2xl rounded-bl-sm px-4 py-3">
                  <div className="flex gap-1.5 items-center h-4">
                    <div className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: "0ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: "150ms" }} />
                    <div className="w-1.5 h-1.5 rounded-full bg-text-secondary animate-bounce" style={{ animationDelay: "300ms" }} />
                  </div>
                </div>
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
              className="bg-forest-dark border border-forest-border rounded-t-2xl w-full max-w-lg flex flex-col max-h-[60vh]"
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
              <div className="overflow-y-auto flex-1 px-5 pb-8" style={{WebkitOverflowScrolling: 'touch', overflowY: 'scroll'}}>
                {pastSessions.length === 0 ? (
                  <p className="text-text-secondary font-body text-sm text-center py-6">No previous chats yet.</p>
                ) : (
                  <div className="space-y-2">
                    {pastSessions.map((s) => (
                      <button
                        key={s.sessionId}
                        onClick={() => loadPastSession(s.sessionId)}
                        className={`w-full text-left px-4 py-3 rounded-xl border transition-colors ${
                          s.sessionId === sessionId
                            ? "border-amber-sun bg-forest-card text-text-primary"
                            : "border-forest-border bg-forest-card text-text-secondary hover:border-amber-sun/50 hover:text-text-primary"
                        }`}
                      >
                        <p className="font-body text-xs tracking-wide mb-1">{s.date}</p>
                        <p className="font-body text-sm truncate">
                          {s.messages.find((m) => m.role === "user")?.content || "No messages yet"}
                        </p>
                      </button>
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
