"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import NatalWheel from "@/components/NatalWheel";
import BodyGraph from "@/components/BodyGraph";
import { planetText, GLYPH_FONT_FAMILY } from "@/components/AstroGlyphs";
import { useT } from "@/lib/i18n";
import { tx, ES_HD_TYPE_MEANINGS, ES_HD_AUTHORITY_MEANINGS, ES_HD_PROFILE_MEANINGS, ES_CORE_SUBTITLES } from "@/lib/astro-i18n";
import { accountKey } from "@/lib/account-session";
import { type NatalAspect } from "../_lib/profile-data";
import { parseBlueprintForChart, HD_TYPE_MEANINGS, HD_AUTHORITY_MEANINGS, HD_PROFILE_MEANINGS } from "../_lib/blueprint-chart";
import { CollapsibleSection } from "./CollapsibleSection";
import { NatalAspects } from "./NatalAspects";

// ---------------------------------------------------------------------------
// Blueprint Sections (merged from chart page)
// ---------------------------------------------------------------------------

function HDRow({ label, value, meaning }: { label: string; value: string; meaning?: string }) {
  // The profile meaning opens by repeating the profile name, which the value
  // right above it has already said ("1/3: Investigator / Martyr" then
  // "Investigator / Martyr. You learn by..."). Drop the echo.
  let body = meaning;
  if (body) {
    const name = value.includes(":") ? value.split(":").slice(1).join(":").trim() : value.trim();
    if (name && body.toLowerCase().startsWith(name.toLowerCase())) {
      body = body.slice(name.length).replace(/^[.,:;\s]+/, "");
    }
  }
  return (
    <div className="flex items-start gap-3">
      <span
        className="font-body shrink-0"
        style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase",
                 color: "rgb(var(--rgb-text-muted))", width: 96, paddingTop: 4 }}
      >
        {label}
      </span>
      <div className="flex-1">
        <span className="font-body" style={{ fontSize: 17, color: "rgb(var(--rgb-text-primary))" }}>{value}</span>
        {body && (
          <p className="font-body" style={{ fontSize: 14.5, lineHeight: 1.5, marginTop: 3, color: "rgb(var(--rgb-text-muted))" }}>
            {body}
          </p>
        )}
      </div>
    </div>
  );
}

function GKStep({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p
        className="font-body"
        style={{ fontSize: 11, fontWeight: 700, letterSpacing: "0.18em", textTransform: "uppercase",
                 color: "rgb(var(--rgb-text-muted))", marginBottom: 4 }}
      >
        {label}
      </p>
      <p className="font-heading" style={{ fontSize: 16, fontWeight: 700, letterSpacing: "-.012em", color: "rgb(var(--rgb-text-primary))" }}>
        {value}
      </p>
    </div>
  );
}

// Ask button, opens chat with a pre-set question about a profile element.
// Uses router.push so React state and auth context are preserved (avoids the
// full page reload that window.location.href would cause).
function AskButton({ topic, question }: { topic: string; question: string }) {
  const { t } = useT();
  const router = useRouter();
  const handleClick = () => {
    try {
      sessionStorage.setItem("solray_chat_prompt", JSON.stringify({ topic, question }));
    } catch (_) {}
    router.push("/chat");
  };
  return (
    <button
      onClick={handleClick}
      className="font-body"
      style={{
        // Same hairline ink pill as the deck's go-deeper button. It was an
        // amber pill, which made every planet row carry an accent.
        fontSize: 12, fontWeight: 700, letterSpacing: "0.16em", textTransform: "uppercase",
        color: "rgb(var(--rgb-text-primary))", background: "none",
        border: "1px solid rgb(var(--rgb-text-primary) / .28)",
        borderRadius: 999, padding: "4px 12px",
      }}
    >
      {t("profile.ask")}
    </button>
  );
}

export function BlueprintSections({ token, aspects, openSection, onToggleSection }: { token: string | null; aspects: NatalAspect[]; openSection: string | null; onToggleSection: (title: string) => void }) {
  const { t, lang } = useT();
  const es = lang.startsWith("es");
  // token gates the cached-blueprint read below
  const [chart, setChart] = useState<ReturnType<typeof parseBlueprintForChart> | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [showAll, setShowAll] = useState(false);

  useEffect(() => {
    if (!token) return;
    // The parent ProfilePage already writes solray_blueprint to localStorage
    // before we mount. We re-read it here to parse the chart shape for these
    // sections. If the cache isn't there yet (race on first load), we retry
    // once on the next tick rather than silently rendering nothing.
    let cancelled = false;
    const tryLoad = () => {
      try {
        const cached = localStorage.getItem(accountKey("solray_blueprint"));
        if (cached) {
          const bp = JSON.parse(cached);
          if (!cancelled) {
            setChart(parseBlueprintForChart(bp));
            setChartReady(true);
          }
          return true;
        }
      } catch (_) {}
      return false;
    };
    if (!tryLoad()) {
      const retryTimer = setTimeout(() => {
        if (!tryLoad() && !cancelled) setChartReady(true);
      }, 200);
      return () => { cancelled = true; clearTimeout(retryTimer); };
    }
    return () => { cancelled = true; };
  }, [token]);

  if (!chartReady) {
    // Quiet placeholder, better than blank
    return (
      <div className="space-y-3 mb-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="h-14 rounded-2xl border border-forest-border/40 bg-forest-card/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (!chart) {
    return (
      <div className="mb-4 rounded-2xl border border-forest-border/50 bg-forest-card/30 px-5 py-6 text-center">
        <p className="font-body text-text-secondary text-[17px] leading-relaxed">
          {t("profile.blueprint_weaving")}
        </p>
      </div>
    );
  }

  const corePlanets = ["Sun", "Moon", "ASC"];
  const core = chart.natal.filter((p) => corePlanets.includes(p.planet));
  const rest = chart.natal.filter((p) => !corePlanets.includes(p.planet));

  return (
    <>
      {/* Natal Chart */}
      <CollapsibleSection title="Natal Chart" open={openSection === "Natal Chart"} onToggle={onToggleSection}>
        <div className="mt-2">
          {/* Wheel */}
          <div className="mb-5">
            <NatalWheel
              planets={chart.natal.map((p) => ({ planet: p.planet, symbol: p.symbol, longitude: p.longitude, retrograde: p.retrograde }))}
              ascLongitude={chart.ascLongitude}
              houseCusps={chart.houseCusps}
              aspects={aspects}
              size={320}
              showLegend
            />
          </div>
          {/* Core trio */}
          <div className="space-y-4 mb-6">
            {core.map((p) => {
              const label = p.planet === "ASC" ? "Rising" : p.planet;
              const signEs = tx(p.sign, lang);
              const subtitlesEn: Record<string, string> = {
                Sun: "Your core identity, how you shine",
                Moon: "Your emotional nature, how you feel",
                Rising: "Your outer mask, how the world sees you",
              };
              const subtitles = es ? ES_CORE_SUBTITLES : subtitlesEn;
              const questions: Record<string, string> = es
                ? {
                    Sun: `¿Qué significa mi Sol en ${signEs} para mi identidad y mi camino de vida?`,
                    Moon: `¿Qué revela mi Luna en ${signEs} sobre mi naturaleza emocional y mi mundo interior?`,
                    Rising: `¿Qué significa mi Ascendente en ${signEs} para cómo me muestro al mundo?`,
                  }
                : {
                    Sun: `What does my ${p.sign} Sun mean for my identity and life path?`,
                    Moon: `What does my ${p.sign} Moon reveal about my emotional nature and inner world?`,
                    Rising: `What does my ${p.sign} Rising sign mean for how I show up in the world?`,
                  };
              return (
                <div key={p.planet} className="flex items-center gap-4 py-3 border-b border-forest-border/40 last:border-0">
                  <span
                    className="shrink-0 inline-flex items-center justify-center"
                    style={{
                      width: 32,
                      height: 32,
                      fontFamily: GLYPH_FONT_FAMILY,
                      fontSize: 26,
                      color: "var(--text-primary)",
                      opacity: 0.9,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    {planetText(p.planet)}
                  </span>
                  <div className="flex-1">
                    <p className="font-body text-text-secondary text-[14px] tracking-widest uppercase font-bold">{tx(label, lang)}</p>
                    <p className="font-body text-text-muted text-[14px]">{subtitles[label]}</p>
                  </div>
                  <div className="text-right flex flex-col items-end gap-1">
                    <p className="font-heading text-text-primary leading-tight" style={{ fontSize: 17, fontWeight: 700, letterSpacing: "-.015em" }}>{signEs}</p>
                    <p className="font-body text-text-muted text-[14px]">{p.degree}</p>
                    {questions[label] && <AskButton topic={es ? `${tx(label, lang)} en ${signEs}` : `${label} in ${p.sign}`} question={questions[label]} />}
                  </div>
                </div>
              );
            })}
          </div>
          {/* All planets */}
          <button
            onClick={() => setShowAll(!showAll)}
            className="flex items-center gap-2 font-body text-text-secondary text-[14px] tracking-widest uppercase mb-3 hover:text-text-primary transition-colors font-bold"
          >
            <span>{showAll ? t("profile.hide_planets") : t("profile.see_all_planets")}</span>
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className={`transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}>
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {showAll && (
            <div className="space-y-1">
              {rest.map((p) => (
                <div key={p.planet} className="flex items-center gap-3 py-1.5 border-b border-forest-border/50 last:border-0">
                  <span
                    className="shrink-0 inline-flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      fontFamily: GLYPH_FONT_FAMILY,
                      fontSize: 18,
                      color: "var(--text-primary)",
                      opacity: 0.8,
                      lineHeight: 1,
                    }}
                    aria-hidden="true"
                  >
                    {planetText(p.planet)}
                  </span>
                  <span className="font-body text-text-primary text-[17px] flex-1">{tx(p.planet, lang)}</span>
                  <span className="font-body text-text-secondary text-[17px]">{tx(p.sign, lang)}</span>
                  <span className="font-body text-text-secondary text-[14px]">{p.degree}</span>
                  {p.retrograde && <span className="font-body text-amber-sun text-[14px] font-semibold">Rx</span>}
                  <span className="font-body text-text-secondary text-[14px]">H{p.house}</span>
                </div>
              ))}
            </div>
          )}

          {/* Natal Aspects, inside Natal Chart */}
          {aspects.length > 0 && (
            <div className="mt-4 pt-4 border-t border-forest-border/40">
              <NatalAspects aspects={aspects} />
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Human Design */}
      <CollapsibleSection title="Human Design" open={openSection === "Human Design"} onToggle={onToggleSection}>
        <div className="space-y-4 mt-2">
          {/* Bodygraph */}
          <div className="mb-2">
            <BodyGraph
              definedCenters={chart.human_design.defined_centres}
              definedChannels={chart.hd_channels}
              size={280}
            />
          </div>
          {chart.human_design.type && (
            <div className="pb-4 mb-1 border-b border-forest-border/40">
              <div className="flex items-center justify-between mb-1">
                <p className="text-text-secondary text-[14px] font-body tracking-[0.22em] uppercase font-bold">{tx("Type", lang)}</p>
                <AskButton
                  topic={es ? `Tipo ${tx(chart.human_design.type, lang)}` : `${chart.human_design.type} type`}
                  question={es
                    ? `Soy ${tx(chart.human_design.type, lang)}. ¿Qué significa esto para cómo uso mi energía y tomo decisiones?`
                    : `I'm a ${chart.human_design.type}. What does this mean for how I use my energy and make decisions?`}
                />
              </div>
              <p className="font-heading leading-tight" style={{ color: "var(--moss)", fontSize: "1.4rem", fontWeight: 900, letterSpacing: "0.04em" }}>{tx(chart.human_design.type, lang)}</p>
              {(es ? ES_HD_TYPE_MEANINGS : HD_TYPE_MEANINGS)[chart.human_design.type] && (
                <p className="text-text-muted text-[15px] font-body leading-snug mt-1">{(es ? ES_HD_TYPE_MEANINGS : HD_TYPE_MEANINGS)[chart.human_design.type]}</p>
              )}
            </div>
          )}
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label={tx("Strategy", lang)} value={tx(chart.human_design.strategy, lang)} /></div>
            <AskButton
              topic={tx("Strategy", lang)}
              question={es
                ? `Mi estrategia de Diseño Humano es: ${tx(chart.human_design.strategy, lang)}. ¿Cómo la vivo en la práctica?`
                : `My Human Design strategy is: ${chart.human_design.strategy}. How do I live this in practice?`}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label={tx("Authority", lang)} value={tx(chart.human_design.authority, lang)} meaning={(es ? ES_HD_AUTHORITY_MEANINGS : HD_AUTHORITY_MEANINGS)[chart.human_design.authority]} /></div>
            <AskButton
              topic={tx("Authority", lang)}
              question={es
                ? `Mi autoridad interna es ${tx(chart.human_design.authority, lang)}. ¿Cómo la uso para tomar mejores decisiones?`
                : `My inner authority is ${chart.human_design.authority}. How do I use this to make better decisions?`}
            />
          </div>
          <div className="flex items-center justify-between">
            <div className="flex-1"><HDRow label={tx("Profile", lang)} value={chart.human_design.profile} meaning={(() => { const n = chart.human_design.profile.match(/^(\d\/\d)/)?.[1]; return n ? (es ? ES_HD_PROFILE_MEANINGS : HD_PROFILE_MEANINGS)[n] : undefined; })()} /></div>
            <AskButton
              topic={tx("Profile", lang)}
              question={es
                ? `Mi perfil de Diseño Humano es ${chart.human_design.profile}. ¿Qué revela sobre el propósito de mi vida y mi forma de ser?`
                : `My Human Design profile is ${chart.human_design.profile}. What does this reveal about my life's purpose and way of being?`}
            />
          </div>
          {chart.human_design.incarnation_cross && (
            <div className="flex items-center justify-between">
              <div className="flex-1"><HDRow label={tx("Cross", lang)} value={chart.human_design.incarnation_cross} /></div>
              <AskButton
                topic={es ? "Cruz de Encarnación" : "Incarnation Cross"}
                question={es
                  ? `Mi Cruz de Encarnación es ${chart.human_design.incarnation_cross}. ¿Cuál es el propósito de mi vida según esto?`
                  : `My Incarnation Cross is ${chart.human_design.incarnation_cross}. What is my life purpose according to this?`}
              />
            </div>
          )}
          {/* The two rows of centre pills that sat here listed exactly what
              the bodygraph above already draws, filled for defined and
              outlined for undefined, in a sage green that is not in the
              palette. The graph is the canonical display. */}
          {chart.human_design.key_channels.length > 0 && (
            <div>
              <p className="font-body" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgb(var(--rgb-text-muted))", marginBottom: 8 }}>
                {t("profile.key_channels")}
              </p>
              <div>
                {chart.human_design.key_channels.map((ch) => (
                  <p key={ch} className="font-body" style={{ fontSize: 15, lineHeight: 1.6, color: "rgb(var(--rgb-text-primary))" }}>{ch}</p>
                ))}
              </div>
            </div>
          )}
        </div>
      </CollapsibleSection>

      {/* Gene Keys */}
      <CollapsibleSection title="Gene Keys" open={openSection === "Gene Keys"} onToggle={onToggleSection}>
        {/* One hairline row per key, the same grammar as the folds that hold
            them. These were tinted lilac cards with a lilac border, a lilac
            eyebrow, and three words in three different colours, one of them a
            gradient clipped to the text. */}
        <div style={{ marginTop: 4 }}>
          {Object.values(chart.gene_keys).filter(Boolean).map((gk, gi) => (
            <div
              key={gk!.name}
              style={{ paddingBlock: 18, borderTop: gi === 0 ? "none" : "1px solid rgb(var(--rgb-border) / .6)" }}
            >
              <div className="flex items-center justify-between" style={{ gap: 12, marginBottom: 12 }}>
                <p className="font-body" style={{ fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", textTransform: "uppercase", color: "rgb(var(--rgb-text-muted))" }}>
                  {tx(gk!.name, lang)} · {tx("Gate", lang)} {gk!.gate}
                </p>
                <AskButton
                  topic={es ? `Llave Genética ${gk!.gate}` : `Gene Key ${gk!.gate}`}
                  question={es
                    ? `Mi Llave Genética de ${tx(gk!.name, lang)} es la Puerta ${gk!.gate}, con la sombra de ${tx(gk!.shadow, lang)} y el don de ${tx(gk!.gift, lang)}. ¿Cómo trabajo con esto en mi vida?`
                    : `My ${gk!.name} Gene Key is Gate ${gk!.gate}, with a shadow of ${gk!.shadow} and a gift of ${gk!.gift}. How do I work with this in my life?`}
                />
              </div>
              <div className="grid grid-cols-3" style={{ gap: 12 }}>
                <GKStep label={tx("Shadow", lang)} value={tx(gk!.shadow, lang)} />
                <GKStep label={tx("Gift", lang)} value={tx(gk!.gift, lang)} />
                <GKStep label={tx("Siddhi", lang)} value={tx(gk!.siddhi, lang)} />
              </div>
            </div>
          ))}
        </div>
      </CollapsibleSection>

    </>
  );
}
