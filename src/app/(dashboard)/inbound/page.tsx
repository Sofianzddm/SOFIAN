"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Mail, Filter } from "lucide-react";

type InboundStatus = "NEW" | "IN_REVIEW" | "CONVERTED" | "ARCHIVED";
type InboundPriority = "LOW" | "MEDIUM" | "HIGH" | "URGENT";

type Opportunity = {
  id: string;
  talentName: string;
  senderEmail: string;
  senderName?: string | null;
  senderDomain: string;
  subject: string;
  category: string;
  confidence: number;
  priority: InboundPriority;
  receivedAt: string;
  status: InboundStatus;
  extractedBrand?: string | null;
  talentId?: string | null;
};

const ALLOWED = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"];
const STATUS_ORDER: InboundStatus[] = ["NEW", "IN_REVIEW", "CONVERTED", "ARCHIVED"];

function relativeDate(dateStr: string) {
  const d = new Date(dateStr).getTime();
  const diff = Date.now() - d;
  const h = Math.floor(diff / (1000 * 60 * 60));
  if (h < 1) return "il y a quelques minutes";
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  return `il y a ${days}j`;
}

export default function InboundPage() {
  const { data: session, status } = useSession();
  const [items, setItems] = useState<Opportunity[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<InboundStatus | "ALL">("NEW");
  const [priorityFilter, setPriorityFilter] = useState<InboundPriority | "ALL">("ALL");
  const [talentFilter, setTalentFilter] = useState<string>("ALL");

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);

  useEffect(() => {
    if (forbidden) return;
    if (status === "loading") return;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (statusFilter !== "ALL") params.set("status", statusFilter);
        const res = await fetch(`/api/inbound/opportunities?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        setItems(Array.isArray(data.opportunities) ? data.opportunities : []);
      } finally {
        setLoading(false);
      }
    })();
  }, [statusFilter, forbidden, status]);

  const talents = useMemo(() => {
    const map = new Map<string, string>();
    for (const o of items) {
      if (o.talentId) map.set(o.talentId, o.talentName);
    }
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }));
  }, [items]);

  const filtered = useMemo(
    () =>
      items.filter((o) => {
        if (priorityFilter !== "ALL" && o.priority !== priorityFilter) return false;
        if (talentFilter !== "ALL" && o.talentId !== talentFilter) return false;
        return true;
      }),
    [items, priorityFilter, talentFilter]
  );

  const counts = useMemo(() => {
    const c: Record<InboundStatus, number> = {
      NEW: 0,
      IN_REVIEW: 0,
      CONVERTED: 0,
      ARCHIVED: 0,
    };
    for (const o of items) c[o.status] += 1;
    return c;
  }, [items]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C08B8B]" />
      </div>
    );
  }

  if (forbidden) {
    return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">Acces refuse.</div>;
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Inbound Opportunities</h1>
        <p className="text-sm text-slate-500">Opportunites detectees dans les boites mails des talents.</p>
      </div>

      <div className="flex flex-wrap gap-2">
        {STATUS_ORDER.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatusFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-sm ${
              statusFilter === s ? "bg-slate-900 text-white" : "bg-white border border-slate-200 text-slate-700"
            }`}
          >
            {s === "NEW" ? "Nouvelles" : s === "IN_REVIEW" ? "En revue" : s === "CONVERTED" ? "Converties" : "Archivees"} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Filter className="h-4 w-4 text-slate-500" />
        <select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value as any)} className="rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="ALL">Toutes priorites</option>
          <option value="LOW">LOW</option>
          <option value="MEDIUM">MEDIUM</option>
          <option value="HIGH">HIGH</option>
          <option value="URGENT">URGENT</option>
        </select>
        <select value={talentFilter} onChange={(e) => setTalentFilter(e.target.value)} className="rounded border border-slate-300 px-2 py-1 text-sm">
          <option value="ALL">Tous les talents</option>
          {talents.map((t) => (
            <option key={t.id} value={t.id}>{t.name}</option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[980px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Recu par</th>
              <th className="px-4 py-3 text-left">Marque</th>
              <th className="px-4 py-3 text-left">Sujet</th>
              <th className="px-4 py-3 text-left">Categorie</th>
              <th className="px-4 py-3 text-left">Priorite</th>
              <th className="px-4 py-3 text-left">Confiance IA</th>
              <th className="px-4 py-3 text-left">Date</th>
              <th className="px-4 py-3 text-left">Action</th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} className="border-t border-slate-100">
                <td className="px-4 py-3 font-medium text-slate-800">{o.talentName}</td>
                <td className="px-4 py-3 text-slate-700">
                  <div>{o.extractedBrand || o.senderDomain}</div>
                  <div className="text-xs text-slate-500">{o.senderName || o.senderEmail}</div>
                </td>
                <td className="px-4 py-3 text-slate-700">{o.subject.slice(0, 60)}</td>
                <td className="px-4 py-3"><span className="rounded-full bg-[#F5EBE0] px-2 py-1 text-xs text-[#1A1110]">{o.category}</span></td>
                <td className="px-4 py-3"><span className="rounded-full bg-[#C8F285]/50 px-2 py-1 text-xs text-[#1A1110]">{o.priority}</span></td>
                <td className="px-4 py-3">
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded bg-slate-100">
                      <div className="h-2 rounded bg-[#C08B8B]" style={{ width: `${Math.round((o.confidence || 0) * 100)}%` }} />
                    </div>
                    <span className="text-xs text-slate-600">{Math.round((o.confidence || 0) * 100)}%</span>
                  </div>
                </td>
                <td className="px-4 py-3 text-slate-600">{relativeDate(o.receivedAt)}</td>
                <td className="px-4 py-3">
                  <Link href={`/inbound/${o.id}`} className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50">
                    <Mail className="h-3.5 w-3.5" />
                    Voir
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && <div className="p-6 text-center text-sm text-slate-500">Aucune opportunite.</div>}
      </div>
    </div>
  );
}
