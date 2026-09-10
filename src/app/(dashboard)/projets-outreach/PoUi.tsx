"use client";

import type { CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import {
  STATUS_LABEL,
  type CampaignStatus,
} from "@/lib/projets-outreach";

export const PIPELINE_STEPS: CampaignStatus[] = [
  "BRIEF",
  "BRANDS",
  "DRAFTING",
  "SENDING",
  "ACTIVE",
];

export function initialOf(name: string) {
  const t = String(name || "").trim();
  return (t[0] || "?").toUpperCase();
}

export function PoAvatar({
  name,
  size = 42,
  photo,
}: {
  name: string;
  size?: number;
  photo?: string | null;
}) {
  if (photo) {
    return (
      // eslint-disable-next-line @next/next/no-img-element
      <img
        src={photo}
        alt=""
        width={size}
        height={size}
        className="po-avatar object-cover"
        style={{ width: size, height: size, borderRadius: size > 36 ? 12 : 8 }}
      />
    );
  }
  return (
    <div
      className="po-avatar"
      style={{
        width: size,
        height: size,
        fontSize: size > 36 ? 16 : size > 28 ? 12 : 11,
        borderRadius: size > 36 ? 12 : 8,
      }}
    >
      {initialOf(name)}
    </div>
  );
}

export function StageStepper({
  status,
  compact,
}: {
  status: CampaignStatus;
  compact?: boolean;
}) {
  const currentIdx = PIPELINE_STEPS.indexOf(
    status === "CLOSED" ? "ACTIVE" : status
  );

  return (
    <div className="flex flex-wrap items-center gap-[5px]">
      {PIPELINE_STEPS.map((step, i) => {
        const done = currentIdx > i;
        const current = status === step || (status === "CLOSED" && step === "ACTIVE");
        const cls = current
          ? "po-stage-pill po-stage-current"
          : done
            ? "po-stage-pill po-stage-done"
            : "po-stage-pill po-stage-todo";
        return (
          <div key={step} className="flex items-center gap-[5px]">
            <span className={cls} style={compact ? { padding: "4px 12px" } : { padding: "4px 13px" }}>
              {STATUS_LABEL[step] === "Envoi" ? "Envoi" : STATUS_LABEL[step]}
            </span>
            {i < PIPELINE_STEPS.length - 1 && (
              <ChevronRight className="h-2.5 w-2.5 shrink-0 text-[#C9C9CF]" strokeWidth={1.8} />
            )}
          </div>
        );
      })}
      {status === "CLOSED" && (
        <span className="po-stage-pill po-stage-todo ml-1">Clos</span>
      )}
    </div>
  );
}

export function StatusBadge({ status }: { status: CampaignStatus }) {
  if (status === "BRANDS") {
    return <span className="po-badge po-badge-violet">{STATUS_LABEL[status]}</span>;
  }
  const styles: Partial<Record<CampaignStatus, CSSProperties>> = {
    BRIEF: { background: "#FBF1DC", color: "#956A15" },
    DRAFTING: { background: "#E8F1FF", color: "#2F6FED" },
    SENDING: { background: "#FFF0E8", color: "#C45C26" },
    ACTIVE: { background: "#E8F8EF", color: "#2E9E63" },
    CLOSED: { background: "#F4F4F5", color: "#6E6E77" },
  };
  return (
    <span className="po-badge" style={styles[status]}>
      {STATUS_LABEL[status]}
    </span>
  );
}

export function PriorityBadge({ priority }: { priority: string }) {
  const p = String(priority || "MEDIUM").toUpperCase();
  if (p === "HIGH" || p === "URGENT") {
    return <span className="po-badge po-badge-prio-high">{p}</span>;
  }
  if (p === "LOW") {
    return <span className="po-badge po-badge-prio-low">{p}</span>;
  }
  return <span className="po-badge po-badge-prio-medium">MEDIUM</span>;
}

export function StageDotBadge({ label }: { label: string }) {
  return (
    <span className="po-badge po-badge-stage">
      <span
        className="inline-block rounded-full"
        style={{ width: 5, height: 5, background: "#9B9BA3" }}
      />
      {label}
    </span>
  );
}

export function KpiCard({
  label,
  value,
  dot,
  hint,
}: {
  label: string;
  value: number | string;
  dot?: string;
  hint?: string;
}) {
  return (
    <div className="po-kpi">
      <div className="po-kpi-label">
        {label}
        {dot ? <span className="po-kpi-dot" style={{ background: dot }} /> : null}
      </div>
      <div className="flex items-baseline gap-2">
        <div className="po-kpi-value">{value}</div>
        {hint ? (
          <span className="text-[11.5px] font-medium text-[#9B9BA3]">{hint}</span>
        ) : null}
      </div>
    </div>
  );
}
