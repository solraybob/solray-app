"use client";

/**
 * /profile/[id] — view a soul connection's profile.
 *
 * Two states the backend can return:
 *
 *   1. is_public=true  → name, photo, birth city/date, full blueprint.
 *      We render a slim, read-only version of the owner's profile
 *      (header, identity card, sun sign, HD type, gene keys summary,
 *      birth details). No edit affordances.
 *
 *   2. is_public=false → name, photo, "private" indicator.
 *      We respect the choice. Their privacy is the feature, not a
 *      friction point we try to work around.
 *
 * 403 from the endpoint = not a connection. We surface a soft message
 * pointing back to /souls so the user can send an invite.
 */

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import ProtectedRoute from "@/components/ProtectedRoute";
import { useAuth } from "@/lib/auth-context";
import { apiFetch, ApiError } from "@/lib/api";

interface PublicProfile {
  id: string;
  username?: string | null;
  name: string;
  profile_photo?: string | null;
  is_public: boolean;
  // Only present when is_public=true:
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
            <p className="font-body text-[10px] tracking-[0.18em] uppercase mb-1" style={{ color: "rgb(var(--rgb-indigo))" }}>
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
                    <p className="font-body text-text-secondary text-[12px] mt-1">@{profile.username}</p>
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
      <p className="font-body text-text-secondary text-[13px] leading-relaxed max-w-xs mx-auto">
        {name} hasn&rsquo;t made their chart public. You stay connected on Souls, but their birth details are theirs to share.
      </p>
    </div>
  );
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function PublicProfileBody({ profile }: { profile: PublicProfile }) {
  const bp = profile.blueprint || {};
  const summary  = bp.summary || {};
  const planets  = bp.astrology?.natal?.planets || {};
  const hd       = bp.human_design || {};
  const sunSign  = summary.sun_sign  || planets.Sun?.sign || null;
  const moonSign = summary.moon_sign || planets.Moon?.sign || null;
  const ascSign  = summary.asc_sign  || planets.ASC?.sign || null;
  const hdType   = summary.hd_type   || hd.type || null;
  const hdProf   = summary.hd_profile|| hd.profile || null;
  const hdAuth   = summary.hd_authority || hd.authority || null;

  return (
    <div className="space-y-3">

      {/* Three-line essence line */}
      {(sunSign || hdType) && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-3">Essence</p>
          <div className="space-y-1.5 font-body text-[13px]">
            {sunSign  && <Row label="Sun"  value={sunSign}  />}
            {moonSign && <Row label="Moon" value={moonSign} />}
            {ascSign  && <Row label="Ascendant" value={ascSign} />}
            {hdType   && <Row label="Human Design" value={`${hdType}${hdProf ? ` ${hdProf}` : ""}`} />}
            {hdAuth   && <Row label="Authority" value={hdAuth} />}
          </div>
        </div>
      )}

      {/* Birth details — only when truly public */}
      {(profile.birth_date || profile.birth_city) && (
        <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
          <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-3">Birth</p>
          <div className="space-y-1.5 font-body text-[13px]">
            {profile.birth_date && <Row label="Date" value={profile.birth_date} />}
            {profile.birth_time && <Row label="Time" value={profile.birth_time} />}
            {profile.birth_city && <Row label="Place" value={profile.birth_city} />}
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

function EmptyState({
  title, body, actionLabel, onAction,
}: { title: string; body: string; actionLabel: string; onAction: () => void }) {
  return (
    <div className="mt-8 px-6 py-10 rounded-2xl border border-forest-border/60 bg-forest-card/40 text-center">
      <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>{title}</p>
      <p className="font-body text-text-secondary text-[13px] leading-relaxed max-w-xs mx-auto mb-5">{body}</p>
      <button
        onClick={onAction}
        className="font-body text-[10px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-amber-sun/70 text-amber-sun hover:bg-amber-sun/10 transition-colors"
      >
        {actionLabel}
      </button>
    </div>
  );
}
