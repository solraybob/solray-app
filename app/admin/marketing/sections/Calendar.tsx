"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Event {
  id: string;
  title: string;
  channel: string;
  scheduled_for: string; // ISO
  content_draft: string | null;
  asset_notes: string | null;
  status: string;
  created_at?: string;
  updated_at?: string;
}

interface AstroEvent {
  kind: string;
  label: string;
  happens_at: string;
  body?: string;
}

const CHANNELS = ["x", "instagram", "tiktok", "linkedin", "meta_ads", "email", "blog", "launch"];
const STATUSES: Array<{ id: string; label: string; color: string }> = [
  { id: "idea",      label: "Idea",      color: "var(--mist)" },
  { id: "scheduled", label: "Scheduled", color: "var(--amber)" },
  { id: "published", label: "Published", color: "var(--moss)" },
  { id: "archived",  label: "Archived",  color: "var(--text-secondary)" },
];

export default function CalendarSection({ token }: { token: string | null }) {
  const [events, setEvents]   = useState<Event[]>([]);
  const [astro,  setAstro]    = useState<AstroEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError]     = useState<string | null>(null);
  const [editing, setEditing] = useState<Event | null>(null);
  const [creating, setCreating] = useState(false);

  const load = () => {
    if (!token) return;
    setLoading(true);
    Promise.all([
      apiFetch("/admin/marketing/events", {}, token),
      apiFetch("/admin/marketing/astro-events?days=60", {}, token).catch(() => ({ events: [] })),
    ])
      .then(([eventsRes, astroRes]) => {
        setEvents((eventsRes as { events: Event[] }).events || []);
        setAstro((astroRes as { events: AstroEvent[] }).events || []);
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load events"))
      .finally(() => setLoading(false));
  };

  useEffect(load, [token]);

  return (
    <div className="space-y-6 page-enter">

      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="font-body text-text-secondary text-[13px] leading-relaxed max-w-2xl">
            One row per piece of marketing work. Idea, then scheduled, then published. The calendar is the planning layer; once a connection is live the same row triggers the actual post.
          </p>
        </div>
        <button
          onClick={() => setCreating(true)}
          className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full bg-amber-sun text-forest-deep hover:opacity-90 active:scale-[0.98] transition-all"
        >
          + New event
        </button>
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-forest-card/30 border border-forest-border/30 h-20 skeleton-shimmer" />
          ))}
        </div>
      ) : events.length === 0 && astro.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-4">
          {astro.length > 0 && (
            <div>
              <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-2">Sky next 60 days</p>
              <div className="space-y-2">
                {astro.map((a, i) => (
                  <AstroRow key={i} event={a} />
                ))}
              </div>
            </div>
          )}
          {events.length > 0 && (
            <div>
              <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-2">Your queue</p>
              <div className="space-y-2">
                {events.map((e) => (
                  <EventRow key={e.id} event={e} onClick={() => setEditing(e)} />
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {(creating || editing) && (
        <EventForm
          token={token}
          event={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={() => { setCreating(false); setEditing(null); load(); }}
        />
      )}
    </div>
  );
}

function EventRow({ event, onClick }: { event: Event; onClick: () => void }) {
  const status = STATUSES.find((s) => s.id === event.status) || STATUSES[0];
  const date = new Date(event.scheduled_for);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  return (
    <button
      onClick={onClick}
      className="w-full text-left rounded-2xl bg-forest-card/40 border border-forest-border/50 px-5 py-4 hover:border-amber-sun/50 transition-colors flex items-center gap-4"
    >
      <div className="text-center shrink-0" style={{ minWidth: 60 }}>
        <p className="font-heading text-text-primary leading-none" style={{ fontSize: 18, fontWeight: 300 }}>{dateStr}</p>
        <p className="font-body text-text-secondary text-[11px] tracking-[0.18em] uppercase mt-1">{timeStr}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-heading text-text-primary truncate" style={{ fontSize: 16, fontWeight: 400 }}>{event.title}</p>
        <div className="flex items-center gap-2 mt-1">
          <span className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase">{event.channel}</span>
          <span className="font-body text-[11px] tracking-[0.22em] uppercase" style={{ color: status.color }}>· {status.label}</span>
        </div>
      </div>
    </button>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-forest-border/40 px-6 py-10 text-center">
      <p className="font-heading text-text-primary mb-2" style={{ fontSize: 18, fontWeight: 300 }}>
        Calendar is empty.
      </p>
      <p className="font-body text-text-secondary text-[13px] max-w-md mx-auto leading-relaxed">
        Add your first event. A new post idea, a planned ad, a launch date. Calendar entries become the queue once channels are connected.
      </p>
    </div>
  );
}

function AstroRow({ event }: { event: AstroEvent }) {
  const date = new Date(event.happens_at);
  const dateStr = date.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  const timeStr = date.toLocaleTimeString(undefined, { hour: "2-digit", minute: "2-digit" });

  // Color hint by kind: retrograde = ember, ingress = mist, lunar = wisteria.
  const kindColor: Record<string, string> = {
    station_retrograde: "var(--ember)",
    station_direct:     "var(--moss)",
    ingress:            "var(--mist)",
    lunar_phase:        "var(--wisteria)",
  };
  const color = kindColor[event.kind] || "var(--text-secondary)";

  return (
    <div className="rounded-xl bg-forest-card/20 border border-forest-border/30 px-4 py-3 flex items-center gap-4">
      <div className="text-center shrink-0" style={{ minWidth: 50 }}>
        <p className="font-heading text-text-primary leading-none" style={{ fontSize: 16, fontWeight: 300 }}>{dateStr}</p>
        <p className="font-body text-text-secondary text-[10px] tracking-[0.18em] uppercase mt-0.5">{timeStr}</p>
      </div>
      <div className="flex-1 min-w-0">
        <p className="font-body text-text-primary text-[14px] leading-snug">{event.label}</p>
        <p className="font-body text-[10px] tracking-[0.22em] uppercase mt-0.5" style={{ color }}>
          {event.kind.replace("_", " ")}
        </p>
      </div>
    </div>
  );
}

function EventForm({
  token, event, onClose, onSaved,
}: { token: string | null; event: Event | null; onClose: () => void; onSaved: () => void }) {
  const [title,         setTitle]         = useState(event?.title || "");
  const [channel,       setChannel]       = useState(event?.channel || CHANNELS[0]);
  const [scheduledFor,  setScheduledFor]  = useState(event?.scheduled_for ? toLocalInput(event.scheduled_for) : defaultLocal());
  const [contentDraft,  setContentDraft]  = useState(event?.content_draft || "");
  const [assetNotes,    setAssetNotes]    = useState(event?.asset_notes || "");
  const [status,        setStatus]        = useState(event?.status || "idea");
  const [saving,        setSaving]        = useState(false);
  const [error,         setError]         = useState<string | null>(null);

  const save = async () => {
    if (!token) return;
    setSaving(true);
    setError(null);
    try {
      const body = {
        title: title.trim(),
        channel,
        scheduled_for: new Date(scheduledFor).toISOString(),
        content_draft: contentDraft.trim() || null,
        asset_notes: assetNotes.trim() || null,
        status,
      };
      if (event) {
        await apiFetch(`/admin/marketing/events/${event.id}`, { method: "PATCH", body: JSON.stringify(body) }, token);
      } else {
        await apiFetch("/admin/marketing/events", { method: "POST", body: JSON.stringify(body) }, token);
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Save failed");
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!token || !event) return;
    if (!confirm(`Delete "${event.title}"?`)) return;
    setSaving(true);
    try {
      await apiFetch(`/admin/marketing/events/${event.id}`, { method: "DELETE" }, token);
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Delete failed");
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-forest-deep/80 backdrop-blur" onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-lg bg-forest-deep border-t border-forest-border rounded-t-3xl p-6 max-h-[88dvh] overflow-y-auto"
      >
        <p className="font-body text-text-secondary text-[12px] tracking-[0.22em] uppercase mb-1">
          {event ? "Edit event" : "New event"}
        </p>
        <h3 className="font-heading text-text-primary mb-5" style={{ fontSize: 24, fontWeight: 300 }}>
          {event ? event.title : "Plan a piece"}
        </h3>

        <div className="space-y-4">
          <Field label="Title">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Short Mercury retrograde post"
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[15px] focus:border-amber-sun outline-none"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Channel">
              <select
                value={channel}
                onChange={(e) => setChannel(e.target.value)}
                className="w-full bg-forest-card border border-forest-border rounded-lg px-3 py-3 text-text-primary font-body text-[14px] focus:border-amber-sun outline-none"
              >
                {CHANNELS.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </Field>
            <Field label="Status">
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full bg-forest-card border border-forest-border rounded-lg px-3 py-3 text-text-primary font-body text-[14px] focus:border-amber-sun outline-none"
              >
                {STATUSES.map((s) => <option key={s.id} value={s.id}>{s.label}</option>)}
              </select>
            </Field>
          </div>

          <Field label="Scheduled for">
            <input
              type="datetime-local"
              value={scheduledFor}
              onChange={(e) => setScheduledFor(e.target.value)}
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary font-body text-[14px] focus:border-amber-sun outline-none"
            />
          </Field>

          <Field label="Content draft">
            <textarea
              value={contentDraft}
              onChange={(e) => setContentDraft(e.target.value)}
              placeholder="The post copy, ad headline, email body. Whatever the live version will say."
              rows={5}
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[14px] focus:border-amber-sun outline-none resize-none"
            />
          </Field>

          <Field label="Asset notes">
            <textarea
              value={assetNotes}
              onChange={(e) => setAssetNotes(e.target.value)}
              placeholder="Image links, video brief, references."
              rows={2}
              className="w-full bg-forest-card border border-forest-border rounded-lg px-4 py-3 text-text-primary placeholder-text-secondary font-body text-[14px] focus:border-amber-sun outline-none resize-none"
            />
          </Field>
        </div>

        {error && (
          <div className="mt-4 rounded-lg border px-4 py-2 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
            {error}
          </div>
        )}

        <div className="flex items-center gap-3 mt-6">
          <button
            onClick={save}
            disabled={saving || !title.trim()}
            className="flex-1 font-body text-[12px] tracking-[0.22em] uppercase px-4 py-3 rounded-full bg-amber-sun text-forest-deep disabled:opacity-40 hover:opacity-90 active:scale-[0.98] transition-all"
          >
            {saving ? "Saving" : event ? "Save changes" : "Create event"}
          </button>
          {event && (
            <button
              onClick={remove}
              disabled={saving}
              className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-3 rounded-full border hover:bg-forest-card/40 transition-all"
              style={{ borderColor: "var(--ember)", color: "var(--ember)" }}
            >
              Delete
            </button>
          )}
          <button
            onClick={onClose}
            className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-3 rounded-full border border-forest-border text-text-secondary hover:text-text-primary transition-all"
          >
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

function defaultLocal(): string {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() + 1);
  return toLocalInput(d.toISOString());
}

function toLocalInput(iso: string): string {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
