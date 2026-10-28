"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { captureAccount } from "@/lib/account-session";
import { CHAT_STATUS_EVENT, isOwnStatusEvent, deleteSessionOnServer, getSessionIds, loadSession, markRenamePending, markUnsent, messageStatuses, removeCachedSession, storeTranscript, saveSessionIds, getEvictedSummary, historySessions, restoreEvicted } from "@/lib/chat-sync";
import { generateSessionId, type StoredSession, todayLabel, getSoulCtx, soulRefOf, setSoulCtx } from "../_lib/chat-helpers";
import type { useChatState } from "./useChatState";
import type { useChatOpening } from "./useChatOpening";

export function useChatSessions(pageCtx: ReturnType<typeof useChatState> & ReturnType<typeof useChatOpening>) {
  const {
    accountGen, buildGreeting, cancelHistoryReadBack, isMountedRef, messages, parkedToOrphan,
    persistSession, readBackEvicted, renameValue, sending, sessionId, setChatNotice,
    setConfirmDeleteId, setHistoryError, setHistoryOpening, setMessages, setPastSessions,
    setRenameValue, setRenamingId, setSessionId, setShowHistory, setSoulBlueprint, setSoulName,
    setSoulRef, streamedLength, t, token, triggerSessionSynthesis
  } = pageCtx;
  // Messages without an answer kept on this device (lib/chat-sync): sent
  // just before the app closed or Chat was left ("interrupted"), or refused
  // as too long out of sight ("refused"). Read again whenever the thread or
  // a send changes.
  const [statusTick, setStatusTick] = useState(0);
  // A status changed out of sight (a send from a page since left was
  // refused, or released as interrupted): redraw, for this account only.
  useEffect(() => {
    const onStatus = (e: Event) => { if (isOwnStatusEvent(e)) setStatusTick((n) => n + 1); };
    window.addEventListener(CHAT_STATUS_EVENT, onStatus);
    return () => window.removeEventListener(CHAT_STATUS_EVENT, onStatus);
  }, []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const msgStatuses = useMemo(() => messageStatuses(), [messages, sending, statusTick]);

  // ── Auto-scroll (only if user hasn't scrolled up) ────────────────────────
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  // The ref is the source of truth for the streaming tick. State is just
  // for re-rendering the "Scroll to bottom" pill. Streaming fires every
  // 5-10ms; React state updates are batched, so a state-only read can be
  // stale by several ticks and yank the user back down. The ref updates
  // synchronously inside the touchstart listener, so the very next
  // streaming tick reads the new value and bails. State follows for UI.
  const autoScrollRef = useRef(true);
  const [autoScroll, setAutoScroll] = useState(true);
  // Jump-to-bottom pill visibility, driven by ACTUAL scroll position (not the
  // autoScroll flag, which a stray tap flips, making the pill appear while
  // you're already at the bottom). Kept separate so the streaming-pin logic
  // below stays untouched.
  const [showJumpButton, setShowJumpButton] = useState(false);
  const isProgrammaticScroll = useRef(false);

  const setAutoScrollBoth = useCallback((v: boolean) => {
    autoScrollRef.current = v;
    setAutoScroll(v);
  }, []);

  useEffect(() => {
    const el = scrollContainerRef.current;
    if (!el) return;

    const onUserIntent = () => {
      // Sync write so the next streaming tick (which may fire within
      // the same frame) sees this immediately. State follows.
      autoScrollRef.current = false;
      setAutoScroll(false);
    };
    el.addEventListener("touchstart", onUserIntent, { passive: true });
    el.addEventListener("wheel",      onUserIntent, { passive: true });
    el.addEventListener("mousedown",  onUserIntent, { passive: true });

    const onScroll = () => {
      if (isProgrammaticScroll.current) return;
      // Re-enable auto-scroll only when the user has explicitly scrolled
      // all the way back to the bottom themselves. Earlier this used a
      // 30px threshold, which snapped the user back down whenever their
      // momentum scroll briefly crossed near-bottom mid-drag, making
      // scroll-up during streaming feel broken. With a 4px floor (and
      // the explicit "jump to bottom" button still available below)
      // they stay in control of their position the moment they touch
      // the screen.
      const dist = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (dist <= 4) {
        autoScrollRef.current = true;
        setAutoScroll(true);
        setShowJumpButton(false);
      } else if (dist > 80) {
        // Genuinely scrolled away: show the pill. Hysteresis (show >80,
        // hide <=4) prevents flicker mid-drag.
        setShowJumpButton(true);
      }
    };
    el.addEventListener("scroll", onScroll, { passive: true });

    return () => {
      el.removeEventListener("touchstart", onUserIntent);
      el.removeEventListener("wheel",      onUserIntent);
      el.removeEventListener("mousedown",  onUserIntent);
      el.removeEventListener("scroll",     onScroll);
    };
  }, []);

  useEffect(() => {
    // Read the REF, not the state. State may be stale by 1-N ticks.
    if (!autoScrollRef.current) return;
    const el = scrollContainerRef.current;
    if (!el) return;
    isProgrammaticScroll.current = true;
    el.scrollTop = el.scrollHeight;
    const t = setTimeout(() => { isProgrammaticScroll.current = false; }, 50);
    return () => clearTimeout(t);
  }, [messages, streamedLength]);

  const resetScroll = useCallback(() => {
    setAutoScrollBoth(true);
    setShowJumpButton(false);
  }, [setAutoScrollBoth]);

  // ── New Chat ──────────────────────────────────────────────────────────────
  const startNewChat = useCallback(async () => {
    // Never switch sessions while a reply is in flight.
    if (!token || sending) return;
    // A History read-back still on its way no longer opens anything.
    cancelHistoryReadBack();
    // Synthesize the session we're leaving so memory carries forward into
    // the new one. Without this, clicking "+ New" loses everything that
    // wasn't already checkpointed in-session.
    triggerSessionSynthesis();
    setChatNotice(null);
    // A fresh chat is NOT a compat session unless the user re-enters via
    // Souls. Clear any cached soul context so we don't leak Rut's chart
    // into Bob's regular Higher Self chat.
    setSoulBlueprint(null);
    setSoulName(null);
    setSoulRef(null);
    const sid = generateSessionId();
    setSessionId(sid);
    // A new chat opens on the quiet anchor (the empty state); the Oracle
    // speaks once the person does, no auto-generated greeting.
    const newSession: StoredSession = {
      sessionId: sid,
      date: todayLabel(),
      messages: [],
    };
    persistSession(newSession);
    setMessages([]);
    setShowHistory(false);
  }, [token, sending, buildGreeting, triggerSessionSynthesis, cancelHistoryReadBack]);

  // ── Load past session ─────────────────────────────────────────────────────
  const loadPastSession = useCallback((sid: string) => {
    if (sending) return;
    // Synthesize the session we're leaving so recent context is not lost
    // when we hop back into an older one.
    const session = loadSession(sid);
    if (!session && getEvictedSummary(sid)) {
      // Evicted from this device to make room: read it back from the
      // server first, with its own loading and failure state in History.
      // (No synthesis yet: the conversation on screen stays open until
      // this one is here, and only if it is still the one chosen.)
      readBackEvicted(sid, (id) => openLoadedRef.current(id));
      return;
    }
    // Any other choice supersedes a read-back still on its way.
    cancelHistoryReadBack();
    triggerSessionSynthesis();
    if (session) {
      setChatNotice(null);
      setSessionId(session.sessionId);
      setMessages(session.messages);
      // Restore this conversation's own Dynamics context, or clear the one
      // left over from the conversation we are leaving.
      const sc = getSoulCtx(session.sessionId, session.messages);
      setSoulBlueprint(sc?.blueprint ?? null);
      setSoulName(sc?.name ?? null);
      setSoulRef(soulRefOf(sc));
      setShowHistory(false);
      setRenamingId(null);
      setHistoryOpening(null);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [triggerSessionSynthesis, sending, accountGen, t, cancelHistoryReadBack]);
  // The newest loadPastSession, for a read-back that lands later.
  const openLoadedRef = useRef(loadPastSession);
  openLoadedRef.current = loadPastSession;

  // ── Open history panel ────────────────────────────────────────────────────
  const openHistory = useCallback(() => {
    // Cached conversations, and those evicted from this device's cache
    // (listed from their summary, read back from the server on opening).
    setPastSessions(historySessions());
    setHistoryOpening(null);
    setHistoryError(null);
    setShowHistory(true);
    setRenamingId(null);
    setConfirmDeleteId(null);
  }, []);

  // ── Rename helpers ────────────────────────────────────────────────────────
  const startRename = useCallback(
    (e: React.MouseEvent, sid: string, currentName: string) => {
      e.stopPropagation();
      // An evicted conversation is read back first (its rename travels
      // with the transcript, through the pending-rename upload); the
      // editor opens once it is here, if still wanted.
      if (!loadSession(sid) && getEvictedSummary(sid)) {
        setRenamingId(null);
        readBackEvicted(sid, (id) => {
          setRenamingId(id);
          setRenameValue(currentName);
        });
        return;
      }
      cancelHistoryReadBack();
      setRenamingId(sid);
      setRenameValue(currentName);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [accountGen, t, cancelHistoryReadBack]
  );

  const commitRename = useCallback(
    (sid: string) => {
      const session = loadSession(sid);
      if (!session) {
        // Never a silent no-op: the editor closes and says why.
        setRenamingId(null);
        setHistoryError(t("chat.history_load_failed"));
        return;
      }
      const newName = renameValue.trim();
      const updated: StoredSession = {
        ...session,
        customName: newName || undefined,
      };
      // Only a rename made here holds its name against the server's copy.
      markRenamePending(sid);
      persistSession(updated);
      setPastSessions((prev) =>
        prev.map((s) => (s.sessionId === sid ? updated : s))
      );
      setRenamingId(null);
    },
    [renameValue, t]
  );

  // ── Delete session ────────────────────────────────────────────────────────
  const deleteSession = useCallback(
    (e: React.MouseEvent, sid: string) => {
      e.stopPropagation();
      if (sending) return;
      setHistoryError(null);
      // Snapshot so a failed server delete can be undone locally.
      const snapshot = loadSession(sid);
      const evictedSnap = snapshot ? null : getEvictedSummary(sid);
      const prevIds = getSessionIds();
      // Local removal first (instant UX), then propagate to server so the
      // session doesn't reappear on the next sync from another device.
      removeCachedSession(sid);
      setSoulCtx(sid, null);
      // Voice words waiting for this conversation: offered to keep or discard.
      parkedToOrphan(sid);
      const ids = prevIds.filter((id) => id !== sid);
      saveSessionIds(ids);
      setPastSessions((prev) => prev.filter((s) => s.sessionId !== sid));
      if (token) {
        // The answer may land after a sign-out (and the next account's
        // sign-in): then it belongs to nobody on this device and must not
        // write the old conversation back into the shared cache.
        const acct = captureAccount();
        const restore = () => {
          if (!acct.live) return;
          if (snapshot) {
            storeTranscript(snapshot);
            markUnsent(sid);
          } else if (evictedSnap) {
            restoreEvicted(sid, evictedSnap);
          }
          const current = getSessionIds();
          if ((snapshot || evictedSnap) && !current.includes(sid)) {
            const at = Math.max(0, prevIds.indexOf(sid));
            current.splice(Math.min(at, current.length), 0, sid);
            saveSessionIds(current);
          }
          if (!isMountedRef.current) return;
          setPastSessions(historySessions());
          setHistoryError(t("chat.delete_failed"));
        };
        // Runs after any upload already queued for this conversation, so a
        // late upload can never recreate it on the server.
        void deleteSessionOnServer(sid, token, acct.generation).then((gone) => {
          if (!gone) restore();
        });
      }
      // If we just deleted the active session, start fresh
      if (sid === sessionId) {
        startNewChat();
      }
    },
    [sessionId, startNewChat, token, sending, t]
  );

  return {
    commitRename, deleteSession, loadPastSession, msgStatuses, openHistory, scrollContainerRef,
    setAutoScrollBoth, setShowJumpButton, setStatusTick, showJumpButton, startNewChat, startRename
  };
}
