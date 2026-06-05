"use client";

/**
 * /first-mirror — three lines that prove Solray understood the user.
 *
 * Renders immediately after onboarding, before Today, before Chat.
 * Codex's UX strategy memo top item: the first impression hit that
 * lands the moat at minute one.
 *
 * Three lines, computed by GET /first-mirror on the backend:
 *   1. The pattern you lead with
 *   2. The place you hide your power
 *   3. The question your design keeps returning to
 *
 * Each line is derived from a SPECIFIC chart placement so it could
 * not have been written about anyone else.
 *
 * Failure path is honest: if the endpoint errors, route straight to
 * /today rather than invent fallback copy. The first impression is
 * either real or absent.
 */

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { apiFetch } from "@/lib/api";
import { useT } from "@/lib/i18n";

interface FirstMirrorData {
  pattern: string;
  shadow: string;
  question: string;
}

export default function FirstMirrorPage() {
  return (
    <ProtectedRoute>
      <FirstMirrorContent />
    </ProtectedRoute>
  );
}

function FirstMirrorContent() {
  const { token } = useAuth();
  const { t } = useT();
  const router = useRouter();
  const [mirror, setMirror] = useState<FirstMirrorData | null>(null);
  const [loading, setLoading] = useState(true);
  const [revealStage, setRevealStage] = useState(0); // 0=eyebrow, 1=pattern, 2=shadow, 3=question, 4=cta
  // First Words: after the mirror, one invitation to ask the Oracle a real
  // question. The first conversation IS the product; this makes sure every
  // new user (and every reviewer) meets it before anything else.
  const [showAsk, setShowAsk] = useState(false);

  const askOracle = (question?: string) => {
    if (question) {
      try {
        sessionStorage.setItem(
          "solray_chat_prompt",
          JSON.stringify({ topic: question, question })
        );
      } catch (_) {}
    }
    router.replace("/chat");
  };

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    (async () => {
      try {
        const data = await apiFetch("/first-mirror", {}, token);
        if (cancelled) return;
        if (
          data &&
          typeof data.pattern === "string" &&
          typeof data.shadow === "string" &&
          typeof data.question === "string" &&
          data.pattern.trim() &&
          data.shadow.trim() &&
          data.question.trim()
        ) {
          setMirror(data);
          setLoading(false);
        } else {
          // Endpoint returned something but the shape was wrong. Honest
          // skip rather than render half a mirror.
          router.replace("/today");
        }
      } catch {
        // Backend was unavailable. Honest skip; no invented content.
        if (!cancelled) router.replace("/today");
      }
    })();
    return () => { cancelled = true; };
  }, [token, router]);

  // Stagger the reveal of the three lines so each one lands on its own
  // breath. Tuned to feel like a slow inhale across the page.
  useEffect(() => {
    if (!mirror) return;
    const timers: ReturnType<typeof setTimeout>[] = [];
    timers.push(setTimeout(() => setRevealStage(1), 250));
    timers.push(setTimeout(() => setRevealStage(2), 1700));
    timers.push(setTimeout(() => setRevealStage(3), 3300));
    timers.push(setTimeout(() => setRevealStage(4), 5000));
    return () => { timers.forEach(clearTimeout); };
  }, [mirror]);

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center px-6 bg-forest-deep">
        <div
          className="font-body text-[11px] tracking-[0.3em] uppercase"
          style={{ color: "var(--amber)", opacity: 0.7 }}
        >
          {t("first_mirror.reading")}
        </div>
      </div>
    );
  }

  if (!mirror) return null;

  // First Words screen: the Oracle is awake, ask one true question.
  if (showAsk) {
    return (
      <div className="min-h-[100dvh] flex flex-col bg-forest-deep">
        <div className="flex-1 flex flex-col justify-center px-6 pb-24 animate-slide-up">
          <div className="max-w-md mx-auto w-full">
            <p
              className="font-body text-[11px] tracking-[0.3em] uppercase mb-4 text-center"
              style={{ color: "var(--amber)", opacity: 0.8 }}
            >
              {t("first_mirror.awake")}
            </p>
            <h1
              className="font-heading text-text-primary text-center mb-3"
              style={{ fontWeight: 300, fontStyle: "italic", fontSize: "2rem", letterSpacing: "-0.01em" }}
            >
              {t("first_mirror.ask_title")}
            </h1>
            <p className="font-body text-text-secondary/70 text-[13px] text-center mb-10">
              {t("first_mirror.ask_hint")}
            </p>
            <div className="space-y-3">
              {[t("first_mirror.chip_yes"), t("first_mirror.chip_forcing")].map((q) => (
                <button
                  key={q}
                  onClick={() => askOracle(q)}
                  className="w-full text-left px-5 py-4 rounded-2xl border border-forest-border/80 bg-forest-card/40 font-body text-[15px] text-text-primary transition-all hover:border-amber-sun/40 active:scale-[0.99]"
                >
                  {q}
                </button>
              ))}
              <button
                onClick={() => askOracle()}
                className="w-full text-left px-5 py-4 rounded-2xl border border-amber-sun/35 font-body text-[15px] transition-all hover:border-amber-sun/60 active:scale-[0.99]"
                style={{ color: "var(--amber)", background: "rgba(243,146,48,0.05)" }}
              >
                {t("first_mirror.chip_own")}
              </button>
            </div>
            <button
              onClick={() => router.replace("/today")}
              className="block mx-auto mt-8 font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary/60 hover:text-text-secondary transition-colors"
            >
              {t("first_mirror.not_now")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] flex flex-col bg-forest-deep">
      {/* Header */}
      <div className="border-b border-forest-border/50">
        <div className="max-w-lg mx-auto px-5 pt-2 pb-3">
          <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1" style={{ color: "var(--amber)" }}>
            {t("first_mirror.title")}
          </p>
          <div className="relative flex items-center justify-end" style={{ height: "26px" }}>
            <h1
              className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
              style={{ fontWeight: 300, fontSize: "21px" }}
            >
              SOLRAY
            </h1>
          </div>
        </div>
      </div>

      {/* Body */}
      <div className="flex-1 flex flex-col justify-center px-6 pt-12 pb-32">
        <div className="max-w-md mx-auto w-full space-y-12">
          <MirrorLine label={t("first_mirror.line_pattern")} body={mirror.pattern} visible={revealStage >= 1} />
          <MirrorLine label={t("first_mirror.line_shadow")} body={mirror.shadow} visible={revealStage >= 2} />
          <MirrorLine label={t("first_mirror.line_question")} body={mirror.question} visible={revealStage >= 3} italic />

          {/* Continue CTA appears after all three lines have landed */}
          <div
            className="pt-4 transition-all duration-700"
            style={{
              opacity: revealStage >= 4 ? 1 : 0,
              transform: revealStage >= 4 ? "translateY(0)" : "translateY(8px)",
            }}
          >
            <button
              onClick={() => setShowAsk(true)}
              className="w-full py-4 rounded-full text-[11px] tracking-[0.3em] uppercase transition-all"
              style={{
                background: "var(--amber)",
                color: "var(--bg-deep)",
              }}
            >
              {t("common.continue")}
            </button>
            <p className="text-center mt-4 font-body text-text-secondary text-[12px]" style={{ opacity: 0.7 }}>
              {t("first_mirror.oracle_remembers")}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

function MirrorLine({ label, body, visible, italic }: { label: string; body: string; visible: boolean; italic?: boolean }) {
  return (
    <div
      className="transition-all duration-1000"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
      }}
    >
      <p
        className="font-body text-[11px] tracking-[0.28em] uppercase mb-3"
        style={{ color: "var(--text-muted)" }}
      >
        {label}
      </p>
      <p
        className="font-heading text-text-primary leading-snug"
        style={{
          fontSize: "1.4rem",
          fontWeight: 300,
          fontStyle: italic ? "italic" : "normal",
          letterSpacing: "0.005em",
        }}
      >
        {body}
      </p>
    </div>
  );
}
