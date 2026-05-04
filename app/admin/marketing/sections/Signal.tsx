"use client";

/**
 * Signal Radar — the daily attention layer.
 *
 * A signal is a living conversation Solray could respond to. Bob types one in,
 * or it gets pulled from X / Reddit / astro events when those connections are
 * live. For each signal he can: generate 5 ranked Solray angles via Haiku,
 * pick the best, and ship it to the Calendar as a scheduled marketing_event.
 *
 * Codex's framing: Solray's bottleneck isn't producing content, it's knowing
 * which living conversation deserves Bob's voice today. This is the surface
 * that answers "what should I post about right now."
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Angle {
  platform: string;
  copy: string;
  why: string;
  image_prompt?: string;
  lint: Array<{ rule: string; message: string; snippet: string }>;
}

interface Signal {
  id: string;
  source: string;
  title: string;
  body: string | null;
  url: string | null;
  score: number;
  status: string;
  angles: Angle[] | null;
  happens_at: string | null;
  created_at: string;
  updated_at: string;
}

const SOURCE_LABEL: Record<string, string> = {
  manual: "Manual",
  astro_event: "Sky",
  x: "X",
  reddit: "Reddit",
  trends: "Trends",
  competitor: "Competitor",
};

export default function SignalSection({ token }: { token: string | null }) {
  const [signals, setSignals] = useState<Signal[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [pendingAngles, setPendingAngles] = useState<string | null>(null);
  const [seedingSky, setSeedingSky] = useState(false);
  const [seedReport, setSeedReport] = useState<string | null>(null);

  const seedFromSky = async () => {
    if (!token || seedingSky) return;
    setSeedingSky(true);
    setSeedReport(null);
    try {
      const res = await apiFetch("/admin/marketing/seed-from-sky?days=60", { method: "POST" }, token);
      const r = res as { sky_events_seen: number; signals_inserted: number; signals_skipped: number };
      setSeedReport(
        `Pulled ${r.sky_events_seen} sky events. Added ${r.signals_inserted} new signals; skipped ${r.signals_skipped} already on file.`
      );
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Sky seed failed");
    } finally {
      setSeedingSky(false);
    }
  };

  const load = () => {
    if (!token) return;
    setLoading(true);
    apiFetch("/admin/marketing/signals", {}, token)
      .then((d) => setSignals(((d as { signals: Signal[] }).signals || [])))
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  const generateAngles = async (signalId: string) => {
    if (!token || pendingAngles) return;
    setPendingAngles(signalId);
    try {
      await apiFetch(`/admin/marketing/signals/${signalId}/angles`, { method: "POST" }, token);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Angle generation failed");
    } finally {
      setPendingAngles(null);
    }
  };

  const updateStatus = async (signalId: string, status: string) => {
    if (!token) return;
    try {
      await apiFetch(`/admin/marketing/signals/${signalId}`, { method: "PATCH", body: JSON.stringify({ status }) }, token);
      load();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Update failed");
    }
  };

  const sendAngleToCalendar = async (signal: Signal, angle: Angle) => {
    if (!token) return;
    try {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      tomorrow.setHours(9, 0, 0, 0);
      await apiFetch("/admin/marketing/events", {
        method: "POST",
        body: JSON.stringify({
          title: signal.title,
          channel: angle.platform,
          scheduled_for: tomorrow.toISOString(),
          content_draft: angle.copy,
          asset_notes: `From signal: ${signal.title}\nWhy: ${angle.why}`,
          status: "scheduled",
        }),
      }, token);
      await updateStatus(signal.id, "acted");
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Send to calendar failed");
    }
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="max-w-2xl">
          <h2 className="font-heading text-text-primary mb-2" style={{ fontSize: 24, fontWeight: 300 }}>Signal Radar</h2>
          <p className="font-body text-text-secondary text-[13px] leading-relaxed">
            Living conversations Solray could speak to today. Higher score, higher relevance. Tap Generate Angles for AI-drafted Solray-shaped responses across platforms; tap an angle to send it to the calendar.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={seedFromSky}
            disabled={seedingSky}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-amber-sun/60 text-amber-sun hover:bg-amber-sun/10 disabled:opacity-50 transition-all"
          >
            {seedingSky ? "Pulling sky" : "Pull 60 days of sky"}
          </button>
          <button
            onClick={() => setCreating(true)}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full bg-amber-sun text-forest-deep hover:opacity-90 active:scale-[0.98] transition-all"
          >
            + Add signal
          </button>
        </div>
      </div>

      {seedReport && (
        <div className="rounded-xl border px-4 py-3 font-body text-[13px]" style={{ borderColor: "var(--moss)", color: "var(--moss)" }}>
          {seedReport}
        </div>
      )}

      {error && (
        <div className="rounded-xl border px-4 py-3 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-forest-card/30 border border-forest-border/30 h-24 skeleton-shimmer" />
          ))}
        </div>
      ) : signals.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          {signals.map((s) => (
            <SignalCard
              key={s.id}
              signal={s}
              onGenerate={() => generateAngles(s.id)}
              onDismiss={() => updateStatus(s.id, "dismissed")}
              onSendAngle={(angle) => sendAngleToCalendar(s, angle)}
              isGenerating={pendingAngles === s.id}
            />
          ))}
        </div>
      )}

      {creating && (
        <SignalForm
          token={token}
          onClose={() => setCreating(false)}
          onSaved={() => { setCreating(false); load(); }}
        />
      )}
    </div>
  );
}

function SignalCard({
  signal, onGenerate, onDismiss, onSendAngle, isGenerating,
}: {
  signal: Signal;
  onGenerate: () => void;
  onDismiss: () => void;
  onSendAngle: (a: Angle) => void;
  isGenerating: boolean;
}) {
  const [open, setOpen] = useState(false);
  const sourceLabel = SOURCE_LABEL[signal.source] || signal.source;

  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start justify-between gap-3">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-1">
              <span className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase">{sourceLabel}</span>
              <span className="font-mono text-amber-sun text-[12px]">{signal.score}</span>
              {signal.happens_at && (
                <span className="font-body text-text-secondary text-[10px] tracking-[0.18em] uppercase">
                  · {new Date(signal.happens_at).toLocaleDateString(undefined, { month: "short", day: "numeric" })}
                </span>
              )}
            </div>
            <p className="font-heading text-text-primary leading-snug" style={{ fontSize: 16, fontWeight: 400 }}>{signal.title}</p>
            {signal.body && <p className="font-body text-text-secondary text-[13px] leading-relaxed mt-1">{signal.body}</p>}
            {signal.url && (
              <a href={signal.url} target="_blank" rel="noopener noreferrer" className="font-body text-amber-sun text-[12px] hover:opacity-80 transition-opacity mt-1 inline-block break-all">
                {signal.url}
              </a>
            )}
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3 flex-wrap">
          {!signal.angles && (
            <button
              onClick={onGenerate}
              disabled={isGenerating}
              className="font-body text-[11px] tracking-[0.22em] uppercase px-3 py-1.5 rounded-full bg-amber-sun text-forest-deep disabled:opacity-50 hover:opacity-90 active:scale-[0.98] transition-all"
            >
              {isGenerating ? "Generating" : "Generate angles"}
            </button>
          )}
          {signal.angles && (
            <button
              onClick={() => setOpen(!open)}
              className="font-body text-[11px] tracking-[0.22em] uppercase px-3 py-1.5 rounded-full border border-amber-sun/60 text-amber-sun hover:bg-amber-sun/10 transition-all"
            >
              {open ? "Hide" : `Show ${signal.angles.length} angles`}
            </button>
          )}
          <button
            onClick={onDismiss}
            className="font-body text-[11px] tracking-[0.22em] uppercase px-3 py-1.5 rounded-full border border-forest-border text-text-secondary hover:text-text-primary transition-all"
          >
            Dismiss
          </button>
        </div>
      </div>

      {open && signal.angles && (
        <div className="border-t border-forest-border/40 bg-forest-deep/40 px-5 py-4 space-y-3">
          {signal.angles.map((a, i) => (
            <AngleCard key={i} angle={a} onSend={() => onSendAngle(a)} />
          ))}
        </div>
      )}
    </div>
  );
}

function AngleCard({ angle, onSend }: { angle: Angle; onSend: () => void }) {
  return (
    <div className="rounded-xl bg-forest-card/60 border border-forest-border/40 px-4 py-3">
      <div className="flex items-center justify-between gap-2 mb-2">
        <span className="font-body text-amber-sun text-[10px] tracking-[0.22em] uppercase">{angle.platform}</span>
        <button
          onClick={onSend}
          className="font-body text-[10px] tracking-[0.22em] uppercase px-2 py-1 rounded-full bg-amber-sun/15 text-amber-sun hover:bg-amber-sun/25 transition-all"
        >
          Send to calendar
        </button>
      </div>
      <p className="font-body text-text-primary text-[14px] leading-relaxed whitespace-pre-wrap mb-2">{angle.copy}</p>
      <p className="font-body text-text-secondary text-[11px] italic leading-relaxed">{angle.why}</p>
      {angle.image_prompt && (
        <div className="mt-2 pt-2 border-t border-forest-border/30">
          <p className="font-body text-text-secondary text-[10px] tracking-[0.22em] uppercase mb-1">Image prompt</p>
          <p className="font-body text-text-secondary text-[11px] leading-relaxed">{angle.image_prompt}</p>
        </div>
      )}
      {angle.lint.length > 0 && (
        <div className="mt-2 pt-2 border-t border-forest-border/30 space-y-1">
          {angle.lint.map((v, i) => (
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

function Empty() {
  return (
    <div className="rounded-2xl border border-forest-border/40 px-6 py-10 text-center">
      <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>
        Radar is quiet.
      </p>
      <p className="font-body text-text-secondary text-[13px] max-w-md mx-auto leading-relaxed">
        Add a signal manually to get started. Once X and Reddit are connected, signals will populate here automatically.
      </p>
    </div>
  );
}

function SignalForm({
  token, onClose, onSaved,
}: { token: string | null; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState("");
  const [body,  setBody]  = useState("");
  const [url,   setUrl]   = useState("");
  const [score, setScore] = useState(60);
  const [saving, setSaving] = useState(false);
  const [error,  setError]  = useState<string | null>(null);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      await apiFetch("/admin/marketing/signals", {
        method: "POST",
        body: JSON.stringify({
          title: title.trim(),
          body: body.trim() || null,
          url: url.trim() || null,
          score,
          source: "manual",
        }),
      }, token);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/80 backdrop-blur" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-lg bg-forest-deep border-t border-forest-border rounded-t-3xl p-6 max-h-[88dvh] overflow-y-auto">
        <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-1">New signal</p>
        <h3 className="font-heading text-text-primary mb-5" style={{ fontSize: 24, fontWeight: 300 }}>What is moving?</h3>

        <div className="space-y-4">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Mercury enters Gemini, retrograde concerns brewing"
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[15px] focus:border-amber-sun outline-none"
            />
          </Field>
          <Field label="Body / context">
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={4}
              placeholder="What's the conversation? Why does it matter? Optional."
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[14px] focus:border-amber-sun outline-none resize-none"
            />
          </Field>
          <Field label="URL">
            <input
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://..."
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[14px] focus:border-amber-sun outline-none"
            />
          </Field>
          <Field label={`Score: ${score}`}>
            <input
              type="range" min={0} max={100} step={5}
              value={score}
              onChange={(e) => setScore(parseInt(e.target.value, 10))}
              className="w-full accent-amber-sun"
            />
          </Field>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border px-4 py-2 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>{error}</div>
        )}

        <div className="flex gap-3 mt-6">
          <button onClick={save} disabled={saving || !title.trim()} className="flex-1 font-body text-[12px] tracking-[0.22em] uppercase px-4 py-3 rounded-full bg-amber-sun text-forest-deep disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all">
            {saving ? "Saving" : "Add to radar"}
          </button>
          <button onClick={onClose} className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-3 rounded-full border border-forest-border text-text-secondary hover:text-text-primary transition-all">
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="block font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-2">{label}</span>
      {children}
    </label>
  );
}
