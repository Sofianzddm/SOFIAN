"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Mail,
  Send,
  Handshake,
  Gift,
  Target,
  Inbox,
  FileText,
  Phone,
  StickyNote,
} from "lucide-react";

type TimelineItem = {
  id: string;
  type: string;
  label: string;
  sublabel?: string;
  date: string;
  href?: string;
  meta?: Record<string, unknown>;
};

type CrmCounts = {
  collaborations: number;
  negociations: number;
  demandesGift: number;
  inboundOpportunities: number;
  contactMissions: number;
  opportunitesMarque: number;
  demandesEntrantes: number;
  quotes: number;
  contactNotes?: number;
  contactCalls?: number;
};

const INK = "#16110F";

const TYPE_LABELS: Record<string, string> = {
  INBOUND: "Inbound",
  PIPELINE: "Pipeline",
  NEGO: "Négo",
  COLLAB: "Collab",
  GIFT: "Gift",
  OPPORTUNITE: "Opportunité",
  DEMANDE_ENTRANTE: "Demande",
  DEVIS: "Devis",
  NOTE_CONTACT: "Note",
  APPEL: "Appel",
};

const TYPE_ICONS: Record<string, typeof Inbox> = {
  INBOUND: Inbox,
  PIPELINE: Send,
  NEGO: Target,
  COLLAB: Handshake,
  GIFT: Gift,
  OPPORTUNITE: Mail,
  DEMANDE_ENTRANTE: Inbox,
  DEVIS: FileText,
  NOTE_CONTACT: StickyNote,
  APPEL: Phone,
};

const FILTERS: { id: string; label: string; countKey?: keyof CrmCounts }[] = [
  { id: "ALL", label: "Tous" },
  { id: "INBOUND", label: "Inbound", countKey: "inboundOpportunities" },
  { id: "PIPELINE", label: "Pipeline", countKey: "contactMissions" },
  { id: "NEGO", label: "Négo", countKey: "negociations" },
  { id: "COLLAB", label: "Collab", countKey: "collaborations" },
  { id: "GIFT", label: "Gift", countKey: "demandesGift" },
  { id: "OPPORTUNITE", label: "Opportunité", countKey: "opportunitesMarque" },
  { id: "DEMANDE_ENTRANTE", label: "Demande", countKey: "demandesEntrantes" },
  { id: "DEVIS", label: "Devis", countKey: "quotes" },
  { id: "NOTE_CONTACT", label: "Notes", countKey: "contactNotes" },
  { id: "APPEL", label: "Appels", countKey: "contactCalls" },
];

function monthKey(iso: string): string {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const d = new Date(y, m - 1, 1);
  return d.toLocaleDateString("fr-FR", { month: "long", year: "numeric" });
}

function statusLabel(meta?: Record<string, unknown>): string | null {
  if (!meta) return null;
  const raw = meta.status ?? meta.statut;
  if (raw == null || raw === "") return null;
  return String(raw);
}

export function MarqueCrmTab({
  marqueId,
  limit,
  hideFilters,
}: {
  marqueId: string;
  /** Si défini, n'affiche que les N derniers items (Overview). */
  limit?: number;
  hideFilters?: boolean;
}) {
  const [loading, setLoading] = useState(true);
  const [timeline, setTimeline] = useState<TimelineItem[]>([]);
  const [counts, setCounts] = useState<CrmCounts | null>(null);
  const [filter, setFilter] = useState("ALL");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/marques/${marqueId}/crm`);
        if (res.ok) {
          const data = await res.json();
          if (!cancelled) {
            setTimeline(data.timeline || []);
            setCounts(data.counts || null);
          }
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [marqueId]);

  const filtered = useMemo(() => {
    const base =
      filter === "ALL" ? timeline : timeline.filter((t) => t.type === filter);
    return typeof limit === "number" ? base.slice(0, limit) : base;
  }, [timeline, filter, limit]);

  const grouped = useMemo(() => {
    const map = new Map<string, TimelineItem[]>();
    for (const item of filtered) {
      const key = monthKey(item.date);
      const list = map.get(key) || [];
      list.push(item);
      map.set(key, list);
    }
    return Array.from(map.entries());
  }, [filtered]);

  const totalAll = counts
    ? Object.values(counts).reduce((a, b) => a + b, 0)
    : timeline.length;

  if (loading) {
    return (
      <div className="flex justify-center py-12">
        <Loader2 className="w-6 h-6 animate-spin" style={{ color: "#C08B8B" }} />
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {!hideFilters && (
        <div
          className="flex items-center gap-1.5 overflow-x-auto pb-1"
          style={{ scrollbarWidth: "none" }}
        >
          {FILTERS.map((f) => {
            const n =
              f.id === "ALL"
                ? totalAll
                : f.countKey && counts
                  ? counts[f.countKey]
                  : 0;
            const active = filter === f.id;
            if (f.id !== "ALL" && n === 0) return null;
            return (
              <button
                key={f.id}
                type="button"
                onClick={() => setFilter(f.id)}
                className={`shrink-0 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[12px] font-medium transition-colors ${
                  active
                    ? "text-white"
                    : "text-gray-600 bg-white ring-1 ring-black/[0.08] hover:bg-gray-50"
                }`}
                style={active ? { backgroundColor: INK } : undefined}
              >
                {f.label}
                <span
                  className={`tabular-nums text-[10px] font-bold ${
                    active ? "text-white/70" : "text-gray-400"
                  }`}
                >
                  {n}
                </span>
              </button>
            );
          })}
        </div>
      )}

      {filtered.length === 0 ? (
        <p className="text-[13px] text-gray-400 py-8 text-center">
          Aucune activité liée pour l&apos;instant.
        </p>
      ) : (
        <div className="space-y-6">
          {grouped.map(([key, items]) => (
            <div key={key}>
              {!limit && (
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-3 capitalize">
                  {monthLabel(key)}
                </p>
              )}
              <ul className="relative space-y-0">
                <div
                  className="absolute left-[15px] top-2 bottom-2 w-px bg-black/[0.06]"
                  aria-hidden
                />
                {items.map((item) => {
                  const Icon = TYPE_ICONS[item.type] || Inbox;
                  const status = statusLabel(item.meta);
                  const inner = (
                    <div className="relative flex items-start gap-3 py-2.5 pl-0 hover:bg-gray-50/80 rounded-lg px-1 -mx-1 transition-colors">
                      <div
                        className="relative z-[1] w-8 h-8 rounded-full bg-white ring-1 ring-black/[0.08] flex items-center justify-center shrink-0"
                      >
                        <Icon className="w-3.5 h-3.5 text-gray-500" />
                      </div>
                      <div className="min-w-0 flex-1 pt-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[11px] font-semibold text-gray-500">
                            {TYPE_LABELS[item.type] || item.type}
                          </span>
                          {status && (
                            <span className="text-[10px] font-medium px-1.5 py-0.5 rounded bg-gray-100 text-gray-600">
                              {status}
                            </span>
                          )}
                          <span className="text-[11px] text-gray-400 ml-auto tabular-nums">
                            {new Date(item.date).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                              year: "numeric",
                            })}
                          </span>
                        </div>
                        <p
                          className="text-[13px] font-medium truncate mt-0.5"
                          style={{ color: INK }}
                        >
                          {item.label}
                        </p>
                        {item.sublabel && (
                          <p className="text-[12px] text-gray-400 truncate">
                            {item.sublabel}
                          </p>
                        )}
                      </div>
                    </div>
                  );
                  return (
                    <li key={item.id}>
                      {item.href ? (
                        <Link href={item.href} className="block">
                          {inner}
                        </Link>
                      ) : (
                        inner
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
