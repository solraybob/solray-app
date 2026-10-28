"use client";

import ProtectedRoute from "@/components/ProtectedRoute";
import { humanizeCycleTitle, fmtDateLong } from "@/components/CurrentCycles";
import BirthTimeCheckBanner from "@/components/BirthTimeCheckBanner";
import { openAiConsentSheet } from "@/lib/ai-consent";
import DeckCard from "@/components/NowDeckCard";
import { nowCardContent } from "@/lib/now-card";
import { fill } from "@/lib/i18n";
import { Wordmark } from "@/components/Wordmark";
import VerifyEmailBanner from "@/components/VerifyEmailBanner";
import { BirthdayModal } from "./BirthdayModal";
import { LunarMomentModal } from "./LunarMomentModal";
import { BreakthroughModal } from "./BreakthroughModal";
import { SkyEchoModal } from "./SkyEchoModal";
import { SkeletonToday } from "./SkeletonToday";
import { PendingTodayState } from "./PendingTodayState";
import { Deck } from "./Deck";
import type { useTodayState } from "../_hooks/useTodayState";
import type { useTodayData } from "../_hooks/useTodayData";

export function renderToday(pageCtx: ReturnType<typeof useTodayState> & ReturnType<typeof useTodayData>) {
  const {
    askOracle, birthCheck, birthDate, cycles, deckBoxRef, dismissBirthday, dismissBreakthrough,
    dismissLunar, dismissSkyEcho, emailVerified, error, forecast, goDeeperBirthday, goDeeperLunar,
    goDeeperSkyEcho, insight, lang, laterBirthday, laterBreakthrough, laterLunar, laterSkyEcho,
    loading, openInsightInChat, plainCard, showBirthday, showBreakthrough, showLunar, showSkyEcho,
    skyEcho, t, today, visibleSections
  } = pageCtx;
  return (
    <ProtectedRoute>
      {/* One takeover per open. Priority: birthday (once a year, the rarest
          and most personal) wins, then the lunar moment (time-bound to its
          day), then the breakthrough (persists, shows next open), then the
          recall. */}
      {showBirthday && birthDate && (
        <BirthdayModal
          birthDate={birthDate}
          onGoDeeper={goDeeperBirthday}
          onLater={laterBirthday}
          onDismiss={dismissBirthday}
        />
      )}
      {!showBirthday && showLunar && forecast?.lunar_event && (
        <LunarMomentModal
          event={forecast.lunar_event}
          onGoDeeper={goDeeperLunar}
          onLater={laterLunar}
          onDismiss={dismissLunar}
        />
      )}
      {!showBirthday && !showLunar && showBreakthrough && insight && (
        <BreakthroughModal
          insight={insight}
          onAsk={openInsightInChat}
          onLater={laterBreakthrough}
          onDismiss={dismissBreakthrough}
        />
      )}
      {!showBirthday && !showLunar && !showBreakthrough && showSkyEcho && skyEcho && (
        <SkyEchoModal
          echo={skyEcho}
          onGoDeeper={goDeeperSkyEcho}
          onLater={laterSkyEcho}
          onDismiss={dismissSkyEcho}
        />
      )}
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(96px + var(--sab, 0px))" }}
      >
        {/* The same head as the Oracle, Dynamics and You, to the pixel: the
            mark at 17, a 34px action row so a page with icons and a page
            without are the same height, the inset rule, then the small label
            line. Now used to carry a 21px mark over a full-bleed rule and no
            label line, which made it the one page whose header was taller. */}
        <div className="w-full max-w-lg lg:max-w-3xl mx-auto px-5 pt-3">
          <div className="flex items-center justify-between" style={{ minHeight: 34 }}>
            {/* The fixed DesktopHeader carries the mark from lg up, so this
                one steps aside there rather than printing solray twice. */}
            <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
          </div>
          <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
          <p
            className="font-body uppercase"
            style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
          >
            {today}
          </p>
        </div>

        <VerifyEmailBanner emailVerified={emailVerified} />
        <BirthTimeCheckBanner check={birthCheck} />

        {loading ? (
          <SkeletonToday />
        ) : forecast && forecast._pending === true && !forecast._consent ? (
          <PendingTodayState planets={forecast.planets} />
        ) : forecast ? (
          <>
            <div
              className="max-w-lg lg:max-w-3xl mx-auto px-5"
              style={{ display: "flex", flexDirection: "column" }}
            >
              {error && (
                <p className="font-body text-text-muted" style={{ fontSize: 14, marginTop: 18 }}>{t(error)}</p>
              )}

              {/* mundane's Now screen: the quiet line under the rule, then the
                  deck, then the dots. The line is the day's configuration,
                  which is what changes every morning. */}
              {/* mundane's .creed, which is centred and balanced, not left-set:
                  .creed{font-size:13px;line-height:1.45;color:var(--ink3);
                    margin:12px auto 0;text-align:center;max-width:26em;
                    text-wrap:balance}
                  One step up in size, because this line is the day's fact and
                  carries more weight here than a creed does there. */}
              {/* One screen, exactly: the day's line, then the deck, then the
                  dots. The height is the viewport less the header above it
                  (132), the status bar inset, and the bottom bar the page
                  already pads for (96 plus its own inset). The deck takes what
                  is left with flex-basis 0, so the card is given a track
                  rather than growing to whatever its text wants and carrying
                  the dots under the bar. Sky Now sits after this box, which is
                  what puts it below the fold. */}
              <div ref={deckBoxRef} className="sol-today-box" style={{ display: "flex", flexDirection: "column" }}>
              {/* The sky line (the day's aspect and the Moon's sign) used to sit
                  here. The Now card speaks in plain words, so the line above it
                  does too: nothing. Sky Now below still carries the positions. */}

              {/* .deckwrap{flex:1 1 auto;min-height:0;display:flex;
                  flex-direction:column;justify-content:center} */}
              <div
                className="transition-opacity duration-700"
                style={{ flex: "1 1 0", minHeight: 0, overflow: "hidden", display: "flex", flexDirection: "column", justifyContent: "center", opacity: visibleSections >= 1 ? 1 : 0 }}
              >
                <Deck count={1 + cycles.length}>
                  {forecast._pending === true ? (
                  // No AI agreement yet: the day's card asks for it, quietly,
                  // and opens the consent sheet. The cycles follow as usual.
                  <DeckCard
                    kick={t("today.kick_today")}
                    title={t("today.consent_card_title")}
                    body={t("today.consent_card_body")}
                    action={t("settings.ai_consent_give")}
                    onAction={() => openAiConsentSheet()}
                  />
                  ) : (
                  <DeckCard
                    kick={t("today.kick_today")}
                    title={nowCardContent(forecast, plainCard).title}
                    body={nowCardContent(forecast, plainCard).body}
                    action={t("insight.go_deeper")}
                    onAction={() =>
                      askOracle(
                        forecast.day_title,
                        fill(t("prompts.today_deeper"), { title: forecast.day_title, reading: forecast.reading })
                      )
                    }
                  />
                  )}
                  {cycles.map((c) => (
                    <DeckCard
                      key={`${c.transit_planet}-${c.natal_point}-${c.aspect}`}
                      kick={c.phase === "applying" ? t("cycles.applying") : t("cycles.separating")}
                      title={humanizeCycleTitle(c.title, lang)}
                      body={c.summary || ""}
                      action={t("insight.go_deeper")}
                      onAction={() =>
                        askOracle(
                          c.title,
                          fill(t("prompts.cycle_deeper"), {
                            title: humanizeCycleTitle(c.title, lang),
                            phase: t(c.phase === "applying" ? "prompts.phase_building" : "prompts.phase_separating"),
                            peak: fmtDateLong(c.peak, lang) || c.peak,
                            summary: c.summary || "",
                          }).replace(/\s+/g, " ").trim()
                        )
                      }
                    />
                  ))}
                </Deck>
              </div>

              {/* Sky now, folded away at the foot of the screen. mundane's
                  disclosure grammar: a quiet uppercase label over a hairline,
                  the content underneath only when it is asked for. */}
              </div>

              {/* The planet list ("Sky now") left Now on 23 Oct 2026: Now is the
                  companion's reflection only. SkyNowFold is kept for the You page. */}
            </div>
          </>
        ) : (
          // Total fetch failure with no cache. Honest error state, no
          // invented forecast content. Refresh button kicks the user
          // back into the load path so they can retry without leaving.
          <div className="max-w-lg lg:max-w-3xl mx-auto px-5 pt-24 text-center">
            <p className="font-heading text-text-primary text-2xl mb-4" style={{ fontWeight: 900 }}>
              {t("today.sky_quiet")}
            </p>
            <p className="text-text-secondary font-body text-[17px] leading-relaxed mb-8">
              {error ? t(error) : t("today.error_no_reading")}
            </p>
            {error !== "oracle_errors.under_minimum_age" && (
            <button
              onClick={() => (error === "today.consent_needed" ? openAiConsentSheet() : window.location.reload())}
              className="inline-block px-8 py-3 rounded-full text-[13px] tracking-[0.3em] uppercase transition-all font-bold"
              style={{
                background: "rgb(var(--rgb-text-primary))",
                color: "rgb(var(--rgb-bg-deep))",
              }}
            >
              {error === "today.consent_needed" ? t("settings.ai_consent_give") : t("common.retry")}
            </button>
            )}
          </div>
        )}

      </div>

    </ProtectedRoute>
  );
}
