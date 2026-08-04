"use client";

import type { ReactNode } from "react";
import { Check, Clock3, TriangleAlert } from "lucide-react";
import type { FlowStep } from "@/components/rh/mock/employee";

export const EMP_COLORS = {
  text: "#E7ECF2",
  body: "#B9C2CE",
  secondary: "#8B95A5",
  muted: "#7E8998",
  dim: "#5F6978",
  faint: "#4C5563",
  inset: "#0E1116",
  surface: "#10141A",
  control: "#12161C",
  border: "#1F252E",
  borderSubtle: "#1B212A",
  borderControl: "#232932",
  borderStrong: "#2B333F",
  chip: "#1D2530",
  accent: "#E5F2B5",
  success: "#46D6C0",
  warning: "#F0C24E",
  orange: "#F2874E",
  danger: "#F2604E",
  remote: "#7C8CF8",
} as const;

/** Petit intitulé mono en majuscules. */
export function EmpLabel({
  children,
  color = EMP_COLORS.dim,
}: {
  children: ReactNode;
  color?: string;
}) {
  return (
    <div className="rh-micro" style={{ color }}>
      {children}
    </div>
  );
}

/** Ligne clé / valeur dans un inspecteur. */
export function EmpKeyValue({
  label,
  value,
  tone,
  mono,
  bold,
}: {
  label: string;
  value: ReactNode;
  tone?: string;
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <div
      className="flex items-baseline justify-between gap-3 py-[7px]"
      style={{ borderBottom: `1px solid ${EMP_COLORS.borderSubtle}` }}
    >
      <span className="text-[11.5px]" style={{ color: EMP_COLORS.muted }}>
        {label}
      </span>
      <span
        className={mono ? "rh-mono text-[11.5px]" : "text-[12px]"}
        style={{
          color: tone ?? EMP_COLORS.text,
          textAlign: "right",
          fontWeight: bold ? 700 : 500,
        }}
      >
        {value}
      </span>
    </div>
  );
}

/** Champ de formulaire en lecture (maquette non connectée). */
export function EmpField({
  label,
  value,
  hint,
  warning,
  right,
}: {
  label: string;
  value: ReactNode;
  hint?: string;
  warning?: boolean;
  right?: ReactNode;
}) {
  return (
    <label className="block">
      <EmpLabel>{label}</EmpLabel>
      <div
        className="mt-[6px] flex items-center gap-2 rounded-[10px] px-[13px] py-[11px]"
        style={{
          background: EMP_COLORS.inset,
          border: `1px solid ${warning ? "rgba(240,194,78,.45)" : EMP_COLORS.borderControl}`,
        }}
      >
        <span className="flex-1 text-[13px]" style={{ color: EMP_COLORS.text }}>
          {value}
        </span>
        {right}
      </div>
      {hint ? (
        <div
          className="mt-[6px] text-[10.5px] leading-[1.5]"
          style={{ color: warning ? EMP_COLORS.warning : EMP_COLORS.dim }}
        >
          {hint}
        </div>
      ) : null}
    </label>
  );
}

const FLOW_TONE: Record<FlowStep["state"], string> = {
  done: EMP_COLORS.success,
  current: EMP_COLORS.accent,
  blocked: EMP_COLORS.danger,
  todo: EMP_COLORS.faint,
};

/** Timeline verticale d'un circuit de validation. */
export function EmpFlow({ steps }: { steps: FlowStep[] }) {
  return (
    <div className="flex flex-col">
      {steps.map((step, i) => {
        const tone = FLOW_TONE[step.state];
        const last = i === steps.length - 1;
        return (
          <div key={step.label} className="flex gap-[10px]">
            <div className="flex flex-col items-center">
              <span
                className={`grid place-items-center rounded-full ${step.state === "current" ? "rh-pulse" : ""}`}
                style={{
                  width: 16,
                  height: 16,
                  background:
                    step.state === "done"
                      ? tone
                      : step.state === "todo"
                        ? "transparent"
                        : `${tone}22`,
                  border: step.state === "done" ? "none" : `1.4px solid ${tone}`,
                  color: "#0A0C0F",
                }}
              >
                {step.state === "done" ? (
                  <Check size={9} strokeWidth={3.4} />
                ) : step.state === "blocked" ? (
                  <TriangleAlert size={8} style={{ color: tone }} />
                ) : step.state === "current" ? (
                  <Clock3 size={8} style={{ color: tone }} />
                ) : null}
              </span>
              {!last ? (
                <span
                  className="flex-1"
                  style={{
                    width: 1.4,
                    minHeight: 22,
                    background: step.state === "done" ? `${tone}55` : EMP_COLORS.borderSubtle,
                  }}
                />
              ) : null}
            </div>
            <div className={last ? "pb-0" : "pb-[14px]"}>
              <div
                className="text-[12px] font-medium leading-tight"
                style={{
                  color: step.state === "todo" ? EMP_COLORS.muted : EMP_COLORS.text,
                }}
              >
                {step.label}
              </div>
              <div
                className="rh-mono mt-[3px] text-[10px] leading-[1.45]"
                style={{ color: step.state === "blocked" ? tone : EMP_COLORS.dim }}
              >
                {step.meta}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

/** En-tête de colonne d'un tableau dense. */
export function EmpTh({
  children,
  align = "left",
  width,
}: {
  children: ReactNode;
  align?: "left" | "right" | "center";
  width?: number | string;
}) {
  return (
    <th
      className="rh-micro whitespace-nowrap px-[14px] py-[9px]"
      style={{
        color: EMP_COLORS.dim,
        textAlign: align,
        width,
        borderBottom: `1px solid ${EMP_COLORS.borderSubtle}`,
        fontWeight: 700,
      }}
    >
      {children}
    </th>
  );
}

export function EmpTd({
  children,
  align = "left",
  mono,
  color,
  bold,
}: {
  children?: ReactNode;
  align?: "left" | "right" | "center";
  mono?: boolean;
  color?: string;
  bold?: boolean;
}) {
  return (
    <td
      className={`px-[14px] py-[10px] ${mono ? "rh-mono text-[11.5px]" : "text-[12.5px]"}`}
      style={{
        textAlign: align,
        color: color ?? EMP_COLORS.body,
        fontWeight: bold ? 600 : 400,
        borderBottom: `1px solid #15191F`,
      }}
    >
      {children}
    </td>
  );
}

/** Puce d'état colorée avec libellé mono. */
export function EmpStatus({ label, tone }: { label: string; tone: string }) {
  return (
    <span
      className="rh-badge"
      style={{ background: `${tone}1F`, color: tone, border: `1px solid ${tone}44` }}
    >
      {label}
    </span>
  );
}

/** Encart d'alerte (défaut : ambre). */
export function EmpAlert({
  icon,
  title,
  children,
  tone = EMP_COLORS.warning,
  action,
}: {
  icon?: ReactNode;
  title: string;
  children: ReactNode;
  tone?: string;
  action?: ReactNode;
}) {
  return (
    <div
      className="rounded-[12px] p-[13px]"
      style={{ background: `${tone}0D`, border: `1px solid ${tone}47` }}
    >
      <div className="flex items-center gap-2">
        {icon ?? <TriangleAlert size={13} style={{ color: tone }} />}
        <span className="text-[12.5px] font-semibold" style={{ color: tone }}>
          {title}
        </span>
      </div>
      <p
        className="m-0 mt-[7px] text-[11.5px] leading-[1.55]"
        style={{ color: EMP_COLORS.body }}
      >
        {children}
      </p>
      {action ? <div className="mt-[10px]">{action}</div> : null}
    </div>
  );
}

/** Barre de progression fine. */
export function EmpBar({
  ratio,
  tone,
  track = "#1B212A",
}: {
  ratio: number;
  tone: string;
  track?: string;
}) {
  return (
    <span
      className="block overflow-hidden rounded-full"
      style={{ height: 4, background: track }}
    >
      <span
        className="block h-full rounded-full"
        style={{ width: `${Math.min(100, Math.max(0, ratio * 100))}%`, background: tone }}
      />
    </span>
  );
}
