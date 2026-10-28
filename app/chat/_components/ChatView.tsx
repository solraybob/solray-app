"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { Wordmark } from "@/components/Wordmark";
import type { useChatState } from "../_hooks/useChatState";
import type { useChatOpening } from "../_hooks/useChatOpening";
import type { useChatSessions } from "../_hooks/useChatSessions";
import type { useChatSend } from "../_hooks/useChatSend";
import type { useChatVoice } from "../_hooks/useChatVoice";
import { renderChatMessages } from "./ChatMessages";
import { renderChatComposer } from "./ChatComposer";
import { renderChatHistory } from "./ChatHistorySheet";

export function renderChat(pageCtx: ReturnType<typeof useChatState> & ReturnType<typeof useChatOpening> & ReturnType<typeof useChatSessions> & ReturnType<typeof useChatSend> & ReturnType<typeof useChatVoice>) {
  const {
    openHistory, scrollContainerRef, sending, setAutoScrollBoth, setShowJumpButton, showHistory,
    showJumpButton, startNewChat, t
  } = pageCtx;
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
          {renderChatMessages(pageCtx)}
        </div>

        {/* Input */}
        <div className="fixed bottom-0 left-0 right-0 border-t px-5 pt-3" style={{ paddingBottom: "calc(80px + var(--sab, 0px))", background: "rgb(var(--rgb-bg-deep))", borderColor: "rgb(var(--rgb-border))" }}>
          {renderChatComposer(pageCtx)}
        </div>

        {/* History Panel */}
        {showHistory && (
          renderChatHistory(pageCtx)
        )}

      </div>
    </ProtectedRoute>
  );
}
