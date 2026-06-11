"use client";

/**
 * EntrySky: the living night sky behind the entry pages (login, onboard).
 *
 * A lightweight sibling of the landing page's cosmos: twinkling stars in the
 * aged-pigment palette, two drifting nebula fields, pointer parallax, and a
 * rare shooting star. Self-contained canvas, fixed behind the content,
 * parked when the tab hides, absent entirely under prefers-reduced-motion.
 * The entry pages are always dark (bg-forest-deep), so this needs no theme
 * awareness.
 */

import { useEffect, useRef, useState } from "react";

const PALETTE: [string, number][] = [
  ["242,236,216", 0.55],
  ["243,146,48", 0.16],
  ["155,134,160", 0.14],
  ["155,171,185", 0.15],
];

function starColor(): string {
  let r = Math.random();
  for (const [rgb, w] of PALETTE) if ((r -= w) <= 0) return rgb;
  return PALETTE[0][0];
}

export default function EntrySky() {
  const ref = useRef<HTMLCanvasElement | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    setEnabled(true);
  }, []);

  useEffect(() => {
    if (!enabled) return;
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let w = 0, h = 0, dpr = 1;
    type Star = {
      x: number; y: number; r: number; rgb: string;
      base: number; amp: number; phase: number; speed: number;
      vx: number; vy: number;
    };
    let stars: Star[] = [];

    const seed = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      w = window.innerWidth;
      h = window.innerHeight;
      canvas.width = Math.round(w * dpr);
      canvas.height = Math.round(h * dpr);
      canvas.style.width = `${w}px`;
      canvas.style.height = `${h}px`;
      const count = Math.round(Math.min(150, (w * h) / 9000));
      stars = Array.from({ length: count }, () => {
        const depth = 0.4 + Math.random() * 0.6;
        return {
          x: Math.random() * w,
          y: Math.random() * h,
          r: (0.35 + Math.random() * 1.05) * depth,
          rgb: starColor(),
          base: 0.1 + Math.random() * 0.38,
          amp: 0.08 + Math.random() * 0.4,
          phase: Math.random() * Math.PI * 2,
          speed: 0.2 + Math.random() * 0.8,
          vx: (Math.random() - 0.5) * 0.01 * depth,
          vy: (Math.random() - 0.4) * 0.007 * depth,
        };
      });
    };
    seed();

    let shoot: { x: number; y: number; vx: number; vy: number; life: number; max: number } | null = null;
    let nextShootAt = performance.now() + 6000 + Math.random() * 8000;

    let px = 0, py = 0, tx = 0, ty = 0;
    const fine = window.matchMedia("(pointer: fine)").matches;
    const onPointer = (e: PointerEvent) => {
      tx = ((e.clientX - w / 2) / (w / 2)) * 6;
      ty = ((e.clientY - h / 2) / (h / 2)) * 4;
    };
    if (fine) window.addEventListener("pointermove", onPointer, { passive: true });

    let raf = 0;
    let last = performance.now();
    const frame = (now: number) => {
      raf = 0;
      if (document.hidden) return;
      const dt = Math.min(now - last, 50);
      last = now;
      const t = now / 1000;

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      // Two soft nebula fields, amber and wisteria, drifting on slow sines.
      const nr = Math.max(w, h) * 0.55;
      const n1x = w * (0.3 + 0.08 * Math.sin(t * 0.05));
      const n1y = h * (0.28 + 0.07 * Math.cos(t * 0.04));
      const g1 = ctx.createRadialGradient(n1x, n1y, 0, n1x, n1y, nr);
      g1.addColorStop(0, "rgba(243,146,48,0.045)");
      g1.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g1;
      ctx.fillRect(0, 0, w, h);
      const n2x = w * (0.72 + 0.07 * Math.cos(t * 0.045));
      const n2y = h * (0.7 + 0.08 * Math.sin(t * 0.055));
      const g2 = ctx.createRadialGradient(n2x, n2y, 0, n2x, n2y, nr * 0.9);
      g2.addColorStop(0, "rgba(155,134,160,0.04)");
      g2.addColorStop(1, "rgba(0,0,0,0)");
      ctx.fillStyle = g2;
      ctx.fillRect(0, 0, w, h);

      for (const s of stars) {
        s.x += s.vx * dt * 0.06;
        s.y += s.vy * dt * 0.06;
        if (s.x < -2) s.x = w + 2; else if (s.x > w + 2) s.x = -2;
        if (s.y < -2) s.y = h + 2; else if (s.y > h + 2) s.y = -2;
        const a = s.base + s.amp * (0.5 + 0.5 * Math.sin(t * s.speed + s.phase));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(${s.rgb},${a.toFixed(3)})`;
        ctx.fill();
      }

      if (!shoot && now > nextShootAt) {
        shoot = {
          x: Math.random() > 0.5 ? -20 : w * 0.4,
          y: h * (0.05 + Math.random() * 0.3),
          vx: 0.6 + Math.random() * 0.3,
          vy: 0.16 + Math.random() * 0.1,
          life: 0,
          max: 700 + Math.random() * 300,
        };
        nextShootAt = now + 12000 + Math.random() * 16000;
      }
      if (shoot) {
        shoot.life += dt;
        shoot.x += shoot.vx * dt;
        shoot.y += shoot.vy * dt;
        const k = shoot.life / shoot.max;
        const fade = k < 0.2 ? k / 0.2 : 1 - (k - 0.2) / 0.8;
        const len = 80;
        const grad = ctx.createLinearGradient(shoot.x, shoot.y, shoot.x - shoot.vx * len, shoot.y - shoot.vy * len);
        grad.addColorStop(0, `rgba(242,236,216,${(0.8 * fade).toFixed(3)})`);
        grad.addColorStop(1, "rgba(242,236,216,0)");
        ctx.strokeStyle = grad;
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(shoot.x, shoot.y);
        ctx.lineTo(shoot.x - shoot.vx * len, shoot.y - shoot.vy * len);
        ctx.stroke();
        if (k >= 1 || shoot.x > w + 40) shoot = null;
      }

      px += (tx - px) * 0.04;
      py += (ty - py) * 0.04;
      canvas.style.transform = `translate3d(${px.toFixed(2)}px, ${py.toFixed(2)}px, 0)`;

      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    const onVis = () => {
      if (!document.hidden && !raf) {
        last = performance.now();
        raf = requestAnimationFrame(frame);
      }
    };
    document.addEventListener("visibilitychange", onVis);
    window.addEventListener("resize", seed, { passive: true });
    return () => {
      if (raf) cancelAnimationFrame(raf);
      document.removeEventListener("visibilitychange", onVis);
      window.removeEventListener("resize", seed);
      if (fine) window.removeEventListener("pointermove", onPointer);
    };
  }, [enabled]);

  if (!enabled) return null;
  return (
    <canvas
      ref={ref}
      aria-hidden="true"
      style={{ position: "fixed", inset: -8, pointerEvents: "none", zIndex: 0 }}
    />
  );
}
