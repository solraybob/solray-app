// Chat history: the device cache and its sync with the server.
//
// localStorage is the cache; the server is the source of truth. The chat
// page saves locally first (instant render) and then uploads. Devices that
// come online later read the server's copy.
//
// The server merges every upload into its copy by message id, atomically
// (a row lock and a revision number), so an upload never erases a turn
// another device wrote, even one written in the same instant. Its reply
// carries the merged transcript, which this device takes into its cache.
// Rules on this side:
//  1. An upload names the revision this device last saw (`base_revision`)
//     and, for a conversation the server held before, `expect_existing`, so
//     one deleted on another device is never recreated.
//  2. Until the server has reported a revision for a conversation (a server
//     from before the merge), an upload first reads the server's copy and
//     sends the union, as before.
//  3. Nothing is uploaded until this device has reconciled with the server
//     at least once for the signed-in account (syncSessionsFromServer). If
//     that fails (offline, server error), writes stay local and are marked
//     unsent; they go up after the next successful reconciliation.
// Writes for one conversation (uploads and its deletion) run one after
// another in the order they were made.

export {
  type ChatMessage,
  type StoredSession,
  getSessionIds,
  saveSessionIds,
  loadSession,
  storeTranscript,
  removeCachedSession,
  type EvictedSummary,
  getEvictedSummary,
  restoreEvicted,
  type HistoryEntry,
  historySessions,
  saveSession,
} from "./chat-sync/store";
export {
  getServerConfirmed,
  markServerConfirmed,
  unmarkServerConfirmed,
  getUnsent,
  markUnsent,
  getPendingRenames,
  markRenamePending,
  getLocalMeta,
  setSessionLocalMeta,
  CHAT_MERGED_EVENT,
  settled,
  noteNewSession,
} from "./chat-sync/marks";
export {
  CHAT_STATUS_EVENT,
  isOwnStatusEvent,
  markMessagePending,
  settleMessage,
  releaseMessage,
  forgetMessage,
  type SendLifecycle,
  beginSend,
  type MessageStatus,
  messageStatuses,
  uploadableMessages,
} from "./chat-sync/status";
export {
  updateStoredSession,
  pushSessionToServer,
  deleteSessionOnServer,
  bindChatSyncToAccount,
  ChatSyncUnavailable,
} from "./chat-sync/push";
export {
  fetchSessionFromServer,
  syncSessionsFromServer,
} from "./chat-sync/pull";
