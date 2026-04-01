"use client";

import { useEffect, useState, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
  sender_name?: string;
  timestamp?: number;
}

interface SessionData {
  connection_id: string;
  soul_name: string;
  soul_id: string;
  created_at: number;
}

const STORAGE_KEY_PREFIX = "solray_group_chat_";

function loadHistory(code: string): ChatMessage[] {
  try {
    return JSON.parse(localStorage.getItem(`${STORAGE_KEY_PREFIX}${code}`) || "[]");
  } catch {
    return [];
  }
}

function saveHistory(code: string, history: ChatMessage[]) {
  localStorage.setItem(`${STORAGE_KEY_PREFIX}${code}`, JSON.stringify(history));
}

export default function GroupChatPage() {
  const { code } = useParams<{ code: string }>();
  const { token, user } = useAuth();
  const router = useRouter();

  const [session, setSession] = useState<SessionData | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [history, setHistory] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [initialising, setInitialising] = useState(true);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Load session data
  useEffect(() => {
    if (!code) return;
    const sessions = JSON.parse(localStorage.getItem("solray_group_sessions") || "{}");
    const s = sessions[code as string];
    if (!s) {
      // Try to infer from connection list (for joined sessions without local storage)
      setNotFound(true);
    } else {
      setSession(s);
    }
    setHistory(loadHistory(code as string));
    setInitialising(false);
  }, [code]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [history]);

  const sendMessage = async () => {
    if (!input.trim() || !session || !token || !user) return;
    const message = input.trim();
    setInput("");

    const senderName = user.name || user.email || "You";
    const userMsg: ChatMessage = {
      role: "user",
      content: `${senderName}: ${message}`,
      sender_name: senderName,
      timestamp: Date.now(),
    };

    const updatedHistory = [...history, userMsg];
    setHistory(updatedHistory);
    saveHistory(code as string, updatedHistory);
    setLoading(true);

    try {
      // Build history for API (strip sender prefix from content to avoid double-attribution)
      const apiHistory = updatedHistory.slice(0, -1).map(m => ({
        role: m.role,
        content: m.content,
      }));

      const data = await apiFetch("/chat/group", {
        method: "POST",
        body: JSON.stringify({
          message,
          sender_username: senderName,
          soul_connection_id: session.connection_id,
          conversation_history: apiHistory,
        }),
      }, token);

      const aiMsg: ChatMessage = {
        role: "assistant",
        content: data.response,
        timestamp: Date.now(),
      };
      const finalHistory = [...updatedHistory, aiMsg];
      setHistory(finalHistory);
      saveHistory(code as string, finalHistory);
    } catch (e: unknown) {
      const errMsg = e instanceof Error ? e.message : "Something went wrong";
      const errMsgObj: ChatMessage = {
        role: "assistant",
        content: `Could not reach the guide right now. (${errMsg})`,
        timestamp: Date.now(),
      };
      const finalHistory = [...updatedHistory, errMsgObj];
      setHistory(finalHistory);
      saveHistory(code as string, finalHistory);
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (initialising) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-forest-deep flex items-center justify-center">
          <LoadingSpinner size="lg" />
        </div>
      </ProtectedRoute>
    );
  }

  if (notFound) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-forest-deep flex flex-col items-center justify-center px-5 text-center">
          <div className="text-4xl mb-4">✦</div>
          <h2 className="font-heading text-3xl text-text-primary mb-2">Session not found</h2>
          <p className="text-text-secondary text-sm font-body mb-6 max-w-xs">
            This session code was not found on this device. If someone shared this link with you, ask them to resend it.
          </p>
          <button
            onClick={() => router.push("/souls")}
            className="px-6 py-3 bg-amber-sun text-forest-deep font-body font-semibold rounded-xl text-sm"
          >
            Back to Souls
          </button>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-forest-deep flex flex-col">
        {/* Header */}
        <div className="px-5 pt-12 pb-4 border-b border-forest-border flex items-center gap-3 max-w-lg mx-auto w-full">
          <button
            onClick={() => router.back()}
            className="text-text-secondary hover:text-text-primary transition-colors"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <polyline points="15 18 9 12 15 6"/>
            </svg>
          </button>
          <div className="flex-1">
            <h1 className="font-heading text-xl text-text-primary">
              Group Reading with {session?.soul_name || "Soul"}
            </h1>
            <p className="text-text-secondary text-xs font-body">Session #{code}</p>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto px-5 py-4 max-w-lg mx-auto w-full space-y-4">
          {history.length === 0 && (
            <div className="text-center pt-8">
              <div className="text-3xl mb-3">✦</div>
              <p className="font-heading text-xl text-text-primary mb-1">Both of you are present</p>
              <p className="text-text-secondary text-sm font-body max-w-xs mx-auto">
                The guide holds both charts. Either of you can ask a question. The AI will address you by name.
              </p>
            </div>
          )}

          {history.map((msg, i) => (
            <div
              key={i}
              className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`max-w-[85%] rounded-2xl px-4 py-3 ${
                  msg.role === "user"
                    ? "bg-amber-sun/10 border border-amber-sun/20 text-text-primary"
                    : "bg-forest-card border border-forest-border text-text-primary"
                }`}
              >
                <p className="font-body text-sm whitespace-pre-wrap leading-relaxed">
                  {msg.content}
                </p>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex justify-start">
              <div className="bg-forest-card border border-forest-border rounded-2xl px-4 py-3">
                <LoadingSpinner size="sm" />
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="px-5 pb-8 pt-3 border-t border-forest-border max-w-lg mx-auto w-full">
          <div className="flex items-end gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder={`Ask as ${user?.name || "yourself"}...`}
              rows={1}
              className="flex-1 bg-forest-card border border-forest-border rounded-xl px-4 py-3 text-text-primary placeholder-text-secondary font-body text-sm focus:border-amber-sun transition-colors resize-none"
              style={{ maxHeight: "120px", overflowY: "auto" }}
            />
            <button
              onClick={sendMessage}
              disabled={!input.trim() || loading}
              className="w-11 h-11 flex items-center justify-center bg-amber-sun text-forest-deep rounded-xl transition-all hover:opacity-90 disabled:opacity-30 shrink-0"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <line x1="22" y1="2" x2="11" y2="13"/>
                <polygon points="22 2 15 22 11 13 2 9 22 2"/>
              </svg>
            </button>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
