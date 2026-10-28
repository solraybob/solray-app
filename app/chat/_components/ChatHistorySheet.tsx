"use client";

import type { useChatState } from "../_hooks/useChatState";
import type { useChatOpening } from "../_hooks/useChatOpening";
import type { useChatSessions } from "../_hooks/useChatSessions";
import type { useChatSend } from "../_hooks/useChatSend";
import type { useChatVoice } from "../_hooks/useChatVoice";

export function renderChatHistory(pageCtx: ReturnType<typeof useChatState> & ReturnType<typeof useChatOpening> & ReturnType<typeof useChatSessions> & ReturnType<typeof useChatSend> & ReturnType<typeof useChatVoice>) {
  const {
    commitRename, confirmDeleteId, deleteSession, historyError, historyOpening, loadPastSession,
    pastSessions, renameValue, renamingId, sending, sessionId, setConfirmDeleteId, setRenameValue,
    setRenamingId, setShowHistory, startRename, t
  } = pageCtx;
  return (
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
  );
}
