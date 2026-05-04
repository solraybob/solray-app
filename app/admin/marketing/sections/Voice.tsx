"use client";

/**
 * Founder Voice Studio.
 *
 * Bob types a raw observation. Claude turns it into one polished draft per
 * requested platform, in Solray's voice. Each draft passes through the
 * brand-rule linter; violations show inline so Bob can edit before posting.
 * Each draft has a one-tap Send to Calendar.
 */

import { useState } from "react";
import { apiFetch } from "@/lib/api";

interface Variant {
  platform: string;
  copy: string;
  why: string;
  image_prompt?: string;
  lint: Array<{ rule: string; message: string; snippet: string }>;
}

const ALL_CHANNELS = ["x", "instagram", "tiktok", "linkedin", "blog"];

export default function VoiceSection({ token }: { token: string | null }) {
  const [rawNote, setRawNote] = useState("");
  const [channels, setChannels] = useState<string[]>(["x", "instagram", "linkedin"]);
  const [variants, setVariants] = useState<Variant[]>([]);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lintCheck, setLintCheck] = useState<Array<{ rule: string; message: string; snippet: string }> | null>(null);

  const toggleChannel = (c: string) => {
    setChannels((prev) => (prev.includes(c) ? prev.filter((p) => p !== c) : [...prev, c]));
  };

  const lintRaw = async () => {
    if (!token || !rawNote.trim()) return;
    try {
      const res = await apiFetch("/admin/marketing/lint", { method: "POST", body: JSON.stringify({ text: rawNote }) }, token);
      setLintCheck((res as { violations: typeof lintCheck }).violations || []);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Lint failed");
    }
  };

  const generate = async () => {
    if (!token || !rawNote.trim() || channels.length === 0 || running) return;
    setRunning(true);
    setError(null);
    try {
      const res = await apiFetch("/admin/marketing/voice", {
        method: "POST",
        body: JSON.stringify({ raw_note: rawNote, channels }),
      }, token);
      setVariants(((res as { variants: Variant[] }).variants || []));
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Generation failed");
    } finally {
      setRunning(false);
    }
  };

  const sendToCalendar = async (variant: Variant) => {
    if (!token) return;
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      await apiFetch("/admin/marketing/events", {
        method: "POST",
        body: JSON.stringify({
          title: rawNote.slice(0, 80) + (rawNote.length > 80 ? "..." : ""),
          channel: variant.platform,
          scheduled_for: tomorrow.toISOString(),
          content_draft: variant.copy,
          asset_notes: `From Voice Studio.\nWhy: ${variant.why}`,
          status: "scheduled",
        }),
      }, token);
      // Soft visual confirmation: tag the variant to show it shipped.
      setVariants((prev) =>
        prev.map((v) => (v === variant ? { ...v, why: "Sent to calendar. " + v.why } : v))
      );
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Calendar send failed");
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="max-w-2xl">
        <h2 className="font-heading text-text-primary mb-2" style={{ fontSize: 24, fontWeight: 300 }}>Founder Voice Studio</h2>
        <p className="font-body text-text-secondary text-[13px] leading-relaxed">
          Type a raw observation, get one polished draft per platform in Solray's voice. Each draft passes through the brand-rule linter; violations surface inline. Tap Send to Calendar to queue any draft as a scheduled event.
        </p>
      </div>

      <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
        <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-3">Raw note</p>
        <textarea
          value={rawNote}
          onChange={(e) => { setRawNote(e.target.value); setLintCheck(null); }}
          rows={5}
          placeholder="Anything. The way Mercury moves through Gemini reads like a writer pacing the room. People mistake speed for clarity. Add what you noticed; don't worry about the form."
          className="w-full bg-forest-deep/40 border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[14px] focus:border-amber-sun outline-none resize-none"
        />

        {lintCheck && lintCheck.length > 0 && (
          <div className="mt-3 space-y-1">
            {lintCheck.map((v, i) => (
              <div key={i} className="font-body text-[12px]" style={{ color: "var(--ember)" }}>
                <span className="font-mono text-[11px] mr-1">[{v.rule}]</span>
                {v.message}
              </div>
            ))}
          </div>
        )}
        {lintCheck && lintCheck.length === 0 && (
          <p className="mt-3 font-body text-[12px]" style={{ color: "var(--moss)" }}>
            Brand-rule clean.
          </p>
        )}

        <div className="mt-4">
          <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-2">Platforms</p>
          <div className="flex flex-wrap gap-2">
            {ALL_CHANNELS.map((c) => {
              const active = channels.includes(c);
              return (
                <button
                  key={c}
                  onClick={() => toggleChannel(c)}
                  className={`font-body text-[11px] tracking-[0.22em] uppercase px-3 py-1.5 rounded-full transition-all ${
                    active
                      ? "bg-amber-sun text-forest-deep"
                      : "border border-forest-border text-text-secondary hover:text-text-primary"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center gap-3 mt-5 flex-wrap">
          <button
            onClick={generate}
            disabled={!rawNote.trim() || channels.length === 0 || running}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2.5 rounded-full bg-amber-sun text-forest-deep disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {running ? "Drafting" : `Generate ${channels.length} draft${channels.length === 1 ? "" : "s"}`}
          </button>
          <button
            onClick={lintRaw}
            disabled={!rawNote.trim()}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2.5 rounded-full border border-forest-border text-text-secondary hover:text-text-primary disabled:opacity-40 transition-all"
          >
            Lint raw
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>{error}</div>
      )}

      {variants.length > 0 && (
        <div className="space-y-3">
          <h3 className="font-heading text-text-primary" style={{ fontSize: 18, fontWeight: 300 }}>Drafts</h3>
          {variants.map((v, i) => (
            <VariantCard key={i} variant={v} onSend={() => sendToCalendar(v)} />
          ))}
        </div>
      )}
    </div>
  );
}

function VariantCard({ variant, onSend }: { variant: Variant; onSend: () => void }) {
  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4">
      <div className="flex items-center justify-between gap-2 mb-3">
        <span className="font-body text-amber-sun text-[11px] tracking-[0.22em] uppercase">{variant.platform}</span>
        <button
          onClick={onSend}
          className="font-body text-[10px] tracking-[0.22em] uppercase px-3 py-1 rounded-full bg-amber-sun/15 text-amber-sun hover:bg-amber-sun/25 transition-all"
        >
          Send to calendar
        </button>
      </div>
      <p className="font-body text-text-primary text-[14px] leading-relaxed whitespace-pre-wrap mb-3">{variant.copy}</p>
      <p className="font-body text-text-secondary text-[12px] italic leading-relaxed">{variant.why}</p>
      {variant.image_prompt && (
        <div className="mt-3 pt-3 border-t border-forest-border/30">
          <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-1">Image prompt</p>
          <p className="font-body text-text-secondary text-[11px] leading-relaxed">{variant.image_prompt}</p>
        </div>
      )}
      {variant.lint.length > 0 && (
        <div className="mt-3 pt-3 border-t border-forest-border/30 space-y-1">
          {variant.lint.map((v, i) => (
            <div key={i} className="font-body text-[11px]" style={{ color: "var(--ember)" }}>
              <span className="font-mono text-[10px] mr-1">[{v.rule}]</span>
              {v.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
