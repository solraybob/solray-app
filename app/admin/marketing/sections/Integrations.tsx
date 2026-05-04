"use client";

/**
 * Integrations section. One component, three filtered views (social, ads,
 * analytics). Each integration is a card with: name, description, status,
 * prerequisite checklist, and a Connect action that's stubbed for now.
 *
 * The cathedral is the UI. The status string ('not_connected' | 'connected'
 * | 'error' | 'expired') comes from the backend. As Bob gathers API access
 * for each integration, the status flips to 'connected' and the card grows
 * a live data view, no UI rewrites needed.
 */

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";

interface Integration {
  kind: string;
  name: string;
  category: "social" | "ads" | "analytics";
  description: string;
  prerequisites: string[];
  status: "not_connected" | "connected" | "error" | "expired";
  last_synced: string | null;
  last_error: string | null;
}

interface Props {
  token: string | null;
  category: "social" | "ads" | "analytics";
  title: string;
  subtitle: string;
}

export default function IntegrationsSection({ token, category, title, subtitle }: Props) {
  const [integrations, setIntegrations] = useState<Integration[]>([]);
  const [loading, setLoading]           = useState(true);
  const [error, setError]               = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;
    setLoading(true);
    apiFetch("/admin/integrations", {}, token)
      .then((d) => {
        const all = (d as { integrations: Integration[] }).integrations || [];
        setIntegrations(all.filter((i) => i.category === category));
      })
      .catch((e: unknown) => setError(e instanceof Error ? e.message : "Could not load"))
      .finally(() => setLoading(false));
  }, [token, category]);

  return (
    <div className="space-y-6 page-enter">
      <div>
        <h2 className="font-heading text-text-primary mb-2" style={{ fontSize: 24, fontWeight: 300 }}>
          {title}
        </h2>
        <p className="font-body text-text-secondary text-[13px] leading-relaxed max-w-2xl">
          {subtitle}
        </p>
      </div>

      {error && (
        <div className="rounded-xl border px-4 py-3 font-body text-[13px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
          {error}
        </div>
      )}

      {loading ? (
        <div className="grid gap-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="rounded-2xl bg-forest-card/30 border border-forest-border/30 h-40 skeleton-shimmer" />
          ))}
        </div>
      ) : integrations.length === 0 ? (
        <Empty />
      ) : (
        <div className="space-y-3">
          {integrations.map((i) => <IntegrationCard key={i.kind} integration={i} />)}
        </div>
      )}
    </div>
  );
}

function IntegrationCard({ integration }: { integration: Integration }) {
  const [open, setOpen] = useState(false);
  const isConnected = integration.status === "connected";
  const isError     = integration.status === "error" || integration.status === "expired";

  const statusColor =
    isConnected ? "var(--moss)" :
    isError     ? "var(--ember)" :
                  "var(--text-secondary)";

  const statusLabel =
    integration.status === "connected"     ? "Connected" :
    integration.status === "error"         ? "Error" :
    integration.status === "expired"       ? "Expired" :
                                              "Not connected yet";

  return (
    <div className="rounded-2xl bg-forest-card/40 border border-forest-border/50 overflow-hidden">
      <div className="px-5 py-4">
        <div className="flex items-start gap-4 mb-2">
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h3 className="font-heading text-text-primary" style={{ fontSize: 18, fontWeight: 400 }}>
                {integration.name}
              </h3>
              <span
                className="font-body text-[10px] tracking-[0.22em] uppercase px-2 py-0.5 rounded-full"
                style={{ color: statusColor, border: `1px solid ${statusColor}` }}
              >
                {statusLabel}
              </span>
            </div>
            <p className="font-body text-text-secondary text-[13px] leading-relaxed">
              {integration.description}
            </p>
          </div>
        </div>

        {integration.last_synced && (
          <p className="font-body text-text-secondary/70 text-[11px] tracking-[0.18em] uppercase mt-2">
            Last synced {new Date(integration.last_synced).toLocaleString()}
          </p>
        )}

        {integration.last_error && (
          <div className="mt-3 rounded-lg border px-3 py-2 font-body text-[12px]" style={{ borderColor: "var(--ember)", color: "var(--ember)" }}>
            {integration.last_error}
          </div>
        )}

        <button
          onClick={() => setOpen(!open)}
          className="mt-3 font-body text-[11px] tracking-[0.22em] uppercase text-amber-sun/80 hover:text-amber-sun transition-colors"
        >
          {open ? "Hide setup" : "Show setup"}
        </button>
      </div>

      {open && (
        <div className="border-t border-forest-border/40 bg-forest-deep/40 px-5 py-4">
          <p className="font-body text-text-secondary text-[11px] tracking-[0.22em] uppercase mb-3">
            What this needs
          </p>
          <ul className="space-y-2">
            {integration.prerequisites.map((p, i) => (
              <li key={i} className="flex items-start gap-3 font-body text-[13px]">
                <span className="text-amber-sun shrink-0 mt-1">·</span>
                <span className="text-text-primary leading-relaxed">{p}</span>
              </li>
            ))}
          </ul>

          <div className="mt-4 pt-4 border-t border-forest-border/30">
            <button
              disabled
              className="font-body text-[12px] tracking-[0.22em] uppercase px-4 py-2 rounded-full border border-amber-sun/30 text-amber-sun/40 cursor-not-allowed"
              title="OAuth flow lights up once Bob gathers the credentials above"
            >
              Connect (waiting for credentials)
            </button>
            <p className="font-body text-text-secondary/60 text-[11px] mt-2 leading-relaxed">
              Once the credentials above are gathered, this button kicks off the OAuth or API-key handshake. The same card will then render live data from this integration.
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

function Empty() {
  return (
    <div className="rounded-2xl border border-forest-border/40 px-6 py-10 text-center">
      <p className="font-body text-text-secondary text-[13px]">
        No integrations in this category yet.
      </p>
    </div>
  );
}
