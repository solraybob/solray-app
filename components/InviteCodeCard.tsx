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

interface InvitePayload {
  code: string;
  link: string;
  app_link: string;
  inviter_bonus_days: number;
}

export default function InviteCodeCard() {
  const [data, setData] = useState<InvitePayload | null>(null);
  const [copied, setCopied] = useState<"link" | "code" | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    apiFetch("/users/me/invite")
      .then((res) => res.json())
      .then((json: InvitePayload) => {
        if (!cancelled) setData(json);
      })
      .catch(() => {
        if (!cancelled) setError("Could not load your invite code.");
      });
    return () => {
      cancelled = true;
    };
  }, []);

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
    <div
      className="rounded-3xl p-6 relative overflow-hidden"
      style={{
        background:
          "linear-gradient(155deg, rgb(var(--rgb-amber-sun) / 0.08) 0%, rgb(var(--rgb-card) / 0.95) 60%, rgb(var(--rgb-card)) 100%)",
        border: "1px solid rgba(243,146,48,0.20)",
        boxShadow: "0 18px 60px -30px rgba(243,146,48,0.35)",
      }}
    >
      <p className="font-body text-[12px] tracking-[0.22em] uppercase text-amber-sun/80 mb-1">
        Bring someone in
      </p>
      <h3
        className="font-heading text-xl text-text-primary leading-tight mb-3"
        style={{ fontWeight: 300, fontStyle: "italic", letterSpacing: "-0.01em" }}
      >
        Each friend who joins gives you {data.inviter_bonus_days} extra trial days.
      </h3>
      <p className="font-body text-[14px] text-text-secondary leading-relaxed mb-5">
        Share your code. When they start their five days free and pick up a subscription, your next billing window pushes out by {data.inviter_bonus_days} days. They get the map. You get the time.
      </p>

      <div className="flex items-center gap-2 mb-4">
        <button
          type="button"
          onClick={() => copy(data.code, "code")}
          className="flex-1 flex items-center justify-between px-4 py-3 rounded-2xl border border-amber-sun/30 hover:border-amber-sun/60 transition-colors"
          aria-label={`Copy invite code ${data.code}`}
        >
          <span className="font-heading text-2xl tracking-[0.18em] text-amber-sun" style={{ fontWeight: 300 }}>
            {data.code}
          </span>
          <span className="font-body text-[11px] tracking-[0.22em] uppercase text-text-secondary">
            {copied === "code" ? "Copied" : "Copy code"}
          </span>
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={() => copy(data.link, "link")}
          className="flex-1 px-4 py-2.5 rounded-full border border-forest-border/50 font-body text-[12px] tracking-[0.18em] uppercase text-text-secondary hover:text-text-primary hover:border-forest-border/80 transition-colors"
        >
          {copied === "link" ? "Link copied" : "Copy link"}
        </button>
        <button
          type="button"
          onClick={share}
          className="flex-1 px-4 py-2.5 rounded-full bg-amber-sun/15 border border-amber-sun/40 font-body text-[12px] tracking-[0.18em] uppercase text-amber-sun hover:bg-amber-sun/25 transition-colors"
        >
          Share
        </button>
      </div>

      <p className="mt-4 font-body text-[11px] text-text-muted leading-relaxed break-all">
        {data.link}
      </p>
    </div>
  );
}
