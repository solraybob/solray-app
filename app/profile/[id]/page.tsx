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
              Soul
            </p>
            <div className="relative flex items-center" style={{ height: "26px" }}>
              <button
                onClick={() => router.back()}
                aria-label="Back"
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
                {profile?.name?.toUpperCase() || "PROFILE"}
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
              title="Not a soul connection"
              body="You can only view someone's profile after they accept your invite. Find them on Souls and send an invite."
              actionLabel="Open Souls"
              onAction={() => router.push("/souls")}
            />
          )}

          {!loading && error === "missing" && (
            <EmptyState
              title="Profile not found"
              body="This person may have deleted their account. Try Souls to find your active connections."
              actionLabel="Open Souls"
              onAction={() => router.push("/souls")}
            />
          )}

          {!loading && error === "network" && (
            <EmptyState
              title="Couldn't load this profile"
              body="Check your connection and try again."
              actionLabel="Retry"
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

              {profile.is_public ? (
                <PublicProfileBody profile={profile} />
              ) : (
                <PrivateProfileNotice name={profile.name} />
              )}
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}

// ─────────────────────────────────────────────────────────────────────────────

function PrivateProfileNotice({ name }: { name: string }) {
  return (
    <div className="mt-4 mb-6 px-6 py-8 rounded-2xl border border-forest-border/60 bg-forest-card/40 text-center">
      <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>
        Private profile
      </p>
      <p className="font-body text-text-secondary text-[15px] leading-relaxed max-w-xs mx-auto">
        {name} hasn&rsquo;t made their chart public. You stay connected on Souls, but their birth details are theirs to share.
      </p>
    </div>
  );
}

function PublicProfileBody({ profile }: { profile: PublicProfile }) {
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
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">Essence</p>
          <div className="space-y-1.5 font-body text-[15px]">
            {sunSign  && <Row label="Sun"  value={sunSign}  />}
            {moonSign && <Row label="Moon" value={moonSign} />}
            {ascSign  && <Row label="Ascendant" value={ascSign} />}
            {chart?.human_design.type && (
              <Row label="Human Design" value={`${chart.human_design.type}${chart.human_design.profile ? ` ${chart.human_design.profile}` : ""}`} />
            )}
            {chart?.human_design.authority && <Row label="Authority" value={chart.human_design.authority} />}
          </div>
        </div>
      )}

      {/* Birth details */}
      {(profile.birth_date || profile.birth_city) && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">Birth</p>
          <div className="space-y-1.5 font-body text-[15px]">
            {profile.birth_date && <Row label="Date" value={profile.birth_date} />}
            {profile.birth_time && <Row label="Time" value={profile.birth_time} />}
            {profile.birth_city && <Row label="Place" value={profile.birth_city} />}
          </div>
        </div>
      )}

      {/* Natal Chart */}
      {chart && chart.natal.length > 0 && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">Natal Chart</p>
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
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">Human Design</p>
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
                label="Type"
                value={chart.human_design.type}
                meaning={HD_TYPE_MEANINGS[chart.human_design.type]}
              />
            )}
            {chart.human_design.strategy && (
              <DepthRow label="Strategy" value={chart.human_design.strategy} />
            )}
            {chart.human_design.authority && (
              <DepthRow
                label="Authority"
                value={chart.human_design.authority}
                meaning={HD_AUTHORITY_MEANINGS[chart.human_design.authority]}
              />
            )}
            {chart.human_design.profile && (
              <DepthRow
                label="Profile"
                value={chart.human_design.profile}
                meaning={profileMeaning}
              />
            )}
            {chart.human_design.incarnation_cross && (
              <DepthRow label="Cross" value={chart.human_design.incarnation_cross} />
            )}
          </div>
        </div>
      )}

      {/* Gene Keys */}
      {chart && Object.keys(chart.gene_keys).length > 0 && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">Gene Keys</p>
          <div className="space-y-3">
            {Object.entries(chart.gene_keys).map(([slot, gk]) => (
              <div key={slot} className="border-b border-forest-border/30 last:border-0 pb-3 last:pb-0">
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <span className="font-body text-text-secondary text-[12px] tracking-[0.18em] uppercase">{gk.name}</span>
                  <span className="font-heading text-amber-sun" style={{ fontSize: 18, fontWeight: 300 }}>Gate {gk.gate}</span>
                </div>
                {(gk.shadow || gk.gift) && (
                  <p className="font-body text-text-secondary text-[13px] leading-snug">
                    {gk.shadow && <>Shadow: {gk.shadow}</>}
                    {gk.shadow && gk.gift && <>. </>}
                    {gk.gift && <>Gift: {gk.gift}</>}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Numerology */}
      {chart?.numerology && (chart.numerology.life_path || chart.numerology.expression) && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-3">Numerology</p>
          <div className="space-y-1.5 font-body text-[15px]">
            {chart.numerology.life_path > 0 && <Row label="Life Path" value={String(chart.numerology.life_path)} />}
            {chart.numerology.expression > 0 && <Row label="Expression" value={String(chart.numerology.expression)} />}
            {chart.numerology.soul_urge > 0 && <Row label="Soul Urge" value={String(chart.numerology.soul_urge)} />}
            {chart.numerology.personal_year > 0 && (
              <Row label={`Personal Year ${chart.numerology.current_year}`} value={String(chart.numerology.personal_year)} />
            )}
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
