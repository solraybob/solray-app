"use client";

/**
 * /admin/now-card: the plain-language Now card experiment (Batch I), admin
 * only. Shows, for the signed-in admin's own Today, the Now card exactly as
 * members see it next to the plain version (GET /admin/now-card/plain,
 * derived from the same cached reading, no chart words), both in the one
 * card component Today uses. EN/ES switches the plain card's language;
 * Regenerate writes it again.
 *
 * Members see no change: Today only asks for the plain card when
 * PLAIN_NOW_CARD_FOR_MEMBERS in lib/now-card.ts is switched on.
 */

import { useEffect, useState } from "react";
import ProtectedRoute from "@/components/ProtectedRoute";
import DeckCard from "@/components/NowDeckCard";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { translateIn } from "@/lib/i18n";
import { firstLines, usablePlainCard, PLAIN_NOW_CARD_FOR_MEMBERS, type PlainNowCard } from "@/lib/now-card";

type Lang = "en" | "es";

type Today = {
  day_title?: string;
  reading?: string;
  language?: string;
  _ai_error?: string;
};

const STATUS_NOTE: Record<string, string> = {
  no_reading: "Today has no finished reading yet. Open Today first, then come back.",
  pending: "Another request is writing this card right now. Try again in a moment.",
  rejected: "The model kept using chart words, so nothing was kept. Regenerate to try again.",
  unavailable: "No provider answered. Try again in a moment.",
};

function Column({ label, note, children }: { label: string; note?: string; children: React.ReactNode }) {
  return (
    <section style={{ flex: "1 1 320px", minWidth: 0, maxWidth: 440 }}>
      <p className="font-body text-[13px] tracking-[0.2em] uppercase text-amber-sun font-bold mb-2">{label}</p>
      {/* The deck gives Today's card a fixed track; this is the same height
          the card has on a phone. */}
      <div style={{ height: 520, display: "flex" }}>{children}</div>
      {note && <p className="font-body text-text-secondary text-[14px] mt-3">{note}</p>}
    </section>
  );
}

function Placeholder({ text }: { text: string }) {
  return (
    <div
      className="font-body text-text-secondary text-[15px]"
      style={{
        flex: 1, display: "flex", alignItems: "center", justifyContent: "center", textAlign: "center",
        border: "1px dashed rgb(var(--rgb-border))", borderRadius: 24, padding: 24,
      }}
    >
      {text}
    </div>
  );
}

function NowCardPreview() {
  const { token } = useAuth();
  const [today, setToday] = useState<Today | null>(null);
  const [todayErr, setTodayErr] = useState("");
  const [lang, setLang] = useState<Lang>("en");
  const [plain, setPlain] = useState<PlainNowCard | null>(null);
  const [plainErr, setPlainErr] = useState("");
  const [busy, setBusy] = useState(false);
  const [showReading, setShowReading] = useState(false);

  // The member view: the same call Today makes.
  useEffect(() => {
    if (!token) return;
    let live = true;
    apiFetch("/forecast/today", {}, token)
      .then((d) => {
        if (!live) return;
        const t = d as Today;
        setToday(t);
        if (t.language === "es" || t.language === "en") setLang(t.language);
      })
      .catch((e: any) => { if (live) setTodayErr(`Could not load Today (status ${e?.status ?? "?"})`); });
    return () => { live = false; };
  }, [token]);

  const readingReady = !!(today?.day_title && today?.reading && !today?._ai_error);

  const loadPlain = async (which: Lang, refresh = false) => {
    if (!token) return;
    setBusy(true); setPlainErr("");
    try {
      const q = `?lang=${which}${refresh ? "&refresh=true" : ""}`;
      setPlain(await apiFetch(`/admin/now-card/plain${q}`, {}, token) as PlainNowCard);
    } catch (e: any) {
      setPlain(null);
      setPlainErr(e?.status === 403 ? "Admin access required." : e?.status === 429
        ? "Today's limit for this is reached. It resets tomorrow."
        : `Could not load the plain card (status ${e?.status ?? "?"})`);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    if (readingReady) void loadPlain(lang);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readingReady, lang, token]);

  const memberLang: Lang = today?.language === "es" ? "es" : "en";
  const kick = (l: Lang) => translateIn(l, "today.kick_today");
  const action = (l: Lang) => translateIn(l, "insight.go_deeper");
  const toggle = () => setShowReading((v) => !v);

  return (
    <div className="min-h-[100dvh] bg-forest-deep text-text-primary" style={{ paddingBottom: "calc(96px + env(safe-area-inset-bottom, 16px))" }}>
      <div className="max-w-5xl mx-auto px-4 lg:px-10 py-8">
        <header className="mb-7 flex items-start justify-between gap-4 flex-wrap">
          <div>
            <p className="font-body text-[14px] tracking-[0.22em] uppercase text-amber-sun mb-1 font-bold">Experiment</p>
            <h1 className="font-heading text-2xl lg:text-3xl" style={{ fontWeight: 900 }}>Now card in plain language</h1>
            <p className="font-body text-text-secondary text-[15px] mt-1" style={{ maxWidth: "38em" }}>
              Your own Today. Left is the card members see now, right is the same day said without chart words.
              Go deeper still hands the Oracle the full reading either way.
              Members: {PLAIN_NOW_CARD_FOR_MEMBERS ? "seeing the plain card" : "no change (flag off)"}.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <div role="group" aria-label="Plain card language" className="flex rounded-lg border border-forest-border overflow-hidden">
              {(["en", "es"] as Lang[]).map((l) => (
                <button
                  key={l}
                  onClick={() => setLang(l)}
                  aria-pressed={lang === l}
                  className="font-body text-[14px] tracking-[0.18em] uppercase px-4 py-2 font-bold"
                  style={{ background: lang === l ? "rgb(var(--rgb-text-primary))" : "transparent",
                           color: lang === l ? "rgb(var(--rgb-card))" : "rgb(var(--rgb-text-primary))" }}
                >
                  {l}
                </button>
              ))}
            </div>
            <button
              onClick={() => void loadPlain(lang, true)}
              disabled={busy || !readingReady}
              className="font-body text-[14px] tracking-[0.22em] uppercase px-4 py-2 rounded-lg border border-forest-border hover:border-amber-sun/50 transition-colors font-bold disabled:opacity-50"
            >
              {busy ? "Writing" : "Regenerate"}
            </button>
          </div>
        </header>

        {todayErr && <div className="mb-6 px-4 py-3 rounded-lg border border-red-700/40 text-[15px]">{todayErr}</div>}

        <div className="flex gap-6 flex-wrap">
          <Column
            label="Now, as members see it"
            note={memberLang !== lang ? `Today's reading is in ${memberLang === "es" ? "Spanish" : "English"}, so this card stays in it.` : undefined}
          >
            {readingReady ? (
              <DeckCard
                kick={kick(memberLang)}
                title={today!.day_title!}
                body={firstLines(today!.reading)}
                action={action(memberLang)}
                onAction={toggle}
              />
            ) : (
              <Placeholder text={today ? STATUS_NOTE.no_reading : "Loading Today"} />
            )}
          </Column>

          <Column
            label={`Plain language, ${lang === "es" ? "Spanish" : "English"}`}
            note={plainErr || (plain && !usablePlainCard(plain) ? STATUS_NOTE[plain.status] : plain?.cached ? "From the cache. Regenerate writes a new one." : undefined)}
          >
            {usablePlainCard(plain) ? (
              <DeckCard
                kick={kick(lang)}
                title={plain.card_title}
                body={plain.card_body}
                action={action(lang)}
                onAction={toggle}
              />
            ) : (
              <Placeholder text={busy ? "Writing the plain card" : plainErr || (plain ? STATUS_NOTE[plain.status] || "" : readingReady ? "" : STATUS_NOTE.no_reading)} />
            )}
          </Column>
        </div>

        {showReading && readingReady && (
          <section className="mt-8 rounded-2xl border border-forest-border/70 p-6" style={{ maxWidth: 900 }}>
            <p className="font-body text-[13px] tracking-[0.2em] uppercase text-amber-sun font-bold mb-2">The full reading (Go deeper)</p>
            <h2 className="font-heading text-xl mb-3" style={{ fontWeight: 900 }}>{today!.day_title}</h2>
            {today!.reading!.split(/\n\n+/).map((p, i) => (
              <p key={i} className="font-body text-[16px] leading-relaxed mb-3">{p}</p>
            ))}
          </section>
        )}
      </div>
    </div>
  );
}

export default function NowCardPage() {
  return (
    <ProtectedRoute>
      <NowCardPreview />
    </ProtectedRoute>
  );
}
