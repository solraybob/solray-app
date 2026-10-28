"use client";

import { MessageContent } from "./MessageContent";
import { ThinkingIndicator } from "./ThinkingIndicator";
import type { useChatState } from "../_hooks/useChatState";
import type { useChatOpening } from "../_hooks/useChatOpening";
import type { useChatSessions } from "../_hooks/useChatSessions";
import type { useChatSend } from "../_hooks/useChatSend";
import type { useChatVoice } from "../_hooks/useChatVoice";

export function renderChatMessages(pageCtx: ReturnType<typeof useChatState> & ReturnType<typeof useChatOpening> & ReturnType<typeof useChatSessions> & ReturnType<typeof useChatSend> & ReturnType<typeof useChatVoice>) {
  const {
    copiedId, copyMessage, editRefused, formatTime, markResonance, messages, msgStatuses,
    removeInterrupted, resendInterrupted, resonatedIds, sendMessage, sending, soulBlueprint, soulRef,
    streamedLength, streamingId, suggestions, suggestionsArmedAt, t
  } = pageCtx;
  return (
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
  );
}
