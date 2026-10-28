"use client";

import { useEffect, useState } from "react";
import { useT } from "@/lib/i18n";
import { Orb } from "@/components/Wordmark";

// Rotating presence copy shown beneath the spinning sun while the Oracle
// is forming its reply. The first phrase appears immediately so the user
// always sees presence. Subsequent phrases fade in only if the wait runs
// long, so a fast reply never flashes through three pieces of copy.
// Lines are written in the Oracle's voice: quiet, present, never busy.
const THINKING_PHRASE_KEYS = [
  "chat.thinking_listening",
  "chat.thinking_reading",
  "chat.thinking_settle",
];

export function ThinkingIndicator() {
  const { t } = useT();
  const THINKING_PHRASES = THINKING_PHRASE_KEYS.map((k) => t(k));
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    // Step to the next phrase every 2.6 seconds, capped at the last one
    // so we don't loop through copy if the API is genuinely slow.
    const t1 = setTimeout(() => setIdx(1), 2600);
    const t2 = setTimeout(() => setIdx(2), 5400);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  return (
    <div className="flex flex-col items-start gap-3 animate-fade-in pl-2">
      {/* the orb, breathing, not the old logo spinning like a coin */}
      <Orb size={40} style={{ animation: "orbBreathe 11s ease-in-out infinite" }} />
      <p
        key={idx}
        className="animate-fade-in"
        style={{
          fontFamily: "var(--font-heading, 'Zen Kaku Gothic New', system-ui, sans-serif)",
          
          fontWeight: 700,
          fontSize: "1rem",
          color: "rgb(var(--rgb-text-secondary))",
          opacity: 0.82,
          letterSpacing: "0.01em",
          marginLeft: 4,
        }}
      >
        {THINKING_PHRASES[idx]}
      </p>
    </div>
  );
}
