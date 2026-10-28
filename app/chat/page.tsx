"use client";

import { Suspense } from "react";
import { useChatState } from "./_hooks/useChatState";
import { useChatOpening } from "./_hooks/useChatOpening";
import { useChatSessions } from "./_hooks/useChatSessions";
import { useChatSend } from "./_hooks/useChatSend";
import { useChatVoice } from "./_hooks/useChatVoice";
import { renderChat } from "./_components/ChatView";

// ─── Main Page ──────────────────────────────────────────────────────────────

function ChatPageInner() {
  const chatState = useChatState();
  const chatOpening = useChatOpening(chatState);
  const chatSessions = useChatSessions({ ...chatState, ...chatOpening });
  const chatSend = useChatSend({ ...chatState, ...chatSessions });
  const chatVoice = useChatVoice(chatState);
  return renderChat({ ...chatState, ...chatOpening, ...chatSessions, ...chatSend, ...chatVoice });
}

export default function ChatPage() {
  return (
    <Suspense fallback={<div className="min-h-screen bg-forest-deep flex items-center justify-center"><span className="rounded-full" style={{ width: "8px", height: "8px", background: "var(--wisteria)", boxShadow: "0 0 16px rgba(176,46,114,0.5)", animation: "pulse 2.4s ease-in-out infinite" }} /></div>}>
      <ChatPageInner />
    </Suspense>
  );
}
