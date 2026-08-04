"use client";

import { clsx } from "clsx";
import type { ButtonHTMLAttributes, ReactNode } from "react";

type BtnProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "danger" | "ghost";
  shortcut?: string;
};

export function RhButton({
  variant = "primary",
  shortcut,
  className,
  children,
  ...rest
}: BtnProps) {
  const base =
    variant === "primary"
      ? "rh-btn-primary"
      : variant === "secondary"
        ? "rh-btn-secondary"
        : variant === "danger"
          ? "rh-btn-danger"
          : "border-0 bg-transparent cursor-pointer";
  return (
    <button type="button" className={clsx(base, className)} {...rest}>
      {children}
      {shortcut ? (
        <span className="rh-mono text-[9.5px] opacity-50">{shortcut}</span>
      ) : null}
    </button>
  );
}

export function RhBadge({
  children,
  bg,
  fg,
  className,
}: {
  children: ReactNode;
  bg?: string;
  fg?: string;
  className?: string;
}) {
  return (
    <span
      className={clsx("rh-badge", className)}
      style={{ background: bg, color: fg }}
    >
      {children}
    </span>
  );
}

export function RhAvatar({
  initials,
  color,
  size = 28,
  radius,
}: {
  initials: string;
  color: string;
  size?: number;
  radius?: number;
}) {
  const r = radius ?? (size <= 28 ? 8 : size <= 34 ? 9 : 10);
  return (
    <span
      className="rh-mono grid place-items-center font-bold shrink-0"
      style={{
        width: size,
        height: size,
        borderRadius: r,
        background: color,
        color: "#0A0C0F",
        fontSize: size <= 28 ? 10 : 11,
      }}
    >
      {initials}
    </span>
  );
}

export function RhCard({
  children,
  className,
  style,
  strong,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
  strong?: boolean;
}) {
  return (
    <div
      className={clsx("rh-card", className)}
      style={{
        borderColor: strong ? "#2B333F" : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}

export function RhCardHead({
  title,
  right,
  badge,
}: {
  title: string;
  right?: ReactNode;
  badge?: ReactNode;
}) {
  return (
    <div className="rh-card-head">
      <div className="text-[13.5px] font-semibold">{title}</div>
      {badge}
      <div className="flex-1" />
      {right}
    </div>
  );
}

export function RhMicro({
  children,
  className,
  style,
}: {
  children: ReactNode;
  className?: string;
  style?: React.CSSProperties;
}) {
  return (
    <span className={clsx("rh-micro", className)} style={style}>
      {children}
    </span>
  );
}

export function RhSwitch({
  on,
  onToggle,
}: {
  on: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-pressed={on}
      className="relative shrink-0 border-0 cursor-pointer"
      style={{
        width: 32,
        height: 18,
        borderRadius: 20,
        background: on ? "#E5F2B5" : "#232932",
        padding: 0,
      }}
    >
      <span
        className="absolute top-[2px] block rounded-full transition-all duration-160"
        style={{
          width: 14,
          height: 14,
          left: on ? 16 : 2,
          background: on ? "#0A0C0F" : "#5F6978",
        }}
      />
    </button>
  );
}

export function RhPageHero({
  eyebrow,
  title,
  actions,
}: {
  eyebrow: string;
  title: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-3">
      <div>
        <div className="rh-micro" style={{ color: "#5F6978" }}>
          {eyebrow}
        </div>
        <h1
          className="m-0 mt-[7px] text-[27px] font-semibold tracking-[-0.02em]"
          style={{ color: "#E7ECF2" }}
        >
          {title}
        </h1>
      </div>
      {actions ? <div className="flex flex-wrap gap-2">{actions}</div> : null}
    </div>
  );
}

export function RhRuleBanner({
  tag,
  tagBg = "#F0C24E",
  children,
  tint = "rgba(240,194,78,.05)",
  border = "rgba(240,194,78,.28)",
  action,
}: {
  tag: string;
  tagBg?: string;
  children: ReactNode;
  tint?: string;
  border?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="flex items-start gap-3 rounded-[13px] p-[15px]"
      style={{ background: tint, border: `1px solid ${border}` }}
    >
      <span
        className="rh-badge shrink-0"
        style={{ background: tagBg, color: "#0A0C0F" }}
      >
        {tag}
      </span>
      <div className="flex-1 text-[11.5px] leading-[1.55]" style={{ color: "#B9C2CE" }}>
        {children}
      </div>
      {action}
    </div>
  );
}
