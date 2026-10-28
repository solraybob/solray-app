"use client";

import LoadingSpinner from "@/components/LoadingSpinner";
import { openAiConsentSheet } from "@/lib/ai-consent";
import { loadSession } from "@/lib/chat-sync";
import type { useChatState } from "../_hooks/useChatState";
import type { useChatOpening } from "../_hooks/useChatOpening";
import type { useChatSessions } from "../_hooks/useChatSessions";
import type { useChatSend } from "../_hooks/useChatSend";
import type { useChatVoice } from "../_hooks/useChatVoice";

export function renderChatComposer(pageCtx: ReturnType<typeof useChatState> & ReturnType<typeof useChatOpening> & ReturnType<typeof useChatSessions> & ReturnType<typeof useChatSend> & ReturnType<typeof useChatVoice>) {
  const {
    chatNotice, conversationExists, discardOrphanVoice, handleKeyDown, input, inputRef, isRecording,
    loadPastSession, parkedToOrphan, recoverOrphanVoice, sendMessage, sending, sessionId,
    setChatNotice, setInput, startNewChat, t, toggleRecording, transcribing, voiceError, voiceOrphan,
    voiceSupported
  } = pageCtx;
  return (
          <div className="max-w-lg lg:max-w-[620px] mx-auto">
            {voiceOrphan && (
              <div
                role="status"
                className="mb-3 rounded-2xl px-4 py-3"
                style={{ background: "rgb(var(--rgb-card))", border: "1px solid rgb(var(--rgb-border))" }}
              >
                <p className="font-body text-text-primary text-[15px] leading-relaxed">
                  {t("chat.voice_orphan")}
                </p>
                <div className="flex items-center gap-5 mt-2">
                  <button
                    onClick={recoverOrphanVoice}
                    className="font-body font-bold text-[14px] rounded-full px-5"
                    style={{ minHeight: 40, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))" }}
                  >
                    {t("chat.voice_orphan_use")}
                  </button>
                  <button
                    onClick={discardOrphanVoice}
                    className="font-body text-[15px] text-text-secondary hover:opacity-80 transition-opacity"
                  >
                    {t("chat.voice_orphan_discard")}
                  </button>
                </div>
              </div>
            )}
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
                {chatNotice.kind === "voice_elsewhere" && (
                  <p className="font-body text-text-primary text-[15px] leading-relaxed">
                    {t("chat.voice_elsewhere")}
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
                  {chatNotice.kind === "voice_elsewhere" && (
                    <button
                      onClick={() => {
                        const to = chatNotice.target;
                        // Gone meanwhile (deleted on another device): its
                        // words become the offer to keep or discard.
                        if (!conversationExists(to)) { parkedToOrphan(to); return; }
                        // Cached here: it opens now (its words go into its
                        // box). Evicted: it is read back first, and the notice
                        // stays until it opens (cleared then) or turns out to
                        // be gone (the offer), so a failed read can be tried
                        // again from here.
                        if (loadSession(to)) setChatNotice(null);
                        loadPastSession(to);
                      }}
                      disabled={sending}
                      className="font-body font-bold text-[14px] rounded-full px-5"
                      style={{ minHeight: 40, background: "rgb(var(--rgb-text-primary))", color: "rgb(var(--rgb-bg-deep))" }}
                    >
                      {t("chat.voice_open_conversation")}
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
                  className="w-11 h-11 rounded-xl flex items-center justify-center transition duration-200 active:scale-95 disabled:opacity-50 shrink-0 self-end"
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
                className="h-11 px-2 flex items-center justify-center transition duration-200 hover:opacity-70 active:scale-95 disabled:opacity-30 shrink-0 self-end font-body text-[17px] font-bold bg-transparent"
                style={{ color: "rgb(var(--rgb-ember))" }}
              >
                {sending ? <LoadingSpinner size="sm" /> : t("chat.send")}
              </button>
            </div>
          </div>
  );
}
