"use client";

import LunarPhaseCard from "@/components/LunarPhaseCard";
import { useTodayState } from "./_hooks/useTodayState";
import { useTodayData } from "./_hooks/useTodayData";
import { renderToday } from "./_components/TodayView";

export default function TodayPage() {
  const todayState = useTodayState();
  const todayData = useTodayData(todayState);
  return renderToday({ ...todayState, ...todayData });
}
