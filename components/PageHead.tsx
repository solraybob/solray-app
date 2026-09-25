"use client";

import type { CSSProperties, ReactNode } from "react";
import { Wordmark } from "@/components/Wordmark";

/* THE ONE LOOK: shared page chrome.
   Head: the mark top-left, one hairline rule under it, then the small
   uppercase label line. Title: 28px / 900. Sections: a hairline fold with a
   quiet uppercase label, no bordered or tinted cards. Buttons: one ink pill
   per screen for the primary action, hairline pills for everything else. */

export function PageHead({ label, right }: { label?: string; right?: ReactNode }) {
  return (
    <div className="w-full max-w-lg mx-auto px-5 pt-3">
      <div className="flex items-center justify-between lg:justify-end" style={{ minHeight: 34 }}>
        <Wordmark size={17} className="text-text-primary lg:hidden" style={{ letterSpacing: "-.045em" }} />
        {right}
      </div>
      <div style={{ height: 1, background: "rgb(var(--rgb-border))", marginTop: 12 }} />
      {label && (
        <p
          className="font-body uppercase"
          style={{ fontSize: 11, letterSpacing: "0.3em", color: "rgb(var(--rgb-text-muted))", marginTop: 12 }}
        >
          {label}
        </p>
      )}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: ReactNode; sub?: ReactNode }) {
  return (
    <div style={{ paddingTop: 18, paddingBottom: 28 }}>
      <h1
        className="font-heading"
        style={{ fontSize: 28, fontWeight: 900, letterSpacing: "-.02em", lineHeight: 1.15, color: "rgb(var(--rgb-text-primary))" }}
      >
        {title}
      </h1>
      {sub && (
        <p className="font-body" style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, marginTop: 10, color: "rgb(var(--rgb-text-secondary))" }}>
          {sub}
        </p>
      )}
    </div>
  );
}

/* The fold grammar used across the app: a quiet uppercase label over a
   hairline, content under it. */
export function Section({ label, right, children, style }: { label?: string; right?: ReactNode; children?: ReactNode; style?: CSSProperties }) {
  return (
    <div style={{ borderTop: "1px solid rgb(var(--rgb-border))", marginBottom: 28, ...style }}>
      {(label || right) && (
        <div
          className="flex items-center justify-between font-body uppercase"
          style={{ paddingBlock: 16, fontSize: 11.5, fontWeight: 700, letterSpacing: "0.2em", color: "rgb(var(--rgb-text-muted))" }}
        >
          <span>{label}</span>
          {right}
        </div>
      )}
      {children}
    </div>
  );
}

/* Body copy at the one-look size. */
export function BodyText({ children, muted, style }: { children: ReactNode; muted?: boolean; style?: CSSProperties }) {
  return (
    <p
      className="font-body"
      style={{ fontSize: 17, lineHeight: 1.62, fontWeight: 500, color: muted ? "rgb(var(--rgb-text-secondary))" : "rgb(var(--rgb-text-primary))", ...style }}
    >
      {children}
    </p>
  );
}

const pillBase = "w-full py-4 px-8 rounded-full text-[14px] tracking-[0.3em] uppercase transition-opacity duration-300 disabled:opacity-50 font-bold";

export const inkPillStyle: CSSProperties = {
  background: "rgb(var(--rgb-text-primary))",
  color: "rgb(var(--rgb-bg-deep))",
  border: "1.5px solid rgb(var(--rgb-text-primary))",
};

export const hairlinePillStyle: CSSProperties = {
  background: "transparent",
  color: "rgb(var(--rgb-text-secondary))",
  border: "1px solid rgb(var(--rgb-border))",
};

type PillProps = {
  onClick?: () => void;
  loading?: boolean;
  disabled?: boolean;
  type?: "button" | "submit";
  children: ReactNode;
  className?: string;
  style?: CSSProperties;
  ariaLabel?: string;
};

function Spinner() {
  return <span className="inline-block w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin align-middle" />;
}

/* The one primary action on a screen. */
export function InkButton({ onClick, loading, disabled, type = "button", children, className, style, ariaLabel }: PillProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      aria-label={ariaLabel}
      className={`${pillBase} ${className ?? ""}`}
      style={{ ...inkPillStyle, ...style }}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

/* Secondary actions: transparent, one hairline. */
export function HairlineButton({ onClick, loading, disabled, type = "button", children, className, style, ariaLabel }: PillProps) {
  return (
    <button
      type={type}
      onClick={onClick}
      disabled={loading || disabled}
      aria-label={ariaLabel}
      className={`${pillBase} ${className ?? ""}`}
      style={{ ...hairlinePillStyle, ...style }}
    >
      {loading ? <Spinner /> : children}
    </button>
  );
}

/* Standard one-look page frame. */
export function PageFrame({ children, style }: { children: ReactNode; style?: CSSProperties }) {
  return (
    <div className="min-h-[100dvh] bg-forest-deep" style={{ paddingBottom: "calc(96px + var(--sab, 0px))", ...style }}>
      {children}
    </div>
  );
}

/* One-look text input: hairline underline, no tinted box. */
export const inputStyle: CSSProperties = {
  width: "100%",
  background: "transparent",
  border: "1px solid rgb(var(--rgb-border))",
  borderRadius: 12,
  padding: "14px 16px",
  fontSize: 17,
  fontWeight: 500,
  color: "rgb(var(--rgb-text-primary))",
  outline: "none",
};
