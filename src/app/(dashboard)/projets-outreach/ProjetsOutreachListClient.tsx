"use client";

import { FormEvent, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { Loader2, Plus, RefreshCw, ArrowRight, FolderKanban } from "lucide-react";
import {
  STATUS_LABEL,
  CAMPAIGN_STATUSES,
  canCreateCampaign,
  type CampaignStatus,
} from "@/lib/projets-outreach";

type CampaignRow = {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  isActive: boolean;
  talentId: string;
  talentName: string;
  talentPhoto: string | null;
  ownerTmName: string | null;
  createdByName: string;
  createdAt: string;
  updatedAt: string;
  missionCount: number;
  sentCount: number;
  answeredCount: number;
  budgetRange: string | null;
  objective: string | null;
};

type TalentOption = { id: string; name: string };

const STATUS_COLORS: Record<CampaignStatus, string> = {
  BRIEF: "bg-amber-50 text-amber-800 border-amber-200",
  BRANDS: "bg-violet-50 text-violet-800 border-violet-200",
  DRAFTING: "bg-sky-50 text-sky-800 border-sky-200",
  SENDING: "bg-orange-50 text-orange-800 border-orange-200",
  ACTIVE: "bg-emerald-50 text-emerald-800 border-emerald-200",
  CLOSED: "bg-gray-100 text-gray-600 border-gray-200",
};

const PIPELINE: CampaignStatus[] = ["BRIEF", "BRANDS", "DRAFTING", "SENDING", "ACTIVE"];

export function ProjetsOutreachListClient() {
  const router = useRouter();
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const canCreate = canCreateCampaign(role);

  const [campaigns, setCampaigns] = useState<CampaignRow[]>([]);
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showCreate, setShowCreate] = useState(false);
  const [saving, setSaving] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [form, setForm] = useState({
    title: "",
    talentId: "",
    description: "",
    objective: "",
    deliverables: "",
    budgetRange: "",
    timeline: "",
    dos: "",
    donts: "",
    angles: "",
  });

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const qs = statusFilter ? `?status=${statusFilter}` : "";
      const res = await fetch(`/api/projets-outreach${qs}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger les projets.");
      setCampaigns(Array.isArray(data.campaigns) ? data.campaigns : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!canCreate) return;
    void (async () => {
      const res = await fetch("/api/talents?presskit=true", { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const list = Array.isArray(data.talents) ? data.talents : [];
      setTalents(
        list.map((t: { id: string; name: string }) => ({
          id: String(t.id),
          name: String(t.name || ""),
        }))
      );
    })();
  }, [canCreate]);

  async function onCreate(e: FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const res = await fetch("/api/projets-outreach", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Création impossible.");
      router.push(`/projets-outreach/${data.campaign.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
      setSaving(false);
    }
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-[#1A1110]">Projets outreach</h1>
          <p className="mt-1 text-sm text-gray-600">
            Tous tes projets. Ouvre-en un pour gérer brief, marques, mails et suivi.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm hover:bg-gray-50"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate((v) => !v)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-2 text-sm text-white hover:bg-black"
            >
              <Plus className="h-4 w-4" />
              Nouveau projet
            </button>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-2">
        <FilterChip active={!statusFilter} onClick={() => setStatusFilter("")} label="Tous" />
        {CAMPAIGN_STATUSES.map((s) => (
          <FilterChip
            key={s}
            active={statusFilter === s}
            onClick={() => setStatusFilter(s)}
            label={STATUS_LABEL[s]}
          />
        ))}
      </div>

      {showCreate && canCreate && (
        <form
          onSubmit={onCreate}
          className="space-y-4 rounded-2xl border border-gray-200 bg-white p-5 shadow-sm"
        >
          <h2 className="text-lg font-medium text-[#1A1110]">Nouveau projet</h2>
          <div className="grid gap-4 md:grid-cols-2">
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Talent *</span>
              <select
                required
                value={form.talentId}
                onChange={(e) => setForm((f) => ({ ...f, talentId: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              >
                <option value="">Sélectionner…</option>
                {talents.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.name}
                  </option>
                ))}
              </select>
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Nom du projet *</span>
              <input
                required
                value={form.title}
                onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                placeholder="Ex. Placement printemps · Séjour ski · Collab beauté"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">En deux mots</span>
              <textarea
                value={form.description}
                onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                placeholder="Ce qu’on veut placer / vendre aux marques"
              />
            </label>
            <label className="block text-sm md:col-span-2">
              <span className="mb-1 block text-gray-600">Objectif</span>
              <textarea
                value={form.objective}
                onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Livrables</span>
              <textarea
                value={form.deliverables}
                onChange={(e) => setForm((f) => ({ ...f, deliverables: e.target.value }))}
                rows={2}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
              />
            </label>
            <label className="block text-sm">
              <span className="mb-1 block text-gray-600">Budget</span>
              <input
                value={form.budgetRange}
                onChange={(e) => setForm((f) => ({ ...f, budgetRange: e.target.value }))}
                className="w-full rounded-lg border border-gray-200 px-3 py-2"
                placeholder="Ex. 5–8k €"
              />
            </label>
          </div>
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => setShowCreate(false)}
              className="rounded-lg border border-gray-200 px-3 py-2 text-sm"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Créer et ouvrir
            </button>
          </div>
        </form>
      )}

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin" />
          Chargement…
        </div>
      ) : campaigns.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white px-8 py-14 text-center">
          <FolderKanban className="mx-auto h-10 w-10 text-gray-300" />
          <p className="mt-3 text-base font-medium text-[#1A1110]">Aucun projet pour l’instant</p>
          <p className="mt-1 text-sm text-gray-500">
            Crée un projet autour d’un talent, puis gère marques, mails et suivi dedans.
          </p>
          {canCreate && (
            <button
              type="button"
              onClick={() => setShowCreate(true)}
              className="mt-5 inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-4 py-2 text-sm text-white"
            >
              <Plus className="h-4 w-4" />
              Créer un projet
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-3">
          {campaigns.map((c) => (
            <Link
              key={c.id}
              href={`/projets-outreach/${c.id}`}
              className="group block rounded-2xl border border-gray-200 bg-white p-4 shadow-sm transition hover:border-[#1A1110]/25 hover:shadow-md"
            >
              <div className="flex items-start gap-4">
                <div className="relative h-12 w-12 flex-shrink-0 overflow-hidden rounded-full bg-gray-100">
                  {c.talentPhoto ? (
                    <Image src={c.talentPhoto} alt="" fill className="object-cover" sizes="48px" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center text-sm font-medium text-gray-400">
                      {c.talentName.slice(0, 1)}
                    </div>
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="truncate text-base font-semibold text-[#1A1110]">{c.title}</h2>
                    <span
                      className={`inline-flex rounded-full border px-2 py-0.5 text-xs ${STATUS_COLORS[c.status]}`}
                    >
                      {STATUS_LABEL[c.status]}
                    </span>
                  </div>
                  <p className="mt-0.5 text-sm text-gray-600">
                    {c.talentName}
                    {c.ownerTmName ? ` · TM ${c.ownerTmName}` : ""}
                    {c.budgetRange ? ` · ${c.budgetRange}` : ""}
                  </p>
                  {c.objective || c.description ? (
                    <p className="mt-1 line-clamp-1 text-xs text-gray-500">
                      {c.objective || c.description}
                    </p>
                  ) : null}

                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    {PIPELINE.map((step, i) => {
                      const currentIdx = PIPELINE.indexOf(
                        c.status === "CLOSED" ? "ACTIVE" : c.status
                      );
                      const done = i <= currentIdx;
                      return (
                        <div key={step} className="flex items-center gap-1.5">
                          <span
                            className={`rounded-full px-2 py-0.5 text-[10px] font-medium ${
                              done
                                ? "bg-[#1A1110] text-white"
                                : "bg-gray-100 text-gray-400"
                            }`}
                          >
                            {STATUS_LABEL[step]}
                          </span>
                          {i < PIPELINE.length - 1 && (
                            <span className="text-gray-300">›</span>
                          )}
                        </div>
                      );
                    })}
                  </div>

                  <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-500">
                    <span>
                      <strong className="text-[#1A1110]">{c.missionCount}</strong> marques
                    </span>
                    <span>
                      <strong className="text-[#1A1110]">{c.sentCount}</strong> contactées
                    </span>
                    <span>
                      <strong className="text-[#1A1110]">{c.answeredCount}</strong> réponses
                    </span>
                  </div>
                </div>
                <div className="flex flex-shrink-0 items-center gap-1 text-sm text-[#C08B8B] group-hover:text-[#1A1110]">
                  Gérer
                  <ArrowRight className="h-4 w-4 transition group-hover:translate-x-0.5" />
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3 py-1 text-xs ${
        active
          ? "border-[#1A1110] bg-[#1A1110] text-white"
          : "border-gray-200 bg-white text-gray-600 hover:bg-gray-50"
      }`}
    >
      {label}
    </button>
  );
}
