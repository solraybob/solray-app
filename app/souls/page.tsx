"use client";

import { useSoulsState } from "./_hooks/useSoulsState";
import { useSoulsPeople } from "./_hooks/useSoulsPeople";
import { useSoulsBond } from "./_hooks/useSoulsBond";
import { renderSouls } from "./_components/SoulsView";

// Main page
export default function SoulsPage() {
  const soulsState = useSoulsState();
  const soulsPeople = useSoulsPeople(soulsState);
  const soulsBond = useSoulsBond(soulsState);
  return renderSouls({ ...soulsState, ...soulsPeople, ...soulsBond });
}
