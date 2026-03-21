"use client";

import { useEffect, useRef, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import BottomNav from "@/components/BottomNav";
import LoadingSpinner from "@/components/LoadingSpinner";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: Date;
}

const MORNING_GREETING =
  "Good morning. I feel your energy today — a quiet readiness beneath the surface. The universe is arranging something for you. What's on your mind?";

export default function ChatPage() {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: "greeting",
      role: "assistant",
      content: MORNING_GREETING,
      timestamp: new Date(),
    },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [energyTag, setEnergyTag] = useState("Gate 57 — Intuition");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { token } = useAuth();

  useEffect(() => {
    // Try to load greeting from forecast
    async function loadGreeting() {
      try {
        const data = await apiFetch("/forecast/today", {}, token);
        if (data.morning_greeting) {
          setMessages([
            {
              id: "greeting",
              role: "assistant",
              content: data.morning_greeting,
              timestamp: new Date(),
            },
          ]);
        }
        if (data.tags?.human_design) {
          setEnergyTag(data.tags.human_design);
        }
      } catch {
        // keep defaults
      }
    }
    if (token) loadGreeting();
  }, [token]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;

    const userMsg: Message = {
      id: Date.now().toString(),
      role: "user",
      content: input.trim(),
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setSending(true);

    try {
      const data = await apiFetch(
        "/chat",
        {
          method: "POST",
          body: JSON.stringify({ message: userMsg.content }),
        },
        token
      );

      const reply: Message = {
        id: (Date.now() + 1).toString(),
        role: "assistant",
        content: data.response || data.message || "I hear you.",
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, reply]);
    } catch {
      // Mock response when API unavailable
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
        timestamp: new Date(),
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

  const formatTime = (date: Date) => {
    return date.toLocaleTimeString("en-GB", { hour: "2-digit", minute: "2-digit" });
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
              <span className="px-3 py-1 rounded-full border border-forest-border text-text-secondary text-[10px] font-body tracking-wide">
                {energyTag}
              </span>
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
                    <p className="font-body text-sm leading-relaxed">{msg.content}</p>
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

        <BottomNav />
      </div>
    </ProtectedRoute>
  );
}
