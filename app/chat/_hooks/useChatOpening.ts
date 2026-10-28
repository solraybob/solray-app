"use client";

import { useEffect, useCallback } from "react";
import { apiFetch, ApiError } from "@/lib/api";
import { isCurrentGeneration, isStaleAccountError } from "@/lib/account-session";
import { getSessionIds, loadSession, beginSend, type SendLifecycle } from "@/lib/chat-sync";
import { fill } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { oracleErrorKey, MESSAGE_TOO_LONG_CODE } from "@/lib/oracle-errors";
import { soulRequestFields, composerWithUnsent, familyForTranscript, type FamilyRef, type SoulRef } from "@/lib/oracle-request";
import { answerFromChat, readChatRefusal, withAnswer } from "@/lib/chat-outcome";
import { takeHandoff } from "@/lib/account-session";
import { type Message, generateSessionId, type StoredSession, todayLabel, setSoulCtx, getSoulCtx, soulRefOf } from "../_lib/chat-helpers";
import type { useChatState } from "./useChatState";

export function useChatOpening(pageCtx: ReturnType<typeof useChatState>) {
  const {
    accountGen, activeSessionRef, inputRef, isMountedRef, lang, messages, persistSession,
    searchParams, sessionId, setInput, setMessages, setSending, setSessionId, setSoulBlueprint,
    setSoulName, setSoulRef, setStreamedLength, setStreamingId, t, token
  } = pageCtx;
  // ── Build a greeting message ──────────────────────────────────────────────
  // Returns null when the forecast endpoint fails, so the caller can
  // skip rendering a fake first line rather than ship invented Oracle
  // copy. The user starts the conversation plainly in that case.
  const buildGreeting = useCallback(
    async (forToken: string | null): Promise<Message | null> => {
      let content = "";

      try {
        const data = await apiFetch("/forecast/today", {}, forToken);

        // Use the AI morning greeting if it exists and is specific (more than 10 words)
        const mg: string = data?.morning_greeting || "";
        const wordCount = mg.trim().split(/\s+/).length;
        if (mg && wordCount > 10) {
          content = mg;
        } else {
          // Composed from i18n keys, with chart vocabulary run through tx(),
          // so a Spanish member gets a Spanish first line, never English.
          const tr = t;
          const cap = (s: string) => (s ? s.charAt(0).toUpperCase() + s.slice(1).toLowerCase() : s);
          const term = (s: string) => (lang === "en" ? s : tx(cap(s), lang));
          // Build a rich greeting from today's transits + tightest aspect
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

          // Find the tightest (most exact) natal aspect active today
          let aspectStr = "";
          let aspectQuestion = "";
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
            if (planet && aspectType && target) {
              aspectStr = tr("chat.greet_aspect")
                .replace("{planet}", term(planet))
                .replace("{aspect}", lang === "en" ? aspectType : term(aspectType).toLowerCase())
                .replace("{target}", term(target));
              // Frame a personal question based on the planet involved
              const QUESTION_PLANETS = ["mars", "venus", "mercury", "jupiter", "saturn", "uranus", "neptune", "pluto", "moon", "sun"];
              const pKey = planet.toLowerCase();
              aspectQuestion = QUESTION_PLANETS.includes(pKey)
                ? tr(`chat.greet_q_${pKey}`)
                : tr("chat.greet_q_default");
            }
          }

          // Compose the greeting
          const skyParts = [
            sunSign && tr("chat.greet_sun").replace("{sign}", term(sunSign)),
            moonSign && tr("chat.greet_moon").replace("{sign}", term(moonSign)),
          ]
            .filter(Boolean)
            .join(", ");

          if (aspectStr) {
            const skyIntro = skyParts ? `${skyParts}. ` : "";
            content = `${skyIntro}${aspectStr} ${aspectQuestion}`;
          } else if (skyParts) {
            content = tr("chat.greet_sky_only").replace("{sky}", skyParts);
          } else {
            content = tr("chat.greet_plain");
          }
        }

      } catch {
        // Forecast API failed. The previous version of this branch
        // composed a synthetic Oracle greeting from cached profile
        // data ("Virgo Sun, Pisces Moon. The morning is yours. What
        // needs clarity today?"). That is invented Oracle copy
        // produced specifically because the live sky failed, which
        // violates the "fail honestly, never fictionally" rule. We
        // now skip the greeting entirely on forecast failure and let
        // the user start the conversation plainly. No fake first
        // line. Caught by Codex audit P1.2.
        return null;
      }

      return {
        id: "greeting",
        role: "assistant",
        content,
        timestamp: new Date().toISOString(),
      };
    },
    [lang, t]
  );

  // ── Initialise session on mount ───────────────────────────────────────────
  // A failed automatic opening (the "Go deeper" question, a Dynamics
  // opening), handled as an ordinary send's failure: a length refusal is
  // refused (never uploaded) and, in the open conversation, goes back to the
  // box; any other failure gets its note after the message. Out of sight, everything is kept in the
  // conversation's saved copy (the refused message with Edit).
  const openingFailed = (err: unknown, o: {
    sid: string; life: SendLifecycle; userMsg: Message; before: Message[];
    land: (next: Message[]) => void; note: string;
  }) => {
    const tooLong = err instanceof ApiError && err.code === MESSAGE_TOO_LONG_CODE;
    if (tooLong && isCurrentGeneration(accountGen)) o.life.refused();
    // The account changed while waiting: nothing to show or store.
    if (isStaleAccountError(err)) return;
    const failedAt = Date.now();
    const visible = isMountedRef.current && activeSessionRef.current === o.sid;
    const note = (content: string): Message => ({
      id: (failedAt + 2).toString(),
      role: "assistant",
      content,
      timestamp: new Date().toISOString(),
      isError: true,
    });
    if (tooLong && visible) {
      o.land([...o.before, note(t("oracle_errors.message_too_long_kept"))]);
      setInput((prev) => composerWithUnsent(o.userMsg.content, prev));
      requestAnimationFrame(() => inputRef.current?.focus());
      return;
    }
    if (tooLong) {
      o.land([...o.before, o.userMsg]);
      return;
    }
    o.land([...o.before, o.userMsg, note(o.note)]);
  };

  useEffect(() => {
    if (!token) return;

    async function init() {
      // Check for compatibility context injected from Souls page
      // Check for profile-element prompt (from Ask buttons on profile page)
      // Handoffs are taken (read and removed) only when this tab still
      // belongs to the member who wrote them (lib/account-session).
      const profilePromptRaw = takeHandoff("solray_chat_prompt");
      if (profilePromptRaw) {
        try {
          const ctx = JSON.parse(profilePromptRaw) as { topic: string; question: string };
          const sid = generateSessionId();
          setSessionId(sid);
          const userMsg: Message = {
            id: `${Date.now()}`,
            role: "user",
            content: ctx.question,
            timestamp: new Date().toISOString(),
          };
          // Targeted entry (Go deeper on a breakthrough, Ask buttons on
          // profile/cycles): open directly on the topic. No morning greeting
          // prepended; that belongs only to a cold open of the chat tab.
          // Previously the day's italic greeting sat above the user's real
          // question, which read as the wrong context.
          const seed = [userMsg];
          const newSession: StoredSession = {
            sessionId: sid,
            date: todayLabel(),
            customName: ctx.topic,
            messages: seed,
          };
          // The same life as an ordinary send: pending (never uploaded)
          // until /chat answers, before it is shown or saved.
          const life = beginSend(userMsg.id);
          persistSession(newSession);
          setMessages(seed);
          // A seeded question is never a Dynamics conversation.
          setSoulBlueprint(null);
          setSoulName(null);
          setSoulRef(null);
          setSending(true);
          // The member may open another conversation before this answer
          // arrives. Then it is stored with its own conversation instead of
          // being written over the one on screen.
          const land = (next: Message[], stream?: Message) => {
            if (activeSessionRef.current === sid) {
              setMessages(next);
              if (stream) {
                setStreamedLength(0);
                setStreamingId(stream.id);
              }
            }
            persistSession({ ...newSession, messages: next });
          };
          try {
            const data = await apiFetch("/chat", {
              method: "POST",
              body: JSON.stringify({ message: ctx.question, conversation_history: [], session_id: sid }),
            }, token);
            life.answered();
            // Honest empty-response handling, parallel to sendMessage.
            // The previous version of this branch fell back to "I
            // hear you." which is invented Oracle copy. Caught by
            // Codex audit P2.4.
            // The same reading of the answer as an ordinary send
            // (lib/chat-outcome). Only the Oracle's own words stream.
            const answer = answerFromChat(data, t("chat.error_no_response"));
            const next = withAnswer(seed, answer);
            land(next, answer.reply.isError ? undefined : answer.reply);
          } catch (err) {
            // Surface the failure as a visible error message rather
            // than silently swallowing it. Previous version left the
            // user with their seeded question and no honest signal
            // that anything failed.
            openingFailed(err, {
              sid, life, userMsg, before: [], land,
              note: t(readChatRefusal(err).noteKey),
            });
          } finally {
            life.finish(isMountedRef.current && activeSessionRef.current === sid && isCurrentGeneration(accountGen));
            if (isMountedRef.current) setSending(false);
          }
          return;
        } catch {
          // fall through
        }
      }

      const isCompat = searchParams?.get("compat") === "1";
      if (isCompat) {
        try {
          const raw = takeHandoff("solray_compat_context");
          if (raw) {
            const ctx = JSON.parse(raw) as {
              soulName: string;
              introMessage: string;
              soulBlueprint?: Record<string, unknown> | null;
              soulConnectionId?: string | null;
              savedPersonId?: string | null;
              // A saved person the server had not confirmed yet.
              localPersonId?: string | null;
              // A family reading: everyone else selected, by reference.
              familyPartners?: FamilyRef[] | null;
            };
            const family: FamilyRef[] = Array.isArray(ctx.familyPartners)
              ? ctx.familyPartners.filter((f) => f && (f.connectionId || f.savedPersonId))
              : [];

            // Hoist the soul context into component state so every
            // follow-up message in this session re-passes the blueprint
            // to the backend. Without this, only the first message had
            // soul context and the Oracle "forgot" their chart on msg 2+.
            setSoulBlueprint(ctx.soulBlueprint ?? null);
            setSoulName(ctx.soulName ?? null);
            const compatRef: SoulRef = {
              connectionId: ctx.soulConnectionId ?? null,
              savedPersonId: ctx.savedPersonId ?? null,
              blueprint: ctx.soulBlueprint ?? null,
              family,
            };
            setSoulRef(compatRef);

            const sid = generateSessionId();
            setSessionId(sid);

            const greeting: Message = {
              id: "greeting",
              role: "assistant",
              content: fill(t("prompts.compat_opening"), { name: ctx.soulName }),
              timestamp: new Date().toISOString(),
              // Travels with the transcript to the member's other devices,
              // so follow-ups there still name who the reading is with.
              ...((ctx.soulConnectionId || ctx.savedPersonId) ? {
                soul: {
                  name: ctx.soulName ?? null,
                  connection_id: ctx.soulConnectionId ?? null,
                  saved_person_id: ctx.savedPersonId ?? null,
                  ...(family.length > 0 ? { family: familyForTranscript(family) } : {}),
                },
              } : {}),
            };
            const userMsg: Message = {
              id: `${Date.now()}`,
              role: "user",
              content: ctx.introMessage,
              timestamp: new Date().toISOString(),
            };

            const newSession: StoredSession = {
              sessionId: sid,
              date: todayLabel(),
              customName: fill(t("prompts.compat_session"), { name: ctx.soulName }),
              messages: [greeting, userMsg],
            };
            // The same life as an ordinary send (see the seeded question).
            const life = beginSend(userMsg.id);
            // The partner's chart belongs to this conversation only.
            // An unconfirmed saved person's local id is kept too: once the
            // server confirms them, the upload writes their id into this
            // transcript (lib/chat-soul withSoulBackfill).
            setSoulCtx(sid, {
              name: ctx.soulName ?? null,
              blueprint: ctx.soulBlueprint ?? null,
              connectionId: ctx.soulConnectionId ?? null,
              savedPersonId: ctx.savedPersonId ?? null,
              localPersonId: ctx.localPersonId ?? null,
              family,
            });
            persistSession(newSession);
            setMessages([greeting, userMsg]);
            setSending(true);
            // Same guard as a normal send: if another conversation is open by
            // the time the reading arrives, it is stored with its own
            // conversation, never appended to the one on screen.
            const land = (next: Message[], stream?: Message) => {
              if (activeSessionRef.current === sid) {
                setMessages(next);
                if (stream) {
                  setStreamedLength(0);
                  setStreamingId(stream.id);
                }
              }
              persistSession({ ...newSession, messages: next });
            };

            // Auto-send the compatibility message
            try {
              const data = await apiFetch(
                "/chat",
                {
                  method: "POST",
                  body: JSON.stringify({
                    message: ctx.introMessage,
                    conversation_history: [],
                    session_id: sid,
                    ...soulRequestFields(compatRef),
                  }),
                },
                token
              );
              life.answered();
              // Read as an ordinary send reads it (lib/chat-outcome).
              const answer = answerFromChat(data, t("chat.error_no_response"));
              // An empty reply is a failure, not a license to invent one.
              if (answer.reply.isError) throw new Error("empty souls reply");
              const next = withAnswer(newSession.messages, answer);
              land(next, answer.reply);
            } catch (err) {
              // The previous version of this branch shipped an
              // Oracle-flavored fallback string for the souls compat
              // flow that asserted vague mirror-energy-grow content
              // about the user and the connection. Especially
              // dangerous in Souls because users trust compat
              // readings as chart-grounded. Now surfaces a visible
              // error message in the same isError style as the main
              // chat path. Caught by Codex audit P1.1.
              openingFailed(err, {
                sid, life, userMsg, before: [greeting], land,
                note: oracleErrorKey(err)
                  ? t(oracleErrorKey(err) as string)
                  : fill(t("prompts.compat_failed"), { name: ctx.soulName }),
              });
            } finally {
              life.finish(isMountedRef.current && activeSessionRef.current === sid && isCurrentGeneration(accountGen));
              if (isMountedRef.current) setSending(false);
            }
            return;
          }
        } catch {
          // Fall through to normal init
        }
      }

      const ids = getSessionIds();
      const lastId = ids[0];
      const last = lastId ? loadSession(lastId) : null;

      if (last && last.messages.length > 0) {
        setSessionId(last.sessionId);
        setMessages(last.messages);
        const sc = getSoulCtx(last.sessionId, last.messages);
        setSoulBlueprint(sc?.blueprint ?? null);
        setSoulName(sc?.name ?? null);
        setSoulRef(soulRefOf(sc));
      } else {
        const sid = generateSessionId();
        setSessionId(sid);
        // Open on the quiet anchor (the messages.length === 0 state), not an
        // auto-generated greeting. The Oracle speaks once the person does.
        const newSession: StoredSession = {
          sessionId: sid,
          date: todayLabel(),
          messages: [],
        };
        persistSession(newSession);
        setMessages([]);
      }
    }

    init();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token, buildGreeting]);

  // ── Persist messages whenever they change ─────────────────────────────────
  useEffect(() => {
    if (!sessionId || messages.length === 0) return;
    const existing = loadSession(sessionId);
    persistSession({
      sessionId,
      date: todayLabel(),
      customName: existing?.customName,
      messages,
    });
  }, [messages, sessionId]);

  return { buildGreeting };
}
