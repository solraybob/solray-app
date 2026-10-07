"use client";

// City autocomplete shared by onboarding, settings, Souls and the preview.
//
// Two problems the per-page copies had:
//   1. Races. Each keystroke cancelled the debounce timer but not the request
//      already in flight, so a slow answer for "Bar" could land after the
//      answer for "Barcelona" and replace it. Every search now runs under its
//      own AbortController and is aborted when the query changes, and an
//      aborted answer is never applied.
//   2. Keyboard. Suggestions were picked on mousedown only, so Tab + Enter or
//      Space did nothing, and arrow keys did not move through the list. The
//      hook now tracks an active option and handles ArrowUp/ArrowDown/Enter/
//      Escape; pages render options as buttons that select on click.

import { useCallback, useEffect, useRef, useState } from "react";
import type React from "react";

export interface CitySuggestion {
  display: string;
  lat: number;
  lon: number;
}

type NomItem = {
  lat: string;
  lon: string;
  address?: { city?: string; town?: string; village?: string; municipality?: string; country?: string };
};

export async function searchCities(query: string, signal?: AbortSignal): Promise<CitySuggestion[]> {
  const res = await fetch(
    `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(query)}&type=city&limit=6&format=json&addressdetails=1`,
    { headers: { "Accept-Language": "en" }, signal },
  );
  if (!res.ok) return [];
  const data = (await res.json()) as NomItem[];
  const seen = new Set<string>();
  const out: CitySuggestion[] = [];
  for (const item of Array.isArray(data) ? data : []) {
    const a = item.address || {};
    const c = a.city || a.town || a.village || a.municipality;
    if (!c) continue;
    const display = a.country ? `${c}, ${a.country}` : c;
    if (seen.has(display)) continue;
    seen.add(display);
    out.push({ display, lat: parseFloat(item.lat), lon: parseFloat(item.lon) });
  }
  return out;
}

export function useCityAutocomplete(query: string) {
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  // The value last chosen from the list (or loaded from the server). Equal
  // query means "already resolved": no search, no list popping back open.
  const settledRef = useRef<string | null>(null);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 || query === settledRef.current) {
      setSuggestions([]);
      setOpen(false);
      setLoading(false);
      setActive(-1);
      return;
    }
    const ctrl = new AbortController();
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const list = await searchCities(q, ctrl.signal);
        if (ctrl.signal.aborted) return;
        setSuggestions(list);
        setOpen(list.length > 0);
        setActive(-1);
      } catch {
        /* aborted or offline: the member can still type the city */
      } finally {
        if (!ctrl.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => {
      clearTimeout(timer);
      ctrl.abort();
    };
  }, [query]);

  /** Mark a value as resolved (picked from the list or loaded) and close. */
  const settle = useCallback((value: string) => {
    settledRef.current = value;
    setSuggestions([]);
    setOpen(false);
    setActive(-1);
    setLoading(false);
  }, []);

  const close = useCallback(() => {
    setOpen(false);
    setActive(-1);
  }, []);

  /**
   * Keyboard handling for the input. Returns true when the key was used by
   * the list, so the page skips its own Enter handling.
   */
  const onKeyDown = useCallback(
    (e: React.KeyboardEvent, onPick: (s: CitySuggestion) => void): boolean => {
      if (!open || suggestions.length === 0) return false;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % suggestions.length);
        return true;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i <= 0 ? suggestions.length - 1 : i - 1));
        return true;
      }
      if (e.key === "Enter" && active >= 0 && active < suggestions.length) {
        e.preventDefault();
        onPick(suggestions[active]);
        return true;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        close();
        return true;
      }
      return false;
    },
    [open, suggestions, active, close],
  );

  return { suggestions, loading, open, setOpen, active, setActive, settle, close, onKeyDown };
}
