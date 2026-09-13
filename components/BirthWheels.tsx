"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useT } from "@/lib/i18n";

/**
 * BirthWheels: the birth moment as one instrument, five columns.
 *
 * This is mundane's wheel, whose CSS is quoted below so the geometry is
 * checkable against the source rather than remembered:
 *
 *   .wheels{position:relative;display:flex;gap:0;height:170px;overflow:hidden;
 *     background:#FCF9F3;border:1px solid rgba(34,32,28,.07);border-radius:18px;
 *     box-shadow:0 8px 22px rgba(70,45,20,.06)}
 *   .wband{position:absolute;left:10px;right:10px;top:68px;height:34px;
 *     border-radius:10px;background:rgba(34,32,28,.045);pointer-events:none}
 *   .wdiv{width:1px;flex:0 0 auto;background:rgba(34,32,28,.09);margin:24px 7px}
 *   .wheel{flex:1 1 0;overflow-y:auto;scroll-snap-type:y mandatory;
 *     text-align:center;scrollbar-width:none;-webkit-overflow-scrolling:touch}
 *   .wheel.wide{flex:1.4 1 0}
 *   .wheel .wpad{height:68px}
 *   .wheel i{display:block;height:34px;line-height:34px;font-size:17px;
 *     font-weight:600;color:var(--ink);scroll-snap-align:center}
 *
 * A row is 34 tall and the lit band is the third row, so the selected index is
 * the scroll position divided by the row height, and seating a wheel is
 * scrollTop = index * 34. The 68px pads at each end let the first and last
 * item reach the middle. Weight is 700 rather than mundane's 600: Zen Kaku
 * Gothic New has no 600, and the app's scale is 500/700/900.
 *
 * Two rules it keeps from mundane. A birth is one fact, so the five columns
 * live inside one bordered instrument rather than five inputs. And it never
 * invents a value: with nothing stored the wheels seat at a neutral point and
 * report nothing upward until the person actually turns one, so the Save
 * button's own "date and time are required" check still means something.
 */

const ROW = 34;
const PAD = 68;

type Part = "d" | "m" | "y" | "h" | "i";

function pad2(n: number) {
  return String(n).padStart(2, "0");
}

function daysInMonth(year: number, month1: number) {
  return new Date(year, month1, 0).getDate();
}

function monthLabels(locale: string) {
  const fmt = new Intl.DateTimeFormat(locale, { month: "short" });
  return Array.from({ length: 12 }, (_, i) =>
    fmt.format(new Date(Date.UTC(2021, i, 15))).replace(".", "")
  );
}

/** One scrolling column. */
function Wheel({
  part,
  values,
  index,
  onIndex,
  wide,
  label,
}: {
  part: Part;
  values: string[];
  index: number;
  onIndex: (part: Part, i: number) => void;
  wide?: boolean;
  label: string;
}) {
  const ref = useRef<HTMLDivElement | null>(null);
  const settle = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seated = useRef(false);

  // Opacity falls off with distance from the lit row, so the column reads as
  // one value with its neighbours behind it rather than a list.
  const paint = useCallback((el: HTMLDivElement) => {
    const items = el.querySelectorAll("i");
    const i0 = Math.max(0, Math.min(items.length - 1, Math.round(el.scrollTop / ROW)));
    for (let i = 0; i < items.length; i++) {
      const d = Math.abs(i - i0);
      (items[i] as HTMLElement).style.opacity =
        d === 0 ? "1" : d === 1 ? ".4" : d === 2 ? ".17" : ".07";
    }
    return i0;
  }, []);

  // Seat on mount and whenever the value changes from outside (a month with
  // fewer days clamping the day, or the profile loading in).
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const want = index * ROW;
    if (!seated.current || Math.abs(el.scrollTop - want) > ROW / 2) {
      el.scrollTop = want;
      seated.current = true;
    }
    paint(el);
  }, [index, values.length, paint]);

  const onScroll = () => {
    const el = ref.current;
    if (!el) return;
    paint(el);
    if (settle.current) clearTimeout(settle.current);
    settle.current = setTimeout(() => {
      const i0 = paint(el);
      if (i0 !== index) onIndex(part, i0);
    }, 90);
  };

  return (
    <div
      ref={ref}
      onScroll={onScroll}
      role="listbox"
      aria-label={label}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "ArrowDown" || e.key === "ArrowUp") {
          e.preventDefault();
          const next = Math.max(0, Math.min(values.length - 1, index + (e.key === "ArrowDown" ? 1 : -1)));
          onIndex(part, next);
        }
      }}
      className="sol-wheel"
      style={{ flex: wide ? "1.4 1 0" : "1 1 0" }}
    >
      <div style={{ height: PAD }} />
      {values.map((v) => (
        <i key={v}>{v}</i>
      ))}
      <div style={{ height: PAD }} />
    </div>
  );
}

export default function BirthWheels({
  date,
  time,
  onChange,
}: {
  /** YYYY-MM-DD, or "" when the person has not set one yet. */
  date: string;
  /** HH:MM, or "". */
  time: string;
  onChange: (date: string, time: string) => void;
}) {
  const { t, lang } = useT();
  // en-GB rather than en: the app writes dates day-first everywhere else
  // ("SUNDAY 13 SEPTEMBER"), and "September 5" would be the only one that is not.
  const locale = lang.startsWith("es") ? "es-ES" : "en-GB";
  const MON = useMemo(() => monthLabels(locale), [locale]);

  const thisYear = new Date().getFullYear();
  const years = useMemo(
    () => Array.from({ length: thisYear - 1900 + 1 }, (_, i) => String(1900 + i)),
    [thisYear]
  );

  // A neutral seat when nothing is stored. Nothing is reported upward from it.
  const NEUTRAL = { y: 1990, m: 1, d: 1, h: 12, i: 0 };
  const parsed = useMemo(() => {
    const dm = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date || "");
    const tm = /^(\d{1,2}):(\d{2})/.exec(time || "");
    return {
      y: dm ? +dm[1] : NEUTRAL.y,
      m: dm ? +dm[2] : NEUTRAL.m,
      d: dm ? +dm[3] : NEUTRAL.d,
      h: tm ? +tm[1] : NEUTRAL.h,
      i: tm ? +tm[2] : NEUTRAL.i,
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [date, time]);

  const [val, setVal] = useState(parsed);
  const [touched, setTouched] = useState(Boolean(date && time));

  // Follow the props when they change from outside (profile finishes loading).
  useEffect(() => {
    setVal(parsed);
    if (date && time) setTouched(true);
  }, [parsed, date, time]);

  const dayCount = daysInMonth(val.y, val.m);
  const days = useMemo(
    () => Array.from({ length: dayCount }, (_, i) => String(i + 1)),
    [dayCount]
  );
  const hours = useMemo(() => Array.from({ length: 24 }, (_, i) => pad2(i)), []);
  const mins = useMemo(() => Array.from({ length: 60 }, (_, i) => pad2(i)), []);

  const commit = (next: typeof val, isTouch: boolean) => {
    // A month with fewer days pulls the day back rather than making 31 April.
    const cap = daysInMonth(next.y, next.m);
    const safe = { ...next, d: Math.min(next.d, cap) };
    setVal(safe);
    if (isTouch) setTouched(true);
    if (isTouch || touched) {
      onChange(
        `${safe.y}-${pad2(safe.m)}-${pad2(safe.d)}`,
        `${pad2(safe.h)}:${pad2(safe.i)}`
      );
    }
  };

  const onIndex = (part: Part, i: number) => {
    if (part === "d") commit({ ...val, d: i + 1 }, true);
    if (part === "m") commit({ ...val, m: i + 1 }, true);
    if (part === "y") commit({ ...val, y: 1900 + i }, true);
    if (part === "h") commit({ ...val, h: i }, true);
    if (part === "i") commit({ ...val, i: i }, true);
  };

  const said = touched
    ? new Date(val.y, val.m - 1, val.d).toLocaleDateString(locale, {
        day: "numeric",
        month: "long",
        year: "numeric",
      }) + `, ${pad2(val.h)}:${pad2(val.i)}`
    : t("settings.birth_wheel_prompt");

  return (
    <div>
      <div className="sol-wheels">
        <div className="sol-wband" />
        <Wheel part="d" values={days} index={val.d - 1} onIndex={onIndex} label={t("common.date")} />
        <Wheel part="m" values={MON} index={val.m - 1} onIndex={onIndex} label={t("common.date")} />
        <Wheel part="y" values={years} index={val.y - 1900} onIndex={onIndex} wide label={t("common.date")} />
        <span className="sol-wdiv" />
        <Wheel part="h" values={hours} index={val.h} onIndex={onIndex} label={t("common.time")} />
        <Wheel part="i" values={mins} index={val.i} onIndex={onIndex} label={t("common.time")} />
      </div>
      <p
        className="font-body"
        style={{ fontSize: 14, lineHeight: 1.5, marginTop: 10, color: "rgb(var(--rgb-text-muted))" }}
      >
        {said}
      </p>
    </div>
  );
}
