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
import { PageHead, PageTitle, InkButton, HairlineButton } from "@/components/PageHead";

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
      <div className="min-h-[100dvh] bg-forest-deep">
        <PageHead label={t("first_mirror.title")} />
        <div className="max-w-lg mx-auto px-5" style={{ paddingTop: 18 }}>
          <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: "rgb(var(--rgb-text-secondary))" }}>
            {t("first_mirror.reading")}
          </p>
        </div>
      </div>
    );
  }

  if (!mirror) return null;

  // First Words screen: the Oracle is awake, ask one true question.
  if (showAsk) {
    return (
      <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(48px + var(--sab, 0px))" }}>
        <PageHead label={t("first_mirror.awake")} />
        <div className="max-w-lg mx-auto px-5 animate-slide-up">
          <PageTitle title={t("first_mirror.ask_title")} sub={t("first_mirror.ask_hint")} />
          <div style={{ borderTop: "1px solid rgb(var(--rgb-border))" }}>
            {[t("first_mirror.chip_yes"), t("first_mirror.chip_forcing")].map((q) => (
              <button
                key={q}
                onClick={() => askOracle(q)}
                className="w-full text-left font-body transition-opacity active:opacity-70"
                style={{ paddingBlock: 18, fontSize: 17, lineHeight: 1.5, fontWeight: 500, color: "rgb(var(--rgb-text-primary))", borderBottom: "1px solid rgb(var(--rgb-border))" }}
              >
                {q}
              </button>
            ))}
          </div>
          <div className="mt-8 space-y-3">
            <InkButton onClick={() => askOracle()}>{t("first_mirror.chip_own")}</InkButton>
            <HairlineButton onClick={() => router.replace("/today")}>{t("first_mirror.not_now")}</HairlineButton>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(48px + var(--sab, 0px))" }}>
      <PageHead label={t("first_mirror.title")} />

      {/* Body: three lines, each on its own hairline fold */}
      <div className="max-w-lg mx-auto px-5" style={{ paddingTop: 18 }}>
        <MirrorLine label={t("first_mirror.line_pattern")} body={mirror.pattern} visible={revealStage >= 1} />
        <MirrorLine label={t("first_mirror.line_shadow")} body={mirror.shadow} visible={revealStage >= 2} />
        <MirrorLine label={t("first_mirror.line_question")} body={mirror.question} visible={revealStage >= 3} quiet />

        {/* Continue CTA appears after all three lines have landed */}
        <div
          className="pt-6 transition-all duration-700"
          style={{
            opacity: revealStage >= 4 ? 1 : 0,
            transform: revealStage >= 4 ? "translateY(0)" : "translateY(8px)",
          }}
        >
          <InkButton onClick={() => setShowAsk(true)}>{t("common.continue")}</InkButton>
          <p className="mt-4 font-body" style={{ fontSize: 15, color: "rgb(var(--rgb-text-muted))" }}>
            {t("first_mirror.oracle_remembers")}
          </p>
        </div>
      </div>
    </div>
  );
}

function MirrorLine({ label, body, visible, quiet }: { label: string; body: string; visible: boolean; quiet?: boolean }) {
  return (
    <div
      className="transition-all duration-1000"
      style={{
        opacity: visible ? 1 : 0,
        transform: visible ? "translateY(0)" : "translateY(12px)",
        borderTop: "1px solid rgb(var(--rgb-border))",
        paddingBottom: 24,
      }}
    >
      <p
        className="font-body uppercase"
        style={{ paddingBlock: 16, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}
      >
        {label}
      </p>
      <p
        className="font-heading"
        style={{
          fontSize: 22,
          lineHeight: 1.35,
          fontWeight: quiet ? 500 : 900,
          letterSpacing: "-.02em",
          color: "rgb(var(--rgb-text-primary))",
        }}
      >
        {body}
      </p>
    </div>
  );
}
