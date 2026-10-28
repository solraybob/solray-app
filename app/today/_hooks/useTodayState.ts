"use client";

import { useEffect, useState, useRef } from "react";
import { useRouter } from "next/navigation";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { type StoredBirthTimeCheck } from "@/lib/birth-time-fold";
import { captureAccount } from "@/lib/account-session";
import { useChartRevision } from "@/lib/use-chart-revision";
import { useT, fill, ordinal } from "@/lib/i18n";
import { tx } from "@/lib/astro-i18n";
import { accountKey } from "@/lib/account-session";
import { type ForecastView, type PendingInsight, type SkyEcho, type DeckCycle, localDayKey, BREAKTHROUGH_AUTO_OPEN, SKY_ECHO_AUTO_OPEN, LUNAR_AUTO_OPEN } from "../_lib/today-data";
import { daysToBirthday } from "../_components/BirthdayModal";

export function useTodayState() {
  const [forecast, setForecast] = useState<ForecastView | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [visibleSections, setVisibleSections] = useState(0);
  const [insight, setInsight] = useState<PendingInsight | null>(null);
  const [showBreakthrough, setShowBreakthrough] = useState(false);
  const insightFetched = useRef(false);
  const [skyEcho, setSkyEcho] = useState<SkyEcho | null>(null);
  const [showSkyEcho, setShowSkyEcho] = useState(false);
  const skyEchoFetched = useRef(false);
  const [showLunar, setShowLunar] = useState(false);
  const lunarChecked = useRef(false);
  const [cycles, setCycles] = useState<DeckCycle[]>([]);
  // One screen, exactly: the deck box is as tall as what is left of the
  // viewport below it (measured, so a trial banner or the desktop header
  // above it is counted), less the bottom bar on a phone. The dots used to
  // touch the bottom edge whenever something sat above the page head.
  const deckBoxRef = useRef<HTMLDivElement | null>(null);
  const [birthDate, setBirthDate] = useState<string | null>(null);
  // From /users/me. undefined until known, so the banner never flashes.
  const [emailVerified, setEmailVerified] = useState<boolean | undefined>(undefined);
  // The saved birth time's clock-change check, for the one-time prompt.
  const [birthCheck, setBirthCheck] = useState<StoredBirthTimeCheck | null>(null);
  const [showBirthday, setShowBirthday] = useState(false);
  const birthdayChecked = useRef(false);
  const { token } = useAuth();
  const { t, lang } = useT();
  const dateLocale = lang === "en" ? "en-GB" : lang;
  const router = useRouter();
  const backgroundFetchDone = useRef(false);
  // The member's local calendar day. Now is keyed by it: when the app comes
  // back after midnight (resume, tab visible again, or a timer at midnight
  // while open) the day moves on and the reading is fetched for the new day,
  // instead of yesterday's card sitting there until a manual reload.
  const [dayKey, setDayKey] = useState(localDayKey);
  const lastFetchAt = useRef(0);
  // Bumped after consent is given, to fetch the reading that was refused.
  const [reloadNonce, setReloadNonce] = useState(0);
  // Changes when the birth chart changes (here or in another tab): the
  // reading on screen is for the old chart and is replaced.
  const chartRev = useChartRevision();
  const seenChartRev = useRef(chartRev);

  // Refs and state for the Energy Bars share card. The card itself
  // renders into a hidden off-screen container via
  // ShareOffscreenWrapper at the bottom of this page; html2canvas
  // captures it on demand when the user taps the share icon next to
  // "Today's Vibe."

  const todayDateLabel = new Date().toLocaleDateString(dateLocale, {
    weekday: "long",
    day: "numeric",
    month: "long",
  });


  // The Conscious Oracle's breakthrough: fetch once per mount. The endpoint
  // returns the most recent unsurfaced insight and marks it surfaced, so it
  // shows a single time. Silent on failure; the chat Oracle still carries it.
  useEffect(() => {
    if (!token || insightFetched.current) return;
    insightFetched.current = true;
    (async () => {
      try {
        const data = await apiFetch("/insight/pending", {}, token, { quietConsent: true }) as { insight: PendingInsight | null };
        let ins: PendingInsight | null = (data && data.insight) ? data.insight : null;
        const _d = new Date();
        const dayStr = `${_d.getFullYear()}-${_d.getMonth() + 1}-${_d.getDate()}`;
        // Same-day return for "Later": the server marks an insight surfaced on
        // first fetch, so on reopen it returns null. Reuse the stashed copy from
        // earlier today so a Later'd breakthrough comes back the same day (X and
        // Go deeper clear the stash, so those never return).
        if (!ins) {
          try {
            const raw = localStorage.getItem(accountKey("solray_bt_active"));
            if (raw) { const a = JSON.parse(raw); if (a && a.day === dayStr && a.insight) ins = a.insight as PendingInsight; }
          } catch (_) {}
        }
        if (ins) {
          setInsight(ins);
          try { localStorage.setItem(accountKey("solray_bt_active"), JSON.stringify({ day: dayStr, insight: ins })); } catch (_) {}
          // X (permanent) wins forever; Later (this session) holds it back until
          // the next open the same day.
          let dismissed = false, later = false;
          try { dismissed = localStorage.getItem(accountKey(`solray_bt_dismissed_${ins.id}`)) === "1"; } catch (_) {}
          try { later = sessionStorage.getItem(`solray_bt_later_${ins.id}`) === "1"; } catch (_) {}
          // Held back while Apple reviews the app (23 Oct 2026): the pop-up
          // covered the Now reflection, the first thing a new member sees.
          if (BREAKTHROUGH_AUTO_OPEN && !dismissed && !later) setShowBreakthrough(true);
        }
      } catch (_) { /* non-fatal */ }
    })();
  }, [token]);

  // Mark a breakthrough seen so it never resurfaces. Fire-and-forget.
  const markInsightSeen = (id: string) => {
    if (!token) return;
    apiFetch(`/insight/${id}/seen`, { method: "POST" }, token).catch(() => {});
  };

  // Sky-stamp recall (Build 1, step 3): a moment from your own past under a sky
  // like today's. Fetch once per mount. Null is the common case (little stamped
  // history yet); the card simply does not render. Silent on failure.
  useEffect(() => {
    if (!token || skyEchoFetched.current) return;
    skyEchoFetched.current = true;
    (async () => {
      try {
        const data = await apiFetch("/insight/sky-echo", {}, token, { quietConsent: true }) as { echo: SkyEcho | null };
        if (data && data.echo) {
          setSkyEcho(data.echo);
          // Show the takeover unless this exact memory was already consumed
          // (Go deeper, localStorage) or set aside this session (Later).
          const key = data.echo.created_at || "x";
          let consumed = false, dismissed = false, later = false;
          try { consumed = localStorage.getItem(accountKey(`solray_echo_seen_${key}`)) === "1"; } catch (_) {}
          try { dismissed = localStorage.getItem(accountKey(`solray_echo_dismissed_${key}`)) === "1"; } catch (_) {}
          try { later = sessionStorage.getItem(`solray_echo_later_${key}`) === "1"; } catch (_) {}
          // Held back while Apple reviews the app (23 Oct 2026), like the
          // breakthrough: it covered the Now reflection and spoke moon phases.
          if (SKY_ECHO_AUTO_OPEN && !consumed && !dismissed && !later) setShowSkyEcho(true);
        }
      } catch (_) { /* non-fatal */ }
    })();
  }, [token]);

  // "Later": set aside for this session; comes back on the next open the same
  // day (the stash in the fetch effect re-shows it). Not permanent.
  const laterBreakthrough = () => {
    if (insight) { try { sessionStorage.setItem(`solray_bt_later_${insight.id}`, "1"); } catch (_) {} }
    setShowBreakthrough(false);
  };

  // X: done for good. This exact breakthrough never returns (clears the stash
  // so it cannot reappear today either). Tomorrow's different one still can.
  const dismissBreakthrough = () => {
    if (insight) {
      try {
        localStorage.setItem(accountKey(`solray_bt_dismissed_${insight.id}`), "1");
        localStorage.removeItem(accountKey("solray_bt_active"));
      } catch (_) {}
      // The server is the record (9 Oct 2026): X used to be remembered on this
      // device only, so signing in again or on another phone brought it back.
      markInsightSeen(insight.id);
    }
    setShowBreakthrough(false);
  };

  // The long-range transits, fetched here rather than inside a card component,
  // because on this screen they ARE the cards.
  // Transits to the member's own chart: a birth correction clears them and
  // asks again; an answer for the old chart never lands (Codex out19-5).
  const cyclesRevRef = useRef(chartRev);
  useEffect(() => {
    if (cyclesRevRef.current !== chartRev) {
      cyclesRevRef.current = chartRev;
      setCycles([]);
    }
    if (!token) return;
    let off = false;
    (async () => {
      try {
        const r = await apiFetch("/transits/long-range", {}, token, { quietConsent: true });
        if (!off) setCycles(Array.isArray(r?.cycles) ? r.cycles.slice(0, 4) : []);
      } catch (_) { /* the deck simply carries one card */ }
    })();
    return () => { off = true; };
  }, [token, dayKey, chartRev]);

  const askOracle = (topic: string, question: string) => {
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({ topic, question }));
    } catch (_) {}
    router.push("/chat");
  };

  const openInsightInChat = () => {
    if (!insight) return;
    markInsightSeen(insight.id);
    try { localStorage.removeItem(accountKey("solray_bt_active")); } catch (_) {}
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
        topic: insight.title,
        question: fill(t("prompts.insight_deeper"), { title: insight.title, body: insight.body }),
      }));
    } catch (_) {}
    router.push("/chat");
  };

  // Sky-echo "Go deeper": open the Oracle about the remembered moment AND mark
  // this exact memory consumed (localStorage) so it never returns.
  const goDeeperSkyEcho = (sentence: string, excerpt: string) => {
    const key = skyEcho?.created_at || "x";
    try { localStorage.setItem(accountKey(`solray_echo_seen_${key}`), "1"); } catch (_) {}
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
        topic: t("prompts.echo_topic"),
        question: fill(t("prompts.echo_deeper"), { sentence, excerpt }),
      }));
    } catch (_) {}
    router.push("/chat");
  };

  // Sky-echo "Later": set aside for this session; returns on next open same day.
  const laterSkyEcho = () => {
    const key = skyEcho?.created_at || "x";
    try { sessionStorage.setItem(`solray_echo_later_${key}`, "1"); } catch (_) {}
    setShowSkyEcho(false);
  };

  // Sky-echo X: dismiss this exact memory for good (never returns).
  const dismissSkyEcho = () => {
    const key = skyEcho?.created_at || "x";
    try { localStorage.setItem(accountKey(`solray_echo_dismissed_${key}`), "1"); } catch (_) {}
    setShowSkyEcho(false);
  };

  // Lunar moment: surface a takeover on the day of a new or full moon (~every
  // two weeks). Consumed via Go deeper (localStorage, by lunation); Later holds
  // it for the session and it returns next open until the moon passes.
  useEffect(() => {
    const ev = forecast?.lunar_event;
    if (!ev || lunarChecked.current) return;
    // Live only while the Moon is still in (or just left) the lunation's sign:
    // the day of the event through ~2 days after. Within this window a "Later"
    // re-shows it on the next app open; once the window closes it is gone for
    // good. days_until is negative once the event has passed.
    const within = typeof ev.days_until === "number" && ev.days_until <= 0.75 && ev.days_until >= -2;
    if (!within) return;
    lunarChecked.current = true;
    const key = `${ev.date}_${ev.type}`;
    // Per lunation: shows once around the new/full moon. Go deeper consumes it
    // (seen); X dismisses it for good. Either way it does not return until the
    // next moon (~2 weeks), which is a different key.
    let consumed = false, dismissed = false, later = false;
    try { consumed = localStorage.getItem(accountKey(`solray_lunar_seen_${key}`)) === "1"; } catch (_) {}
    try { dismissed = localStorage.getItem(accountKey(`solray_lunar_dismissed_${key}`)) === "1"; } catch (_) {}
    try { later = sessionStorage.getItem(`solray_lunar_later_${key}`) === "1"; } catch (_) {}
    // Never opens on its own (23 Oct 2026): a moon pop-up as the first thing
    // on Now made the app read as an astrology app. The moon stays available
    // in conversation with the Oracle.
    if (LUNAR_AUTO_OPEN && !consumed && !dismissed && !later) setShowLunar(true);
  }, [forecast]);

  const goDeeperLunar = () => {
    const ev = forecast?.lunar_event;
    if (!ev) return;
    const key = `${ev.date}_${ev.type}`;
    try { localStorage.setItem(accountKey(`solray_lunar_seen_${key}`), "1"); } catch (_) {}
    const isFull = ev.type === "Full Moon";
    const sign = lang === "en" ? ev.sign : tx(ev.sign, lang);
    const house = ordinal(ev.house, lang);
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
        topic: fill(t(isFull ? "prompts.lunar_topic_full" : "prompts.lunar_topic_new"), { sign }),
        question: fill(t(isFull ? "prompts.lunar_full" : "prompts.lunar_new"), { sign, house, note: ev.note || "" }).replace(/\s+/g, " ").trim(),
      }));
    } catch (_) {}
    router.push("/chat");
  };

  // "Later": this session only; returns next open while the moon is still in
  // its window. X dismisses the lunation for good.
  const laterLunar = () => {
    const ev = forecast?.lunar_event;
    const key = ev ? `${ev.date}_${ev.type}` : "x";
    try { sessionStorage.setItem(`solray_lunar_later_${key}`, "1"); } catch (_) {}
    setShowLunar(false);
  };

  const dismissLunar = () => {
    const ev = forecast?.lunar_event;
    const key = ev ? `${ev.date}_${ev.type}` : "x";
    try { localStorage.setItem(accountKey(`solray_lunar_dismissed_${key}`), "1"); } catch (_) {}
    setShowLunar(false);
  };

  // Birthday (solar return): once a year. Window = the day of through ~2 days
  // after (a grace if they did not open the app on the day). Go deeper consumes
  // it for the year (localStorage by year); Later returns it next open in window.
  useEffect(() => {
    if (!birthDate || birthdayChecked.current) return;
    const d = daysToBirthday(birthDate);
    const within = d <= 0 && d >= -2;
    if (!within) return;
    birthdayChecked.current = true;
    const yr = new Date().getFullYear();
    let consumed = false, dismissed = false, later = false;
    try { consumed = localStorage.getItem(accountKey(`solray_birthday_seen_${yr}`)) === "1"; } catch (_) {}
    try { dismissed = localStorage.getItem(accountKey(`solray_birthday_dismissed_${yr}`)) === "1"; } catch (_) {}
    try { later = sessionStorage.getItem(`solray_birthday_later_${yr}`) === "1"; } catch (_) {}
    if (!consumed && !dismissed && !later) setShowBirthday(true);
  }, [birthDate]);

  const goDeeperBirthday = async () => {
    const yr = new Date().getFullYear();
    try { localStorage.setItem(accountKey(`solray_birthday_seen_${yr}`), "1"); } catch (_) {}
    // Pull the real solar-return chart so the Oracle reads the year ahead from
    // true placements, not invented ones. Fail-soft: if it is unavailable the
    // question still opens a personalised reading from her chart knowledge.
    let facts = "";
    // The solar return may land after a sign-out: then the question belongs
    // to nobody here and must not be handed to the next account's chat.
    const acct = captureAccount();
    try {
      const data = token ? (await apiFetch("/solar-return", {}, token)) as { solar_return: any } : null;
      const sr = data?.solar_return;
      if (sr) {
        const parts: string[] = [];
        const term = (v: string) => (lang === "en" ? v : tx(v, lang));
        if (sr.ascendant_sign) parts.push(fill(t("prompts.sr_asc"), { sign: term(sr.ascendant_sign) }));
        if (sr.sun_house) parts.push(fill(t("prompts.sr_sun"), { house: ordinal(sr.sun_house, lang) }));
        if (sr.moon_sign && sr.moon_house) parts.push(fill(t("prompts.sr_moon"), { sign: term(sr.moon_sign), house: ordinal(sr.moon_house, lang) }));
        if (Array.isArray(sr.aspects) && sr.aspects.length) {
          const a = sr.aspects.slice(0, 2).map((x: any) => `${term(x.a)} ${term(x.aspect)} ${term(x.b)}`).join(", ");
          if (a) parts.push(fill(t("prompts.sr_aspects"), { aspects: a }));
        }
        if (parts.length) facts = fill(t("prompts.sr_facts"), { parts: parts.join(", ") });
      }
    } catch (_) { /* non-fatal */ }
    if (!acct.live) return;
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({
        topic: t("prompts.birthday_topic"),
        question: fill(t("prompts.birthday"), { facts }),
      }));
    } catch (_) {}
    router.push("/chat");
  };

  const laterBirthday = () => {
    const yr = new Date().getFullYear();
    try { sessionStorage.setItem(`solray_birthday_later_${yr}`, "1"); } catch (_) {}
    setShowBirthday(false);
  };

  const dismissBirthday = () => {
    const yr = new Date().getFullYear();
    try { localStorage.setItem(accountKey(`solray_birthday_dismissed_${yr}`), "1"); } catch (_) {}
    setShowBirthday(false);
  };

  // Funnel event: fires the first time a user reaches /today after signup.
  // Powers the "registration → first today view" conversion measurement.
  // trackOnce uses localStorage so this is per-device-per-user, fired
  // exactly once forever.
  useEffect(() => {
    if (!token) return;
    void (async () => {
      try {
        const { trackOnce } = await import("@/lib/analytics");
        await trackOnce("today_first_view", undefined, token);
      } catch { /* ignore */ }
    })();
  }, [token]);

  return {
    askOracle, backgroundFetchDone, birthCheck, birthDate, chartRev, cycles, dateLocale, dayKey,
    deckBoxRef, dismissBirthday, dismissBreakthrough, dismissLunar, dismissSkyEcho, emailVerified,
    error, forecast, goDeeperBirthday, goDeeperLunar, goDeeperSkyEcho, insight, lang, lastFetchAt,
    laterBirthday, laterBreakthrough, laterLunar, laterSkyEcho, loading, openInsightInChat,
    reloadNonce, router, seenChartRev, setBirthCheck, setBirthDate, setDayKey, setEmailVerified,
    setError, setForecast, setLoading, setReloadNonce, setVisibleSections, showBirthday,
    showBreakthrough, showLunar, showSkyEcho, skyEcho, t, token, visibleSections
  };
}
