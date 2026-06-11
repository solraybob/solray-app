"use client";

/**
 * /profile/[id] — view a soul connection's profile.
 *
 * When the connection has marked their profile public, render the same
 * depth Bob sees on his own /profile: natal wheel, HD bodygraph, Gene
 * Keys, numerology. When they haven't, respect the choice.
 *
 * 403 from the endpoint = not a connection. We surface a soft message
 * pointing back to /souls so the user can send an invite.
 */

import { useEffect, useState, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import NatalWheel from "@/components/NatalWheel";
import BodyGraph from "@/components/BodyGraph";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";
import { useT } from "@/lib/i18n";
import {
  parseBlueprintForChart,
  HD_TYPE_MEANINGS,
  HD_AUTHORITY_MEANINGS,
  HD_PROFILE_MEANINGS,
  type ParsedChart,
} from "@/lib/blueprintParse";

interface PublicProfile {
  id: string;
  username?: string | null;
  name: string;
  profile_photo?: string | null;
  is_public: boolean;
  birth_date?: string;
  birth_time?: string;
  birth_city?: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  blueprint?: any;
}

export default function ConnectionProfilePage() {
  const params = useParams();
  const router = useRouter();
  const { token } = useAuth();
  const { t } = useT();
  const id = String(params?.id || "");

  const [profile, setProfile] = useState<PublicProfile | null>(null);
  const [error,   setError]   = useState<"forbidden" | "missing" | "network" | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token || !id) return;
    setLoading(true);
    apiFetch(`/users/${id}/public-profile`, {}, token)
      .then((data) => setProfile(data))
      .catch((e: unknown) => {
        if (e instanceof ApiError) {
          if (e.status === 403) setError("forbidden");
          else if (e.status === 404) setError("missing");
          else setError("network");
        } else {
          setError("network");
        }
      })
      .finally(() => setLoading(false));
  }, [token, id]);

  const initials = (profile?.name || "·").charAt(0).toUpperCase();

  return (
    <ProtectedRoute>
      <div
        className="min-h-[100dvh] bg-forest-deep"
        style={{ paddingBottom: "calc(160px + env(safe-area-inset-bottom, 16px))" }}
      >
        {/* Header */}
        <div className="border-b border-forest-border/50">
          <div className="max-w-lg mx-auto px-5 pt-2 pb-3">
            <p className="font-body text-[12px] tracking-[0.18em] uppercase mb-1" style={{ color: "rgb(var(--rgb-indigo))" }}>
              {t("conn.soul")}
            </p>
            <div className="relative flex items-center" style={{ height: "26px" }}>
              <button
                onClick={() => router.back()}
                aria-label={t("common.back")}
                className="text-text-secondary hover:text-amber-sun transition-colors flex items-center justify-center"
                style={{ minWidth: "32px", minHeight: "32px", marginLeft: "-8px" }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
                  <polyline points="15 18 9 12 15 6"/>
                </svg>
              </button>
              <h1
                className="font-heading tracking-[0.15em] text-text-primary absolute left-1/2 -translate-x-1/2"
                style={{ fontWeight: 300, fontSize: "21px" }}
              >
                SOLRAY
              </h1>
            </div>
          </div>
        </div>

        <div className="max-w-lg mx-auto px-5 pt-8 page-enter">
          {loading && (
            <div className="text-center pt-12">
              <div className="h-1 w-32 mx-auto skeleton-shimmer rounded-full" />
            </div>
          )}

          {!loading && error === "forbidden" && (
            <EmptyState
              title={t("conn.forbidden_title")}
              body={t("conn.forbidden_body")}
              actionLabel={t("conn.open_souls")}
              onAction={() => router.push("/souls")}
            />
          )}

          {!loading && error === "missing" && (
            <EmptyState
              title={t("conn.missing_title")}
              body={t("conn.missing_body")}
              actionLabel={t("conn.open_souls")}
              onAction={() => router.push("/souls")}
            />
          )}

          {!loading && error === "network" && (
            <EmptyState
              title={t("conn.network_title")}
              body={t("conn.network_body")}
              actionLabel={t("common.retry")}
              onAction={() => location.reload()}
            />
          )}

          {!loading && !error && profile && (
            <>
              {/* Avatar + Identity */}
              <div className="pt-6 pb-5 flex flex-col items-center gap-3">
                {profile.profile_photo ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={profile.profile_photo}
                    alt={profile.name}
                    className="rounded-full object-cover border border-forest-border"
                    style={{ width: 96, height: 96 }}
                  />
                ) : (
                  <div
                    className="rounded-full border border-forest-border bg-forest-card/60 flex items-center justify-center font-heading text-text-primary"
                    style={{ width: 96, height: 96, fontSize: 36, fontWeight: 300 }}
                  >
                    {initials}
                  </div>
                )}
                <div className="text-center">
                  <p className="font-heading text-text-primary" style={{ fontSize: 22, fontWeight: 300 }}>
                    {profile.name}
                  </p>
                  {profile.username && (
                    <p className="font-body text-text-secondary text-[14px] mt-1">@{profile.username}</p>
                  )}
                </div>
              </div>

              {/* Accepted connections always see each other's chart (the
                  backend returns the blueprint for connections regardless of
                  is_public). Show it whenever the blueprint is present. */}
              {profile.blueprint ? (
                <PublicProfileBody profile={profile} />
              ) : (
                <PrivateProfileNotice name={profile.name} />
              )}

              {/* Compatibility section — visible whether the connection
                  is public or private, because compat reads the SHAPE
                  of the dynamic between two charts and only requires
                  the accepted connection (not is_public). */}
              <CompatibilitySection token={token} soulId={id} soulName={profile.name} />
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PrivateProfileNotice({ name }: { name: string }) {
  const { t } = useT();
  return (
    <div className="mt-4 mb-6 px-6 py-8 rounded-2xl border border-forest-border/60 bg-forest-card/40 text-center">
      <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>
        {t("conn.private_title")}
      </p>
      <p className="font-body text-text-secondary text-[15px] leading-relaxed max-w-xs mx-auto">
        {t("conn.private_body").replace("{name}", name)}
      </p>
    </div>
  );
}

function PublicProfileBody({ profile }: { profile: PublicProfile }) {
  const { t } = useT();
  const chart: ParsedChart | null = useMemo(
    () => (profile.blueprint ? parseBlueprintForChart(profile.blueprint) : null),
    [profile.blueprint]
  );

  const bp = profile.blueprint || {};
  const summary  = bp.summary || {};
  const planets  = bp.astrology?.natal?.planets || {};
  const sunSign  = summary.sun_sign  || planets.Sun?.sign  || null;
  const moonSign = summary.moon_sign || planets.Moon?.sign || null;
  const ascSign  = summary.asc_sign  || planets.ASC?.sign  || (chart?.natal.find((p) => p.planet === "ASC")?.sign ?? null);

  const profileMatch = chart?.human_design.profile?.match(/^(\d\/\d)/)?.[1];
  const profileMeaning = profileMatch ? HD_PROFILE_MEANINGS[profileMatch] : undefined;

  return (
    <div className="space-y-4">
      {/* Three-line essence */}
      {(sunSign || chart?.human_design.type) && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">{t("conn.essence")}</p>
          <div className="space-y-1.5 font-body text-[15px]">
            {sunSign  && <Row label={t("planets.sun")}  value={sunSign}  />}
            {moonSign && <Row label={t("planets.moon")} value={moonSign} />}
            {ascSign  && <Row label={t("planets.ascendant")} value={ascSign} />}
            {chart?.human_design.type && (
              <Row label={t("conn.human_design")} value={`${chart.human_design.type}${chart.human_design.profile ? ` ${chart.human_design.profile}` : ""}`} />
            )}
            {chart?.human_design.authority && <Row label={t("conn.authority")} value={chart.human_design.authority} />}
          </div>
        </div>
      )}

      {/* Birth details intentionally not shown for connections.
          Birth date, time, and place are the most identifying pieces of a
          chart and they belong to the person, not to anyone reading their
          profile. The chart wheel below is enough to read who someone is
          without surfacing the raw birth coordinates. */}

      {/* Natal Chart */}
      {chart && chart.natal.length > 0 && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">{t("conn.natal_chart")}</p>
          <div className="flex justify-center">
            <NatalWheel
              planets={chart.natal.map((p) => ({ planet: p.planet, symbol: p.symbol, longitude: p.longitude, retrograde: p.retrograde }))}
              ascLongitude={chart.ascLongitude}
              houseCusps={chart.houseCusps}
              size={300}
              showLegend
            />
          </div>
        </div>
      )}

      {/* Human Design */}
      {chart && chart.human_design.defined_centres.length > 0 && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">{t("conn.human_design")}</p>
          <div className="flex justify-center mb-4">
            <BodyGraph
              definedCenters={chart.human_design.defined_centres}
              definedChannels={chart.hd_channels}
              size={260}
            />
          </div>
          <div className="space-y-2 font-body text-[14px]">
            {chart.human_design.type && (
              <DepthRow
                label={t("conn.type")}
                value={chart.human_design.type}
                meaning={HD_TYPE_MEANINGS[chart.human_design.type]}
              />
            )}
            {chart.human_design.strategy && (
              <DepthRow label={t("conn.strategy")} value={chart.human_design.strategy} />
            )}
            {chart.human_design.authority && (
              <DepthRow
                label={t("conn.authority")}
                value={chart.human_design.authority}
                meaning={HD_AUTHORITY_MEANINGS[chart.human_design.authority]}
              />
            )}
            {chart.human_design.profile && (
              <DepthRow
                label={t("conn.profile")}
                value={chart.human_design.profile}
                meaning={profileMeaning}
              />
            )}
            {chart.human_design.incarnation_cross && (
              <DepthRow label={t("conn.cross")} value={chart.human_design.incarnation_cross} />
            )}
          </div>
        </div>
      )}

      {/* Gene Keys */}
      {chart && Object.keys(chart.gene_keys).length > 0 && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">{t("conn.gene_keys")}</p>
          <div className="space-y-3">
            {Object.entries(chart.gene_keys).map(([slot, gk]) => (
              <div key={slot} className="border-b border-forest-border/30 last:border-0 pb-3 last:pb-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-body text-text-secondary text-[12px] tracking-[0.18em] uppercase">{gk.name}</span>
                  <span className="font-heading text-amber-sun" style={{ fontSize: 18, fontWeight: 300 }}>{t("conn.gate")} {gk.gate}</span>
                </div>
                {(gk.shadow || gk.gift) && (
                  <p className="font-body text-text-secondary text-[13px] leading-snug">
                    {gk.shadow && <>{t("conn.shadow")}: {gk.shadow}</>}
                    {gk.shadow && gk.gift && <>. </>}
                    {gk.gift && <>{t("conn.gift")}: {gk.gift}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-3">
      <span className="text-text-secondary">{label}</span>
      <span className="text-text-primary text-right">{value}</span>
    </div>
  );
}

function DepthRow({ label, value, meaning }: { label: string; value: string; meaning?: string }) {
  return (
    <div className="flex items-start gap-3 py-1">
      <span className="font-body text-text-secondary text-[12px] tracking-widest uppercase w-24 shrink-0 pt-0.5">{label}</span>
      <div className="flex-1">
        <span className="font-body text-text-primary text-[14px]">{value}</span>
        {meaning && <p className="font-body text-text-secondary/60 text-[12px] leading-snug mt-0.5">{meaning}</p>}
      </div>
    </div>
  );
}

function EmptyState({
  title, body, actionLabel, onAction,
}: { title: string; body: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="mt-8 px-6 py-10 rounded-2xl border border-forest-border/60 bg-forest-card/40 text-center">
      <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>{title}</p>
      <p className="font-body text-text-secondary text-[15px] leading-relaxed max-w-xs mx-auto mb-5">{body}</p>
      <button
        onClick={onAction}
        className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-amber-sun/70 text-amber-sun hover:bg-amber-sun/10 transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Compatibility section — the four-lens Oracle reading + structural signals.
//
// Cached per (self, soul) pair in sessionStorage so re-opening the profile
// during one session does not re-spend Haiku tokens. Subscription-gated:
// the backend returns 402 if the user is not a paying subscriber.

interface CompatReading {
  amplify?: string;
  misread?: string;
  safety?: string;
  lesson?: string;
}

interface CompatSignals {
  shared_gates?: number[];
  shared_gates_count?: number;
  shared_channels?: Array<[number, number]>;
  shared_gene_keys?: Array<{ gate: number; gift?: string; shadow?: string }>;
  hd_types?: { self?: string; soul?: string; compatibility_note?: string };
}

interface ResonanceAxis {
  score: number;
  weight: number;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  detail: any;
}

interface ResonanceIndex {
  overall: number;
  axes: {
    resonance: ResonanceAxis;
    energetic_loop: ResonanceAxis;
    type_pairing: ResonanceAxis;
    astrological: ResonanceAxis;
    gene_keys: ResonanceAxis;
  };
  weights: Record<string, number>;
  version: number;
}

// Lightweight non-cryptographic hash. Used only to scope a sessionStorage
// cache key per viewer so a shared device doesn't leak cached compatibility
// readings between users. Collision risk for two real users on the same
// browser hitting the same soul is negligible for this use.
function simpleHash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h) ^ s.charCodeAt(i);
  return (h >>> 0).toString(36);
}

function CompatibilitySection({ token, soulId, soulName }: { token: string | null; soulId: string; soulName: string }) {
  const { t } = useT();
  const [reading, setReading] = useState<CompatReading | null>(null);
  const [signals, setSignals] = useState<CompatSignals | null>(null);
  const [index,   setIndex]   = useState<ResonanceIndex | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [paywall, setPaywall] = useState(false);

  // Cache key includes the current viewer's token-derived id, not just the
  // soul id. Without this scoping, a shared device (two users signing in
  // sequentially in the same browser) would surface User A's cached
  // compatibility reading to User B because the cache key collided.
  // Codex audit P1.6. shortHash is non-cryptographic; collisions across
  // users on the same device are acceptable because a collision plus a
  // soul-id match plus session-storage being the same browser instance
  // is vanishingly unlikely for this product.
  const _viewerHash = token ? simpleHash(token) : "anon";
  const cacheKey = `solray_compat_${_viewerHash}_${soulId}`;

  const load = (force = false) => {
    if (!token || loading) return;
    if (!force) {
      try {
        const raw = sessionStorage.getItem(cacheKey);
        if (raw) {
          const parsed = JSON.parse(raw);
          setReading(parsed.reading || null);
          setSignals(parsed.signals || null);
          setIndex(parsed.index || null);
          return;
        }
      } catch (_) {}
    }
    setLoading(true);
    setError(null);
    apiFetch(`/souls/${soulId}/compatibility`, {}, token)
      .then((d) => {
        const parsed = d as { reading: CompatReading; signals: CompatSignals; index: ResonanceIndex };
        setReading(parsed.reading || null);
        setSignals(parsed.signals || null);
        setIndex(parsed.index || null);
        try { sessionStorage.setItem(cacheKey, JSON.stringify(parsed)); } catch (_) {}
      })
      .catch((e: unknown) => {
        if (e instanceof ApiError && e.status === 402) {
          setPaywall(true);
        } else if (e instanceof ApiError && e.status === 403) {
          // Not in an accepted connection; should never happen on this page
          // since the public-profile fetch above already 403'd.
          setError(t("compat.only_connections"));
        } else {
          setError(e instanceof Error ? e.message : t("compat.error_load"));
        }
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(false); /* try cache, then fetch */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [soulId, token]);

  return (
    <div className="mt-8">
      <p className="font-body text-[12px] tracking-[0.22em] uppercase mb-3" style={{ color: "rgb(var(--rgb-indigo) / 0.95)" }}>
        {t("compat.between_you")}
      </p>

      {paywall && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-5 text-center">
          <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>
            {t("compat.paywall_title")}
          </p>
          <p className="font-body text-text-secondary text-[14px] leading-relaxed mb-4 max-w-md mx-auto">
            {t("compat.paywall_body")}
          </p>
        </div>
      )}

      {error && !paywall && (
        <div className="rounded-xl border px-4 py-3 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
          {error}
        </div>
      )}

      {!paywall && !error && (loading && !reading) && (
        <div className="rounded-2xl bg-forest-card/30 border border-forest-border/30 h-48 skeleton-shimmer" />
      )}

      {!paywall && index && <IndexCard index={index} soulName={soulName} />}

      {!paywall && reading && (
        <div className="space-y-3 mt-3">
          <Lens label={t("compat.lens_amplify")}  body={reading.amplify} />
          <Lens label={t("compat.lens_misread")}  body={reading.misread} />
          <Lens label={t("compat.lens_safety")} body={reading.safety} />
          <Lens label={t("compat.lens_lesson")} body={reading.lesson} />
        </div>
      )}

      {!paywall && signals && (signals.shared_gates_count ?? 0) > 0 && (
        <div className="mt-4 rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-3">{t("compat.structural_signals")}</p>
          <div className="space-y-1.5 font-body text-[14px]">
            {signals.hd_types?.compatibility_note && (
              <Row label={t("compat.types")} value={signals.hd_types.compatibility_note} />
            )}
            {(signals.shared_gates_count ?? 0) > 0 && (
              <Row label={t("compat.shared_gates")} value={`${signals.shared_gates_count}: ${(signals.shared_gates || []).slice(0, 12).join(", ")}`} />
            )}
            {(signals.shared_channels?.length ?? 0) > 0 && (
              <Row
                label={t("compat.shared_channels")}
                value={(signals.shared_channels || []).map((c) => `${c[0]}-${c[1]}`).join(", ")}
              />
            )}
          </div>
        </div>
      )}

      {!paywall && reading && (
        <button
          onClick={() => { try { sessionStorage.removeItem(cacheKey); } catch (_) {} load(true); }}
          className="mt-3 font-body text-[11px] tracking-[0.22em] uppercase text-amber-sun/70 hover:text-amber-sun transition-colors"
          disabled={loading}
        >
          {loading ? t("compat.refreshing") : t("compat.re_read")}
        </button>
      )}
    </div>
  );
}

function Lens({ label, body }: { label: string; body?: string }) {
  if (!body) return null;
  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
      <p className="font-body text-[11px] tracking-[0.22em] uppercase mb-2" style={{ color: "rgb(var(--rgb-indigo) / 0.95)" }}>
        {label}
      </p>
      <p className="font-body text-text-primary leading-relaxed" style={{ fontSize: 15 }}>{body}</p>
    </div>
  );
}

const AXIS_LABEL_KEY: Record<string, string> = {
  resonance:      "compat.axis_resonance",
  energetic_loop: "compat.axis_energetic_loop",
  type_pairing:   "compat.axis_type_pairing",
  astrological:   "compat.axis_astrological",
  gene_keys:      "compat.axis_gene_keys",
};

const AXIS_HINT_KEY: Record<string, string> = {
  resonance:      "compat.hint_resonance",
  energetic_loop: "compat.hint_energetic_loop",
  type_pairing:   "compat.hint_type_pairing",
  astrological:   "compat.hint_astrological",
  gene_keys:      "compat.hint_gene_keys",
};

// Per-axis colors map to the extended-palette tokens, the same grammar as
// Today's energy bars. The headline (Resonance) takes the amber-sun, then
// the four sub-axes spread across ember / moss / mist / wisteria so each
// reads as its own frequency without the bars looking like a uniform set.
const AXIS_COLOR: Record<string, string> = {
  resonance:      "var(--amber)",
  energetic_loop: "var(--ember)",
  type_pairing:   "var(--moss)",
  astrological:   "var(--mist)",
  gene_keys:      "var(--wisteria)",
};

function IndexCard({ index, soulName }: { index: ResonanceIndex; soulName: string }) {
  const { t } = useT();
  // Defensive guards: a partial backend payload (missing axes object or
  // missing individual axis) was rendering throw -> white screen on
  // /profile/[id]. Codex flagged this as a P1 crash risk before App Store
  // submission. Now any missing axis falls back to a 0/0 placeholder so
  // the page still renders, just with a 'not yet calculated' bar.
  const overall = Math.round(Number(index?.overall) || 0);
  const safeAxes = (index && index.axes) || ({} as ResonanceIndex["axes"]);
  const fallback: ResonanceAxis = { score: 0, weight: 0, detail: null };
  const axes: Array<[string, ResonanceAxis]> = [
    ["resonance",      safeAxes.resonance      || fallback],
    ["energetic_loop", safeAxes.energetic_loop || fallback],
    ["type_pairing",   safeAxes.type_pairing   || fallback],
    ["astrological",   safeAxes.astrological   || fallback],
    ["gene_keys",      safeAxes.gene_keys      || fallback],
  ];

  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-5">
      {/* Header: same label-typography rhythm as Today's section labels */}
      <div className="flex items-center justify-between gap-4 mb-1">
        <div>
          <p className="font-body text-[12px] font-normal tracking-[0.22em] uppercase text-text-secondary">
            {t("compat.resonance_index")}
          </p>
          <p className="font-body text-text-secondary/70 text-[12px] mt-1">
            {t("compat.with_name").replace("{name}", soulName)}
          </p>
        </div>
        <div className="text-right">
          <span className="font-heading text-amber-sun" style={{ fontSize: 44, fontWeight: 300, lineHeight: 1 }}>
            {overall}
          </span>
          <span className="font-heading text-text-secondary/70 ml-1" style={{ fontSize: 16, fontWeight: 300 }}>
            / 100
          </span>
        </div>
      </div>

      <p className="font-body text-text-secondary/70 text-[12px] leading-relaxed mt-3 mb-5">
        {t("compat.overlap_note")}
      </p>

      {/* Axis bars use the same rhythm as Today's energy bars: label row
          fades in as a unit, then each line ink-draws from left with a
          per-row stagger. The fill is a left-to-transparent gradient so it
          fades out into the track, matching the Today aesthetic. */}
      <div className="space-y-4">
        {axes.map(([key, axis], idx) => (
          <AxisBar
            key={key}
            label={t(AXIS_LABEL_KEY[key])}
            hint={t(AXIS_HINT_KEY[key])}
            score={Math.round(axis.score)}
            weight={axis.weight}
            color={AXIS_COLOR[key] || "var(--amber)"}
            delayMs={idx * 90}
          />
        ))}
      </div>
    </div>
  );
}

function AxisBar({ label, hint, score, weight, color, delayMs }: {
  label: string;
  hint: string;
  score: number;
  weight: number;
  color: string;
  delayMs: number;
}) {
  const pct = Math.max(0, Math.min(100, score));
  // Same animation contract as Today's EnergyBar: label fades in first as a
  // unit, then the fill ink-draws from left with a per-row stagger.
  const labelFadeMs = 400;
  const drawMs      = 900;
  const drawDelay   = 300 + delayMs;

  return (
    <div title={hint}>
      <div
        className="flex items-baseline justify-between mb-2"
        style={{
          animation: `solrayLabelFade ${labelFadeMs}ms cubic-bezier(0.22, 0.8, 0.36, 1) both`,
        }}
      >
        <div className="flex items-baseline gap-2 min-w-0">
          <span className="font-body text-[12px] font-normal tracking-[0.22em] uppercase text-text-secondary truncate">
            {label}
          </span>
          <span className="font-body text-text-secondary/50 text-[10px] tracking-[0.22em] uppercase tabular-nums">
            {Math.round(weight * 100)}%
          </span>
        </div>
        <span
          className="font-heading text-[17px] text-text-secondary/70 tabular-nums"
          style={{ fontFeatureSettings: '"lnum"' }}
        >
          {pct}
        </span>
      </div>

      <div className="relative w-full h-1.5 bg-forest-border/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full"
          style={{
            ["--pct" as never]: `${pct}%`,
            width: `${pct}%`,
            background: `linear-gradient(to right, ${color}, transparent)`,
            animation: `solrayInkDraw ${drawMs}ms cubic-bezier(0.22, 0.8, 0.36, 1) ${drawDelay}ms both`,
          }}
        />
      </div>
    </div>
  );
}
