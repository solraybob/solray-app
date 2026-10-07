"use client";

// A number that changes whenever the birth chart behind the chart-derived
// caches changes: in this tab (CHART_CHANGED_EVENT) or in another tab (the
// stored fingerprint changing fires `storage`). Put it in the dependencies of
// an effect that fetches something computed from the chart, so a result for
// the old chart is replaced, never left on screen.

import { useEffect, useState } from "react";
import { BIRTH_REV_STORAGE_KEY, CHART_CHANGED_EVENT } from "./chart-revision";
import { accountKey } from "./account-session";

export function useChartRevision(): number {
  const [n, setN] = useState(0);
  useEffect(() => {
    const bump = () => setN((x) => x + 1);
    const onStorage = (e: StorageEvent) => { if (e.key === accountKey(BIRTH_REV_STORAGE_KEY)) bump(); };
    window.addEventListener(CHART_CHANGED_EVENT, bump);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(CHART_CHANGED_EVENT, bump);
      window.removeEventListener("storage", onStorage);
    };
  }, []);
  return n;
}
