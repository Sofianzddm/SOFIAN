"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Mail, Search, Calendar, ExternalLink, X } from "lucide-react";
import { inboundCategoryLabel } from "@/lib/inbound-categories";

type Mail = {
  id: string;
  talentId: string | null;
  talentName: string;
  talentEmail: string;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  extractedBrand: string | null;
  extractedBudget: string | null;
  subject: string;
  draftEmailSubject: string | null;
  draftEmailBody: string | null;
  sentAt: string;
  receivedAt: string;
  status: string;
  category: string;
  priority: string;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    photo: string | null;
  } | null;
};

type ApiResponse = {
  mails: Mail[];
  stats: { total: number; week: number; month: number };
  talentOptions: { id: string; name: string }[];
};

type Period = "all" | "week" | "month";

const ALLOWED = ["HEAD_OF_SALES", "ADMIN", "CASTING_MANAGER"];

function formatDate(dateStr: string) {
  const d = new Date(dateStr);
  return d.toLocaleString("fr-FR", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function relativeDate(dateStr: string) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const h = Math.floor(diff / (1000 * 60 * 60));
  if (h < 1) {
    const min = Math.max(1, Math.floor(diff / (1000 * 60)));
    return `il y a ${min} min`;
  }
  if (h < 24) return `il y a ${h}h`;
  const days = Math.floor(h / 24);
  if (days < 30) return `il y a ${days}j`;
  const months = Math.floor(days / 30);
  return `il y a ${months} mois`;
}

function StatCard({ label, value, hint }: { label: string; value: number; hint?: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-4">
      <p className="text-xs uppercase tracking-wide text-slate-500">{label}</p>
      <p className="mt-1 text-3xl font-semibold text-slate-900">{value}</p>
      {hint && <p className="mt-1 text-xs text-slate-500">{hint}</p>}
    </div>
  );
}

export default function CastingMailsSentPage() {
  const { data: session, status } = useSession();
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [period, setPeriod] = useState<Period>("all");
  const [talentFilter, setTalentFilter] = useState<string>("ALL");
  const [search, setSearch] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");
  const [openMail, setOpenMail] = useState<Mail | null>(null);

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => window.clearTimeout(t);
  }, [search]);

  useEffect(() => {
    if (forbidden || status === "loading") return;
    let cancelled = false;
    (async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        if (period !== "all") params.set("period", period);
        if (talentFilter !== "ALL") params.set("talentId", talentFilter);
        if (debouncedSearch) params.set("search", debouncedSearch);
        const res = await fetch(`/api/casting-mails-sent?${params.toString()}`, {
          cache: "no-store",
          credentials: "include",
        });
        const json = (await res.json()) as ApiResponse;
        if (!cancelled) setData(json);
      } catch {
        if (!cancelled) setData(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [period, talentFilter, debouncedSearch, forbidden, status]);

  const sanitizedBody = useMemo(() => {
    if (!openMail) return "";
    const body = openMail.draftEmailBody || "";
    return body.replace(/<script[\s\S]*?<\/script>/gi, "");
  }, [openMail]);

  if (status === "loading") {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C08B8B]" />
      </div>
    );
  }

  if (forbidden) {
    return (
      <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">
        Acces refuse.
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-2xl font-semibold text-slate-900">Mails envoyés par le Casting</h1>
        <p className="text-sm text-slate-500">
          Toutes les réponses envoyées depuis <strong>leyna@glowupagence.fr</strong> sur les opportunités inbound.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <StatCard label="Total envoyés" value={data?.stats.total ?? 0} hint="Depuis toujours" />
        <StatCard label="Ce mois" value={data?.stats.month ?? 0} hint="30 derniers jours" />
        <StatCard label="Cette semaine" value={data?.stats.week ?? 0} hint="7 derniers jours" />
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3">
        <Calendar className="h-4 w-4 text-slate-500" />
        <div className="flex gap-1">
          {(["all", "month", "week"] as Period[]).map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md px-3 py-1 text-xs font-medium ${
                period === p
                  ? "bg-slate-900 text-white"
                  : "border border-slate-200 bg-white text-slate-700"
              }`}
            >
              {p === "all" ? "Tout" : p === "month" ? "30j" : "7j"}
            </button>
          ))}
        </div>
        <div className="mx-2 h-5 w-px bg-slate-200" />
        <select
          value={talentFilter}
          onChange={(e) => setTalentFilter(e.target.value)}
          className="rounded border border-slate-300 px-2 py-1 text-sm"
        >
          <option value="ALL">Tous les talents</option>
          {(data?.talentOptions ?? []).map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <div className="relative ml-auto">
          <Search className="pointer-events-none absolute left-2 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            placeholder="Rechercher marque, talent, sujet..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-64 rounded border border-slate-300 pl-8 pr-3 py-1 text-sm"
          />
        </div>
      </div>

      <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
        <table className="w-full min-w-[1024px] text-sm">
          <thead className="bg-slate-50 text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Envoyé</th>
              <th className="px-4 py-3 text-left">Talent</th>
              <th className="px-4 py-3 text-left">Marque / Expéditeur</th>
              <th className="px-4 py-3 text-left">Objet envoyé</th>
              <th className="px-4 py-3 text-left">Catégorie</th>
              <th className="px-4 py-3 text-left">Priorité</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center">
                  <Loader2 className="mx-auto h-6 w-6 animate-spin text-[#C08B8B]" />
                </td>
              </tr>
            ) : (data?.mails.length ?? 0) === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-12 text-center text-sm text-slate-500">
                  Aucun mail envoyé sur cette période.
                </td>
              </tr>
            ) : (
              data!.mails.map((m) => (
                <tr key={m.id} className="border-t border-slate-100 hover:bg-slate-50/60">
                  <td className="px-4 py-3 align-top">
                    <div className="text-slate-900">{relativeDate(m.sentAt)}</div>
                    <div className="text-xs text-slate-500">{formatDate(m.sentAt)}</div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="flex items-center gap-2">
                      <div className="relative h-8 w-8 overflow-hidden rounded-full bg-slate-200">
                        {m.talent?.photo ? (
                          <Image src={m.talent.photo} alt="" fill className="object-cover" sizes="32px" />
                        ) : null}
                      </div>
                      <div>
                        <div className="font-medium text-slate-800">{m.talentName}</div>
                        {m.talentId ? (
                          <Link
                            href={`/talents/${m.talentId}`}
                            className="text-xs text-slate-500 underline hover:text-slate-700"
                          >
                            Fiche talent
                          </Link>
                        ) : null}
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <div className="font-medium text-slate-800">
                      {m.extractedBrand || m.senderDomain}
                    </div>
                    <div className="text-xs text-slate-500">
                      {m.senderName ? `${m.senderName} · ` : ""}
                      {m.senderEmail}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    <div className="line-clamp-2">{m.draftEmailSubject || "—"}</div>
                    <div className="mt-1 text-xs text-slate-500">
                      Mail original : {m.subject.slice(0, 80)}
                    </div>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="rounded-full bg-[#F5EBE0] px-2 py-1 text-xs text-[#1A1110]">
                      {inboundCategoryLabel(m.category)}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top">
                    <span className="rounded-full bg-[#C8F285]/50 px-2 py-1 text-xs text-[#1A1110]">
                      {m.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3 align-top text-right">
                    <div className="flex justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setOpenMail(m)}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <Mail className="h-3.5 w-3.5" />
                        Voir le mail
                      </button>
                      <Link
                        href={`/inbound/${m.id}`}
                        className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-700 hover:bg-slate-50"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        Inbound
                      </Link>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {openMail && (
        <div
          className="fixed inset-0 z-[180] flex items-center justify-center bg-black/45 p-4"
          onClick={() => setOpenMail(null)}
        >
          <div
            className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-slate-200 bg-white p-4">
              <div className="min-w-0">
                <p className="text-xs uppercase tracking-wide text-slate-500">Mail envoyé depuis leyna@glowupagence.fr</p>
                <h2 className="mt-1 truncate text-lg font-semibold text-slate-900">
                  {openMail.draftEmailSubject || "(sans objet)"}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  À <strong>{openMail.senderEmail}</strong> · {formatDate(openMail.sentAt)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpenMail(null)}
                className="rounded-md border border-slate-300 p-1.5 text-slate-600 hover:bg-slate-50"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3 p-4">
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-xs text-slate-600">
                <p>
                  <strong>Talent contacté :</strong> {openMail.talentName} ({openMail.talentEmail})
                </p>
                <p>
                  <strong>Marque :</strong> {openMail.extractedBrand || openMail.senderDomain}
                </p>
                {openMail.extractedBudget ? (
                  <p>
                    <strong>Budget mentionné :</strong> {openMail.extractedBudget}
                  </p>
                ) : null}
                <p>
                  <strong>Mail original reçu :</strong> {openMail.subject}
                </p>
              </div>

              <div>
                <p className="mb-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Corps du mail envoyé
                </p>
                {openMail.draftEmailBody ? (
                  <div
                    className="prose prose-sm max-w-none rounded-lg border border-slate-200 bg-white p-4 text-sm text-slate-800"
                    dangerouslySetInnerHTML={{ __html: sanitizedBody }}
                  />
                ) : (
                  <p className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                    Corps du mail non sauvegardé en base.
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
