"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  RhAvatar,
  RhBadge,
  RhButton,
  RhCard,
  RhCardHead,
  RhPageHero,
} from "@/components/rh/ui/primitives";
import { LIME, type InboxItem, type SigItem } from "@/components/rh/people/people-utils";

type TimeFilter = "pending" | "missing" | "awaiting" | "signed";

type MissingItem = {
  employeeId: string;
  name: string;
  initials: string;
  color: string;
  avatarUrl: string | null;
  department: string;
  matricule: string;
  email: string | null;
  timesheetId: string | null;
  status: string;
  totalMinutes: number;
  lastReminderAt: string | null;
  reminderCount: number;
};

type Props = {
  pendingItems: InboxItem[];
  sigItems: SigItem[];
  signedItems: SigItem[];
  sigLoading: boolean;
  busy: boolean;
  isHr: boolean;
  onApprove: (id: string, who: string) => Promise<void> | void;
  onRefuse: (id: string, who: string) => Promise<void> | void;
  onApproveSelected: (ids: string[]) => Promise<void> | void;
  onRequestSignature: (timesheetId: string, who: string) => Promise<void> | void;
  onMonthlySignatures: () => Promise<void> | void;
  onRefreshSignatures: () => void;
  onOpenFiche: (employeeId: string) => void;
  onFlash: (text: string, tone?: "ok" | "err") => void;
};

function weekLabel(isoYear: number, isoWeek: number) {
  return `${isoYear}-W${String(isoWeek).padStart(2, "0")}`;
}

function shiftIsoWeek(isoYear: number, isoWeek: number, delta: number) {
  const thu = new Date(Date.UTC(isoYear, 0, 4, 12));
  const thuDow = thu.getUTCDay() || 7;
  const monday = new Date(thu);
  monday.setUTCDate(thu.getUTCDate() - (thuDow - 1) + (isoWeek - 1) * 7);
  monday.setUTCDate(monday.getUTCDate() + delta * 7);
  const day = monday.getUTCDay() || 7;
  const thursday = new Date(monday);
  thursday.setUTCDate(monday.getUTCDate() + 4 - day);
  const y = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(y, 0, 1, 12));
  const w = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  return { isoYear: y, isoWeek: w };
}

function formatReminderAt(iso: string | null) {
  if (!iso) return null;
  return new Date(iso).toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

const STATUS_LABEL: Record<string, string> = {
  MISSING: "Non créée",
  DRAFT: "Brouillon",
  PAUSED: "En pause",
};

export function TimesheetsAdminScreen({
  pendingItems,
  sigItems,
  signedItems,
  sigLoading,
  busy,
  isHr,
  onApprove,
  onRefuse,
  onApproveSelected,
  onRequestSignature,
  onMonthlySignatures,
  onRefreshSignatures,
  onOpenFiche,
  onFlash,
}: Props) {
  const [filter, setFilter] = useState<TimeFilter>("pending");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const now = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 7);
    const day = (d.getDay() + 6) % 7;
    const monday = new Date(d);
    monday.setDate(d.getDate() - day);
    // ISO via jeudi
    const thu = new Date(monday);
    thu.setDate(monday.getDate() + 3);
    const y = thu.getFullYear();
    const yearStart = new Date(y, 0, 1);
    const w = Math.ceil(
      ((thu.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
    );
    return { isoYear: y, isoWeek: w };
  }, []);
  const [isoYear, setIsoYear] = useState(now.isoYear);
  const [isoWeek, setIsoWeek] = useState(now.isoWeek);
  const [missing, setMissing] = useState<MissingItem[]>([]);
  const [missingLoading, setMissingLoading] = useState(false);
  const [remindingId, setRemindingId] = useState<string | null>(null);

  const loadMissing = useCallback(async () => {
    setMissingLoading(true);
    try {
      const res = await fetch(
        `/api/rh/timesheets/missing?isoYear=${isoYear}&isoWeek=${isoWeek}`
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setMissing(data.items || []);
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Erreur chargement", "err");
      setMissing([]);
    } finally {
      setMissingLoading(false);
    }
  }, [isoYear, isoWeek, onFlash]);

  useEffect(() => {
    if (filter === "missing") void loadMissing();
  }, [filter, loadMissing]);

  useEffect(() => {
    setSelected(new Set());
  }, [pendingItems]);

  const allSelected =
    pendingItems.length > 0 && pendingItems.every((i) => selected.has(i.id));

  function toggleOne(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleAll() {
    if (allSelected) setSelected(new Set());
    else setSelected(new Set(pendingItems.map((i) => i.id)));
  }

  async function handleRemind(item: MissingItem) {
    if (
      !window.confirm(
        `Envoyer un rappel à ${item.name} pour la feuille S${isoWeek} ?`
      )
    )
      return;
    setRemindingId(item.employeeId);
    try {
      const res = await fetch("/api/rh/timesheets/missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employeeId: item.employeeId,
          isoYear,
          isoWeek,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onFlash(`Rappel envoyé à ${item.name}`);
      await loadMissing();
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Erreur rappel", "err");
    } finally {
      setRemindingId(null);
    }
  }

  async function handleRemindAll() {
    if (!missing.length) return;
    if (
      !window.confirm(
        `Envoyer un rappel à ${missing.length} collaborateur${missing.length > 1 ? "s" : ""} (S${isoWeek}) ?`
      )
    )
      return;
    setRemindingId("__all__");
    try {
      const res = await fetch("/api/rh/timesheets/missing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "bulk",
          employeeIds: missing.map((m) => m.employeeId),
          isoYear,
          isoWeek,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      onFlash(
        `${data.reminded || 0} rappel${(data.reminded || 0) > 1 ? "s" : ""} envoyé${(data.reminded || 0) > 1 ? "s" : ""}`
      );
      await loadMissing();
    } catch (e) {
      onFlash(e instanceof Error ? e.message : "Erreur rappels", "err");
    } finally {
      setRemindingId(null);
    }
  }

  const filters: Array<{ id: TimeFilter; label: string; count?: number }> = [
    { id: "pending", label: "À valider", count: pendingItems.length || undefined },
    {
      id: "missing",
      label: "Non envoyées",
      count: filter === "missing" ? missing.length || undefined : undefined,
    },
    {
      id: "awaiting",
      label: "Signature",
      count: sigItems.length || undefined,
    },
    {
      id: "signed",
      label: "Signées",
      count: signedItems.length || undefined,
    },
  ];

  return (
    <div className="rh-screen">
      <RhPageHero
        eyebrow="TEMPS"
        title="Feuilles de temps"
        subtitle="Valider, relancer les non envoyées, puis signature électronique."
        actions={
          isHr ? (
            <RhButton
              variant="secondary"
              disabled={busy}
              onClick={() => void onMonthlySignatures()}
            >
              Envoyer le mois (≈4 feuilles / collab)
            </RhButton>
          ) : undefined
        }
      />

      <div className="flex flex-wrap gap-2">
        {filters.map((f) => {
          const on = filter === f.id;
          return (
            <button
              key={f.id}
              type="button"
              onClick={() => setFilter(f.id)}
              className="border-0 cursor-pointer rounded-full px-3.5 py-2 text-[12.5px] font-semibold"
              style={{
                background: on ? "rgba(229,242,181,.16)" : "transparent",
                color: on ? LIME : "#8B95A5",
                outline: on
                  ? `2px solid ${LIME}`
                  : "1px solid #1B212A",
              }}
            >
              {f.label}
              {f.count != null ? ` · ${f.count}` : ""}
            </button>
          );
        })}
      </div>

      {filter === "pending" ? (
        <RhCard>
          <RhCardHead
            title={`À valider${pendingItems.length ? ` · ${pendingItems.length}` : ""}`}
            right={
              pendingItems.length > 0 ? (
                <div className="flex flex-wrap items-center gap-2">
                  <RhButton variant="secondary" disabled={busy} onClick={toggleAll}>
                    {allSelected ? "Tout désélectionner" : "Tout sélectionner"}
                  </RhButton>
                  <RhButton
                    disabled={busy || selected.size === 0}
                    onClick={() => void onApproveSelected([...selected])}
                  >
                    Approuver ({selected.size})
                  </RhButton>
                </div>
              ) : undefined
            }
          />
          {pendingItems.length === 0 ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Aucune feuille en attente
            </div>
          ) : (
            pendingItems.map((i) => {
              const checked = selected.has(i.id);
              return (
                <div
                  key={i.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleOne(i.id)}
                    aria-label={`Sélectionner ${i.who}`}
                    className="cursor-pointer"
                  />
                  <RhAvatar
                    initials={i.initials}
                    color={i.color}
                    size={26}
                    src={i.avatarUrl}
                  />
                  <button
                    type="button"
                    className="flex-1 min-w-[140px] border-0 bg-transparent cursor-pointer text-left p-0"
                    onClick={() => i.employeeId && onOpenFiche(i.employeeId)}
                  >
                    <div className="text-[12.5px] font-medium">{i.who}</div>
                    <div
                      className="rh-mono text-[10px]"
                      style={{ color: "#7E8998" }}
                    >
                      {i.meta} · {i.title}
                    </div>
                  </button>
                  <RhButton
                    variant="danger"
                    disabled={busy}
                    onClick={() => void onRefuse(i.id, i.who)}
                  >
                    Refuser
                  </RhButton>
                  <RhButton
                    disabled={busy}
                    onClick={() => void onApprove(i.id, i.who)}
                  >
                    Approuver
                  </RhButton>
                </div>
              );
            })
          )}
        </RhCard>
      ) : null}

      {filter === "missing" ? (
        <RhCard>
          <RhCardHead
            title={`Non envoyées · ${weekLabel(isoYear, isoWeek)}`}
            right={
              <div className="flex flex-wrap items-center gap-2">
                <RhButton
                  variant="secondary"
                  disabled={missingLoading}
                  onClick={() => {
                    const prev = shiftIsoWeek(isoYear, isoWeek, -1);
                    setIsoYear(prev.isoYear);
                    setIsoWeek(prev.isoWeek);
                  }}
                >
                  ← S{String(shiftIsoWeek(isoYear, isoWeek, -1).isoWeek).padStart(2, "0")}
                </RhButton>
                <RhButton
                  variant="secondary"
                  disabled={missingLoading}
                  onClick={() => {
                    const next = shiftIsoWeek(isoYear, isoWeek, 1);
                    setIsoYear(next.isoYear);
                    setIsoWeek(next.isoWeek);
                  }}
                >
                  S{String(shiftIsoWeek(isoYear, isoWeek, 1).isoWeek).padStart(2, "0")} →
                </RhButton>
                <RhButton
                  variant="secondary"
                  disabled={missingLoading}
                  onClick={() => void loadMissing()}
                >
                  Actualiser
                </RhButton>
                <RhButton
                  disabled={busy || missingLoading || !missing.length || remindingId != null}
                  onClick={() => void handleRemindAll()}
                >
                  Rappeler tous
                </RhButton>
              </div>
            }
          />
          {missingLoading ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Chargement…
            </div>
          ) : missing.length === 0 ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Tout le monde a envoyé sa feuille pour S{isoWeek}.
            </div>
          ) : (
            missing.map((m) => {
              const reminderLabel = formatReminderAt(m.lastReminderAt);
              return (
                <div
                  key={m.employeeId}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <RhAvatar
                    initials={m.initials}
                    color={m.color}
                    size={26}
                    src={m.avatarUrl}
                  />
                  <button
                    type="button"
                    className="flex-1 min-w-[160px] border-0 bg-transparent cursor-pointer text-left p-0"
                    onClick={() => onOpenFiche(m.employeeId)}
                  >
                    <div className="text-[12.5px] font-medium">{m.name}</div>
                    <div
                      className="rh-mono text-[10px]"
                      style={{ color: "#7E8998" }}
                    >
                      {m.department} · {m.matricule}
                      {reminderLabel
                        ? ` · rappel le ${reminderLabel}`
                        : " · aucun rappel"}
                      {m.reminderCount > 0 ? ` (${m.reminderCount})` : ""}
                    </div>
                  </button>
                  <RhBadge
                    bg={
                      m.status === "PAUSED"
                        ? "rgba(240,194,78,.15)"
                        : "rgba(242,96,78,.12)"
                    }
                    fg={m.status === "PAUSED" ? "#F0C24E" : "#F2604E"}
                  >
                    {STATUS_LABEL[m.status] || m.status}
                  </RhBadge>
                  <RhButton
                    disabled={busy || remindingId != null}
                    onClick={() => void handleRemind(m)}
                  >
                    {remindingId === m.employeeId ? "…" : "Rappel"}
                  </RhButton>
                </div>
              );
            })
          )}
        </RhCard>
      ) : null}

      {filter === "awaiting" ? (
        <RhCard>
          <RhCardHead
            title={`Signature électronique${sigItems.length ? ` · ${sigItems.length}` : ""}`}
            right={
              <RhButton
                variant="secondary"
                disabled={sigLoading}
                onClick={onRefreshSignatures}
              >
                Actualiser
              </RhButton>
            }
          />
          {sigLoading && !sigItems.length ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Chargement…
            </div>
          ) : sigItems.length === 0 ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Aucune feuille validée en attente de signature
            </div>
          ) : (
            sigItems.map((t) => (
              <div
                key={t.id}
                className="flex flex-wrap items-center gap-3 px-4 py-3"
                style={{ borderBottom: "1px solid #15191F" }}
              >
                <div className="flex-1 min-w-[160px]">
                  <div className="text-[12.5px] font-medium">{t.name}</div>
                  <div
                    className="rh-mono text-[10px]"
                    style={{ color: "#7E8998" }}
                  >
                    S{t.isoWeek} {t.isoYear} ·{" "}
                    {Math.round(t.totalMinutes / 60)} h
                    {t.signatureRequestedAt ? " · envoyée" : ""}
                  </div>
                </div>
                {(t.pdfUrl || t.signedPdfUrl) && (
                  <RhButton
                    variant="secondary"
                    onClick={() =>
                      window.open(
                        t.signedPdfUrl || t.pdfUrl || "",
                        "_blank",
                        "noopener"
                      )
                    }
                  >
                    PDF
                  </RhButton>
                )}
                {t.signatureRequestedAt ? (
                  <RhBadge bg="rgba(70,214,192,.13)" fg="#46D6C0">
                    DocuSeal · en attente
                  </RhBadge>
                ) : (
                  <RhButton
                    disabled={busy}
                    onClick={() => void onRequestSignature(t.id, t.name)}
                  >
                    Envoyer via DocuSeal
                  </RhButton>
                )}
              </div>
            ))
          )}
        </RhCard>
      ) : null}

      {filter === "signed" ? (
        <RhCard>
          <RhCardHead
            title={`Feuilles signées${signedItems.length ? ` · ${signedItems.length}` : ""}`}
            right={
              <RhButton
                variant="secondary"
                disabled={sigLoading}
                onClick={onRefreshSignatures}
              >
                Actualiser
              </RhButton>
            }
          />
          {sigLoading && !signedItems.length ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Chargement…
            </div>
          ) : signedItems.length === 0 ? (
            <div className="p-4 text-[12px]" style={{ color: "#8B95A5" }}>
              Aucune feuille signée pour le moment
            </div>
          ) : (
            signedItems.map((t) => {
              const wLabel = weekLabel(t.isoYear, t.isoWeek);
              const pdfHref =
                t.signedPdfUrl ||
                t.pdfUrl ||
                (t.employeeId
                  ? `/api/rh/timesheets/${wLabel}/pdf?employeeId=${encodeURIComponent(t.employeeId)}`
                  : null);
              const signedLabel = t.signedAt
                ? new Date(t.signedAt).toLocaleDateString("fr-FR", {
                    day: "2-digit",
                    month: "short",
                    year: "numeric",
                  })
                : null;
              return (
                <div
                  key={t.id}
                  className="flex flex-wrap items-center gap-3 px-4 py-3"
                  style={{ borderBottom: "1px solid #15191F" }}
                >
                  <div className="flex-1 min-w-[160px]">
                    <div className="text-[12.5px] font-medium">{t.name}</div>
                    <div
                      className="rh-mono text-[10px]"
                      style={{ color: "#7E8998" }}
                    >
                      S{t.isoWeek} {t.isoYear} ·{" "}
                      {Math.round(t.totalMinutes / 60)} h
                      {signedLabel ? ` · signée le ${signedLabel}` : ""}
                    </div>
                  </div>
                  <RhBadge bg="rgba(70,214,192,.13)" fg="#46D6C0">
                    Signée
                  </RhBadge>
                  {pdfHref ? (
                    <RhButton
                      variant="secondary"
                      onClick={() =>
                        window.open(pdfHref, "_blank", "noopener")
                      }
                    >
                      PDF signé
                    </RhButton>
                  ) : null}
                </div>
              );
            })
          )}
        </RhCard>
      ) : null}
    </div>
  );
}
