"use client";

// components/InviteCodeCard.tsx
//
// Surfaces the current user's permanent invite code on the Souls page,
// next to the connection list. The mental model: Souls is where the user
// already thinks about people they want to bring into their world; the
// invite link belongs in the same room.
//
// On open we hit GET /users/me/invite. The backend lazily backfills any
// missing code on first call so legacy users get one without us having to
// ask first.

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/lib/auth-context";

interface InvitePayload {
  code: string;
  link: string;
  app_link: string;
  inviter_bonus_days: number;
  // True only while the viewer is still on a free trial. Subscribers invite
  // without a material reward, so the card shows different copy.
  bonus_eligible?: boolean;
}

export default function InviteCodeCard() {
  const [data, setData] = useState<InvitePayload | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);
  const { token } = useAuth();

  useEffect(() => {
    // apiFetch attaches auth only when a token is passed and already returns
    // PARSED json (not a Response). The old code passed no token (so the call
    // 401'd) and then called res.json() on already-parsed data (which threw),
    // both surfacing as "Could not load your invite code." Pass the token and
    // use the returned object directly.
    if (!token) return;
    let cancelled = false;
    apiFetch("/users/me/invite", undefined, token)
      .then((json: InvitePayload) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your invite code.");
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  const copy = async (text: string, which: "link" | "code") => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(which);
      window.setTimeout(() => setCopied(null), 1800);
    } catch {
      // Fallback for environments where the Clipboard API is blocked.
      setError("Could not copy. Long-press the text and copy by hand.");
    }
  };

  const share = async () => {
    if (!data) return;
    const shareData = {
      title: "Solray",
      text: "Solray reads your chart against today's sky and remembers you. Use my code for five days free.",
      url: data.link,
    };
    try {
      if (typeof navigator !== "undefined" && (navigator as any).share) {
        await (navigator as any).share(shareData);
      } else {
        await copy(data.link, "link");
      }
    } catch {
      // User cancelled the share sheet, no-op.
    }
  };

  if (error && !data) {
    return (
      <div className="rounded-3xl p-5 border border-forest-border/40 text-text-secondary text-sm">
        {error}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-3xl p-5 border border-forest-border/40 text-text-secondary text-sm">
        Loading your invite code...
      </div>
    );
  }

  return (
    <div className="rounded-3xl border border-forest-border bg-forest-card overflow-hidden">
      {/* Foldable header: shows the value prop even when collapsed. */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center justify-between gap-3 px-5 py-4 text-left"
        aria-expanded={open}
      >
        <span className="min-w-0">
          <span className="block font-body text-[12px] tracking-[0.22em] uppercase text-indigo/70 mb-0.5">
            Bring someone in
          </span>
          <span className="block font-body text-[13px] text-text-secondary leading-snug">
            {data.bonus_eligible
              ? `Each friend who joins gives you ${data.inviter_bonus_days} extra trial days.`
              : "Share Solray with someone whose chart you'd want read."}
          </span>
        </span>
        <svg
          width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
          className="shrink-0 text-text-secondary transition-transform"
          style={{ transform: open ? "rotate(180deg)" : "none" }}
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="px-5 pb-5 pt-1 animate-fade-in">
          <p className="font-body text-[14px] text-text-secondary leading-relaxed mb-4">
            {data.bonus_eligible
              ? `Share your code. When a friend starts their five days free and stays, your own trial extends by ${data.inviter_bonus_days} days. They get the map. You get more time on yours.`
              : "You already live here. Pass your code to someone whose chart you'd want the Oracle to read. No reward, just the pleasure of bringing them in."}
          </p>

          <button
            type="button"
            onClick={() => copy(data.code, "code")}
            className="w-full flex items-center justify-between px-4 py-3 rounded-2xl border border-indigo/30 hover:border-indigo/60 transition-colors mb-3"
            aria-label={`Copy invite code ${data.code}`}
          >
            <span className="font-heading text-2xl tracking-[0.18em] text-indigo" style={{ fontWeight: 300 }}>
              {data.code}
            </span>
            <span className="font-body text-[11px] tracking-[0.22em] uppercase text-text-secondary">
              {copied === "code" ? "Copied" : "Copy code"}
            </span>
          </button>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => copy(data.link, "link")}
              className="flex-1 px-4 py-2.5 rounded-full border border-forest-border/60 font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary hover:text-text-primary hover:border-forest-border transition-colors"
            >
              {copied === "link" ? "Link copied" : "Copy link"}
            </button>
            <button
              type="button"
              onClick={share}
              className="flex-1 px-4 py-2.5 rounded-full border border-indigo/40 bg-indigo/10 font-body text-[12px] tracking-[0.18em] uppercase text-indigo hover:bg-indigo/20 transition-colors"
            >
              Share
            </button>
          </div>

          <p className="mt-4 font-body text-[11px] text-text-muted leading-relaxed break-all">
            {data.link}
          </p>
        </div>
      )}
    </div>
  );
}
