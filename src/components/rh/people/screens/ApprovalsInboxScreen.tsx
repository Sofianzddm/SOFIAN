"use client";

import { useState } from "react";
import {
  RhAvatar,
  RhButton,
  RhCard,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { LIME, type InboxItem } from "@/components/rh/people/people-utils";

const REQUEST_TYPE_LABEL: Record<string, string> = {
  LEAVE: "Congés",
  UNPAID_LEAVE: "Sans solde",
  TIMESHEET: "Feuille de temps",
  EXPENSE: "Notes de frais",
  REMOTE_PLAN: "Plan télétravail",
  REMOTE_EXCEPTION: "TT exceptionnel",
  ADDRESS_CHANGE: "Adresse TT",
  CONTACT_CHANGE: "Coordonnées",
  PAUSE_AMEND: "Pause / avenant",
};

type Props = {
  inboxItems: InboxItem[];
  busy: boolean;
  onApprove: (id: string, who: string) => void;
  onRefuse: (id: string, who: string) => void;
  onApproveAll: () => void;
  onOpenFiche: (employeeId: string) => void;
};

export function ApprovalsInboxScreen({
  inboxItems,
  busy,
  onApprove,
  onRefuse,
  onApproveAll,
  onOpenFiche,
}: Props) {
  const [sel, setSel] = useState(0);
  const selected = inboxItems[sel] ?? inboxItems[0];

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow="INBOX"
        title="Validations"
        subtitle="Demandes à valider ou refuser — une confirmation est demandée avant chaque action."
        actions={
          <RhButton
            disabled={busy || !inboxItems.length}
            onClick={() => void onApproveAll()}
          >
            Tout approuver
          </RhButton>
        }
      />
      <div className="rh-layout-inspect-wide">
        <RhCard>
          {inboxItems.length === 0 ? (
            <div className="p-6 text-[12.5px]" style={{ color: "#8B95A5" }}>
              File vide
            </div>
          ) : (
            inboxItems.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setSel(r.idx)}
                className="w-full text-left flex items-center gap-3 px-4 py-[11px] border-0 cursor-pointer"
                style={{
                  background: r.idx === sel ? "#151C23" : "transparent",
                  borderBottom: "1px solid #15191F",
                  borderLeft: `2px solid ${r.idx === sel ? LIME : "transparent"}`,
                }}
              >
                <RhAvatar
                  initials={r.initials}
                  color={r.color}
                  size={26}
                  src={r.avatarUrl}
                />
                <div className="flex-1 min-w-0">
                  <div className="text-[12.5px] font-medium truncate">
                    {r.who}
                  </div>
                  <div
                    className="rh-mono text-[9.5px]"
                    style={{ color: "#7E8998" }}
                  >
                    {REQUEST_TYPE_LABEL[r.kind] || r.kind} · {r.meta}
                  </div>
                </div>
                <span
                  className="rh-mono text-[10px]"
                  style={{ color: "#8B95A5" }}
                >
                  {r.status}
                </span>
              </button>
            ))
          )}
        </RhCard>
        {selected ? (
          <RhCard strong>
            <div
              className="flex flex-wrap items-center gap-3 px-4 py-3"
              style={{ borderBottom: "1px solid #1B212A" }}
            >
              <RhAvatar
                initials={selected.initials}
                color={selected.color}
                size={34}
                src={selected.avatarUrl}
              />
              <div className="flex-1">
                <div className="text-[14px] font-semibold">{selected.who}</div>
                <div
                  className="rh-mono text-[9.5px]"
                  style={{ color: "#7E8998" }}
                >
                  {selected.meta}
                </div>
              </div>
              <RhButton
                variant="danger"
                disabled={busy}
                onClick={() => void onRefuse(selected.id, selected.who)}
              >
                Refuser
              </RhButton>
              <RhButton
                disabled={busy}
                onClick={() => void onApprove(selected.id, selected.who)}
              >
                Approuver
              </RhButton>
            </div>
            <div
              className="p-4 flex flex-col gap-3 text-[13px]"
              style={{ color: "#B9C2CE" }}
            >
              <div>
                <div
                  className="text-[14px] font-semibold"
                  style={{ color: "#E7ECF2" }}
                >
                  {selected.title}
                </div>
                {selected.comment ? (
                  <p className="m-0 mt-1.5">{selected.comment}</p>
                ) : null}
              </div>

              {selected.kind === "EXPENSE" &&
              Array.isArray(selected.detailRaw.lines) ? (
                <div
                  className="rounded-[12px] overflow-hidden"
                  style={{ border: "1px solid #1B212A" }}
                >
                  <div
                    className="px-3 py-2 text-[12px] font-semibold"
                    style={{ background: "#0E1116" }}
                  >
                    Lignes ·{" "}
                    {selected.detailRaw.totalAmount != null
                      ? `${Number(selected.detailRaw.totalAmount).toFixed(2)} €`
                      : ""}
                  </div>
                  {(
                    selected.detailRaw.lines as Array<Record<string, unknown>>
                  ).map((l, i) => (
                    <div
                      key={i}
                      className="flex flex-col gap-1 px-3 py-2.5 text-[12.5px]"
                      style={{ borderTop: "1px solid #15191F" }}
                    >
                      <div className="flex gap-2 items-start">
                        <span
                          className="w-[72px] shrink-0"
                          style={{ color: "#7E8998" }}
                        >
                          {String(l.date || "")}
                        </span>
                        <span className="flex-1 min-w-0">
                          {String(l.label || l.category || "")}
                          {l.missingReceipt ? " · justificatif manquant" : ""}
                          {!l.isMileage && !l.ocrVerified
                            ? " · scan non vérifié"
                            : ""}
                        </span>
                        <span
                          className="font-semibold shrink-0"
                          style={{ color: LIME }}
                        >
                          {Number(l.amount || 0).toFixed(2)} €
                        </span>
                        {l.receiptUrl ? (
                          <a
                            href={String(l.receiptUrl)}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0"
                          >
                            Voir
                          </a>
                        ) : null}
                      </div>
                      {l.justification ? (
                        <p
                          className="m-0 text-[12px] leading-[1.4] pl-[80px]"
                          style={{ color: "#B9C2CE" }}
                        >
                          {String(l.justification)}
                        </p>
                      ) : null}
                      {Array.isArray(l.talentLabels) &&
                      (l.talentLabels as string[]).length > 0 ? (
                        <div
                          className="pl-[80px] flex flex-wrap gap-1"
                          style={{ color: "#8B95A5" }}
                        >
                          {(l.talentLabels as string[]).map((name) => (
                            <span
                              key={name}
                              className="rounded-[6px] px-2 py-0.5 text-[11px]"
                              style={{
                                background: "rgba(229,242,181,.1)",
                                color: LIME,
                              }}
                            >
                              {name}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </div>
                  ))}
                </div>
              ) : null}

              {selected.kind === "TIMESHEET" ? (
                <div
                  className="rounded-[12px] p-3"
                  style={{ background: "#0E1116", border: "1px solid #1B212A" }}
                >
                  <div className="font-semibold" style={{ color: "#E7ECF2" }}>
                    Semaine {String(selected.detailRaw.week || "—")} ·{" "}
                    {String(selected.detailRaw.totalLabel || "—")}
                  </div>
                  <div
                    className="mt-1 text-[12px]"
                    style={{ color: "#8B95A5" }}
                  >
                    HS 25 % {String(selected.detailRaw.ot25Label || "0 h")} · HS
                    50 % {String(selected.detailRaw.ot50Label || "0 h")}
                  </div>
                  {selected.detailRaw.overtimeNote ? (
                    <p className="m-0 mt-2 text-[12.5px]">
                      Note HS : {String(selected.detailRaw.overtimeNote)}
                    </p>
                  ) : null}
                  {Array.isArray(selected.detailRaw.days) ? (
                    <div className="mt-2 flex flex-col gap-1">
                      {(
                        selected.detailRaw.days as Array<
                          Record<string, unknown>
                        >
                      )
                        .filter((d) => Number(d.totalMinutes || 0) > 0)
                        .map((d, i) => (
                          <div
                            key={i}
                            className="flex justify-between text-[12px]"
                          >
                            <span>{String(d.date)}</span>
                            <span>{String(d.totalLabel)}</span>
                          </div>
                        ))}
                    </div>
                  ) : null}
                </div>
              ) : null}

              {(selected.kind === "LEAVE" ||
                selected.kind === "UNPAID_LEAVE") &&
              Array.isArray(selected.detailRaw.leaveDays) ? (
                <div className="text-[12.5px]">
                  <span style={{ color: "#8B95A5" }}>Jours : </span>
                  {(
                    selected.detailRaw.leaveDays as Array<{
                      date: string;
                      halfDay: boolean;
                    }>
                  )
                    .map((d) => (d.halfDay ? `${d.date} (½)` : d.date))
                    .join(", ")}
                </div>
              ) : null}

              {(selected.kind === "REMOTE_PLAN" ||
                selected.kind === "REMOTE_EXCEPTION") && (
                <div
                  className="rounded-[12px] p-3"
                  style={{ background: "#0E1116", border: "1px solid #1B212A" }}
                >
                  <div className="font-semibold" style={{ color: "#E7ECF2" }}>
                    {REQUEST_TYPE_LABEL[selected.kind] || selected.kind}
                    {selected.detailRaw.week
                      ? ` · ${String(selected.detailRaw.week)}`
                      : ""}
                  </div>
                  {Array.isArray(selected.detailRaw.dates) &&
                  (selected.detailRaw.dates as string[]).length > 0 ? (
                    <div className="mt-2 text-[12.5px]">
                      <span style={{ color: "#8B95A5" }}>Jours TT : </span>
                      {(selected.detailRaw.dates as string[]).join(", ")}
                    </div>
                  ) : selected.detailRaw.date ? (
                    <div className="mt-2 text-[12.5px]">
                      <span style={{ color: "#8B95A5" }}>Date : </span>
                      {String(selected.detailRaw.date)}
                    </div>
                  ) : null}
                  {selected.detailRaw.compensateNextWeek ? (
                    <p className="m-0 mt-2 text-[12px]" style={{ color: "#F0C24E" }}>
                      Compensation demandée la semaine suivante
                    </p>
                  ) : null}
                </div>
              )}

              {(selected.kind === "ADDRESS_CHANGE" ||
                selected.kind === "CONTACT_CHANGE") &&
              selected.detailRaw.proposed ? (
                <div
                  className="rounded-[12px] p-3 text-[12.5px]"
                  style={{ background: "#0E1116", border: "1px solid #1B212A" }}
                >
                  <div className="font-semibold mb-1" style={{ color: "#E7ECF2" }}>
                    {REQUEST_TYPE_LABEL[selected.kind]}
                  </div>
                  <pre
                    className="m-0 whitespace-pre-wrap font-sans text-[12px]"
                    style={{ color: "#B9C2CE" }}
                  >
                    {JSON.stringify(selected.detailRaw.proposed, null, 2)}
                  </pre>
                </div>
              ) : null}

              {selected.employeeId ? (
                <button
                  type="button"
                  className="border-0 bg-transparent cursor-pointer text-left text-[12.5px] font-medium p-0"
                  style={{ color: LIME }}
                  onClick={() => onOpenFiche(selected.employeeId)}
                >
                  Voir la fiche collaborateur →
                </button>
              ) : null}
            </div>
          </RhCard>
        ) : null}
      </div>
    </div>
  );
}
