"use client";

import { FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  ArrowLeft,
  Loader2,
  RefreshCw,
  Search,
  Trash2,
  Send,
  Check,
  Mail,
} from "lucide-react";
import CastingComposer from "@/app/(dashboard)/casting-outreach/CastingComposer";
import {
  STATUS_LABEL,
  canEditBrief,
  canManageBrands,
  canDraft,
  canSend,
  canTransitionTo,
  type CampaignStatus,
} from "@/lib/projets-outreach";

type TabId = "brief" | "marques" | "redaction" | "envois" | "suivi";

type Mission = {
  id: string;
  targetBrand: string;
  marqueId: string | null;
  marqueNom: string | null;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  dos: string | null;
  donts: string | null;
  priority: string;
  status: string;
  stage: string;
  draftEmailSubject: string | null;
  draftEmailBody: string | null;
  clientContacts: Array<{
    firstname?: string;
    lastname?: string;
    email?: string;
    role?: string;
  }> | null;
  marqueContacts?: Array<{
    id: string;
    firstname: string;
    lastname: string;
    email: string;
    role: string;
    linkedinUrl?: string;
  }>;
  scheduledSendAt: string | null;
  sentAt: string | null;
  replied: boolean;
  openedAt: string | null;
  openCount: number;
  clickCount: number;
  relanceSentAt: string | null;
  relance2SentAt: string | null;
  sendError: string | null;
  createdAt: string;
};

function effectiveMissionContacts(m: Mission) {
  // Toujours prioriser la fiche CRM (hors AO) — clientContacts ne sert qu'à
  // mémoriser la sélection d'envoi, pas à masquer les autres contacts.
  const crm = (Array.isArray(m.marqueContacts) ? m.marqueContacts : []).map((c) => ({
    id: c.id,
    firstname: c.firstname,
    lastname: c.lastname,
    email: c.email,
    role: c.role,
    linkedinUrl: c.linkedinUrl || "",
  }));
  if (crm.length > 0) return crm;

  return Array.isArray(m.clientContacts)
    ? m.clientContacts
        .filter((c) => String(c?.email || "").trim())
        .map((c, index) => ({
          id: `manual-${index}-${String(c.email).trim()}`,
          firstname: String(c.firstname || "").trim(),
          lastname: String(c.lastname || "").trim(),
          email: String(c.email || "").trim(),
          role: String(c.role || "").trim(),
          linkedinUrl: "",
        }))
    : [];
}

type Campaign = {
  id: string;
  title: string;
  description: string | null;
  status: CampaignStatus;
  isActive: boolean;
  senderEmail: string | null;
  objective: string | null;
  deliverables: string | null;
  budgetRange: string | null;
  timeline: string | null;
  dos: string | null;
  donts: string | null;
  angles: string | null;
  talent: { id: string; name: string; photo: string | null; instagram: string | null };
  ownerTmName: string | null;
  createdByName: string;
  events: Array<{
    id: string;
    type: string;
    message: string | null;
    createdAt: string;
    actorName: string;
  }>;
  missions: Mission[];
};

type MarqueHit = { id: string; nom: string; ville: string; contactCount: number };

const TABS: { id: TabId; label: string }[] = [
  { id: "brief", label: "Brief" },
  { id: "marques", label: "Marques" },
  { id: "redaction", label: "Rédaction" },
  { id: "envois", label: "Envois" },
  { id: "suivi", label: "Suivi" },
];

const NEXT_STATUS: Partial<Record<CampaignStatus, CampaignStatus>> = {
  BRIEF: "BRANDS",
  BRANDS: "DRAFTING",
  DRAFTING: "SENDING",
  SENDING: "ACTIVE",
};

const CTA_LABEL: Partial<Record<CampaignStatus, string>> = {
  BRIEF: "Passer à Inès (marques)",
  BRANDS: "Prêt pour rédaction (Manon)",
  DRAFTING: "Prêt pour envoi (Leyna)",
  SENDING: "Marquer actif",
};

const STAGE_LABEL: Record<string, string> = {
  STRATEGY_DEFINED: "Strategy",
  TO_DRAFT: "À rédiger",
  DRAFTED_FOR_VALIDATION: "À valider",
  TO_SEND: "À envoyer",
  SENT: "Envoyé",
  RESPONSE_RECEIVED: "Réponse",
  IN_NEGOTIATION: "En négo",
  WON: "Gagné",
  LOST: "Perdu",
};

export function ProjetOutreachWorkspace({ campaignId }: { campaignId: string }) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";

  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [tab, setTab] = useState<TabId>("brief");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaignId}`, { credentials: "include" });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Projet introuvable.");
      setCampaign(data.campaign);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [campaignId]);

  useEffect(() => {
    void load();
  }, [load]);

  const nextStatus = campaign ? NEXT_STATUS[campaign.status] : undefined;
  const canAdvance =
    campaign &&
    nextStatus &&
    canTransitionTo(role, campaign.status, nextStatus);

  async function transition(to: CampaignStatus) {
    setSaving(true);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaignId}/transition`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: to }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transition impossible.");
      setSuccess(`Étape : ${STATUS_LABEL[to]}`);
      await load();
      if (to === "BRANDS") setTab("marques");
      if (to === "DRAFTING") setTab("redaction");
      if (to === "SENDING" || to === "ACTIVE") setTab("envois");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  if (loading && !campaign) {
    return (
      <div className="flex items-center gap-2 p-8 text-sm text-gray-500">
        <Loader2 className="h-4 w-4 animate-spin" /> Chargement du projet…
      </div>
    );
  }

  if (!campaign) {
    return (
      <div className="space-y-4 p-8">
        <p className="text-sm text-red-600">{error || "Projet introuvable."}</p>
        <Link href="/projets-outreach" className="text-sm text-[#C08B8B] hover:underline">
          ← Retour
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-6xl space-y-5 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/projets-outreach"
            className="mb-2 inline-flex items-center gap-1 text-xs text-gray-500 hover:text-[#1A1110]"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Tous les projets
          </Link>
          <h1 className="text-2xl font-semibold text-[#1A1110]">{campaign.title}</h1>
          <p className="mt-1 text-sm text-gray-600">
            Gestion du projet · {campaign.talent.name}
            {campaign.talent.instagram ? ` · @${campaign.talent.instagram.replace(/^@/, "")}` : ""}
          </p>
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            {(["BRIEF", "BRANDS", "DRAFTING", "SENDING", "ACTIVE"] as CampaignStatus[]).map(
              (step, i, arr) => {
                const currentIdx = arr.indexOf(
                  campaign.status === "CLOSED" ? "ACTIVE" : campaign.status
                );
                const done = currentIdx >= i;
                const current = campaign.status === step;
                return (
                  <div key={step} className="flex items-center gap-1.5">
                    <span
                      className={`rounded-full px-2.5 py-1 text-[11px] font-medium ${
                        current
                          ? "bg-[#1A1110] text-white"
                          : done
                            ? "bg-[#C08B8B]/25 text-[#1A1110]"
                            : "bg-gray-100 text-gray-400"
                      }`}
                    >
                      {STATUS_LABEL[step]}
                    </span>
                    {i < arr.length - 1 && <span className="text-gray-300">›</span>}
                  </div>
                );
              }
            )}
            {campaign.status === "CLOSED" && (
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-[11px] text-gray-600">
                Clos
              </span>
            )}
          </div>
          <p className="mt-2 text-xs text-gray-500">
            {campaign.missions.length} marque(s) · envoi {campaign.senderEmail || "leyna@glowupagence.fr"}
            {" · "}créé par {campaign.createdByName}
            {campaign.ownerTmName ? ` · TM ${campaign.ownerTmName}` : ""}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void load()}
            className="inline-flex items-center gap-2 rounded-lg border border-gray-200 bg-white px-3 py-2 text-sm"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
          {canAdvance && nextStatus && (
            <button
              type="button"
              disabled={saving}
              onClick={() => void transition(nextStatus)}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              {CTA_LABEL[campaign.status] || "Avancer"}
            </button>
          )}
          {campaign.status !== "CLOSED" &&
            (canEditBrief(role) || canSend(role)) && (
              <button
                type="button"
                disabled={saving}
                onClick={() => void transition("CLOSED")}
                className="rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-600"
              >
                Clôturer
              </button>
            )}
        </div>
      </div>

      {(error || success) && (
        <div
          className={`rounded-lg border px-4 py-3 text-sm ${
            error
              ? "border-red-200 bg-red-50 text-red-700"
              : "border-emerald-200 bg-emerald-50 text-emerald-800"
          }`}
        >
          {error || success}
        </div>
      )}

      <div className="flex gap-1 overflow-x-auto border-b border-gray-200">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            className={`whitespace-nowrap border-b-2 px-4 py-2.5 text-sm ${
              tab === t.id
                ? "border-[#1A1110] font-medium text-[#1A1110]"
                : "border-transparent text-gray-500 hover:text-[#1A1110]"
            }`}
          >
            {t.label}
            {t.id === "marques" ? ` (${campaign.missions.length})` : ""}
          </button>
        ))}
      </div>

      {tab === "brief" && (
        <BriefTab
          campaign={campaign}
          canEdit={canEditBrief(role)}
          onSaved={load}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {tab === "marques" && (
        <MarquesTab
          campaign={campaign}
          canManage={canManageBrands(role)}
          onChanged={load}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {tab === "redaction" && (
        <RedactionTab
          campaign={campaign}
          canEdit={canDraft(role)}
          onChanged={load}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {tab === "envois" && (
        <EnvoisTab
          campaign={campaign}
          canSendMails={canSend(role) || canDraft(role)}
          onChanged={load}
          setError={setError}
          setSuccess={setSuccess}
        />
      )}
      {tab === "suivi" && <SuiviTab campaign={campaign} />}
    </div>
  );
}

function BriefTab({
  campaign,
  canEdit,
  onSaved,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  onSaved: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const [form, setForm] = useState({
    title: campaign.title,
    description: campaign.description || "",
    objective: campaign.objective || "",
    deliverables: campaign.deliverables || "",
    budgetRange: campaign.budgetRange || "",
    timeline: campaign.timeline || "",
    angles: campaign.angles || "",
    dos: campaign.dos || "",
    donts: campaign.donts || "",
  });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm({
      title: campaign.title,
      description: campaign.description || "",
      objective: campaign.objective || "",
      deliverables: campaign.deliverables || "",
      budgetRange: campaign.budgetRange || "",
      timeline: campaign.timeline || "",
      angles: campaign.angles || "",
      dos: campaign.dos || "",
      donts: campaign.donts || "",
    });
  }, [campaign]);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!canEdit) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaign.id}`, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Sauvegarde impossible.");
      setSuccess("Brief enregistré.");
      await onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_280px]">
      <form onSubmit={onSubmit} className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
        <Field label="Titre" disabled={!canEdit}>
          <input
            disabled={!canEdit}
            value={form.title}
            onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
          />
        </Field>
        <Field label="Description" disabled={!canEdit}>
          <textarea
            disabled={!canEdit}
            rows={2}
            value={form.description}
            onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
          />
        </Field>
        <Field label="Objectif" disabled={!canEdit}>
          <textarea
            disabled={!canEdit}
            rows={3}
            value={form.objective}
            onChange={(e) => setForm((f) => ({ ...f, objective: e.target.value }))}
            className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
          />
        </Field>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="Livrables" disabled={!canEdit}>
            <textarea
              disabled={!canEdit}
              rows={3}
              value={form.deliverables}
              onChange={(e) => setForm((f) => ({ ...f, deliverables: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
          <Field label="Angles" disabled={!canEdit}>
            <textarea
              disabled={!canEdit}
              rows={3}
              value={form.angles}
              onChange={(e) => setForm((f) => ({ ...f, angles: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
          <Field label="Budget" disabled={!canEdit}>
            <input
              disabled={!canEdit}
              value={form.budgetRange}
              onChange={(e) => setForm((f) => ({ ...f, budgetRange: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
          <Field label="Timeline" disabled={!canEdit}>
            <input
              disabled={!canEdit}
              value={form.timeline}
              onChange={(e) => setForm((f) => ({ ...f, timeline: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
          <Field label="Do's" disabled={!canEdit}>
            <textarea
              disabled={!canEdit}
              rows={2}
              value={form.dos}
              onChange={(e) => setForm((f) => ({ ...f, dos: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
          <Field label="Don'ts" disabled={!canEdit}>
            <textarea
              disabled={!canEdit}
              rows={2}
              value={form.donts}
              onChange={(e) => setForm((f) => ({ ...f, donts: e.target.value }))}
              className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm disabled:bg-gray-50"
            />
          </Field>
        </div>
        {canEdit && (
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Enregistrer le brief
            </button>
          </div>
        )}
      </form>

      <aside className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <h3 className="text-sm font-medium text-[#1A1110]">Activité</h3>
        <ul className="space-y-3">
          {campaign.events.length === 0 && (
            <li className="text-xs text-gray-500">Aucune activité.</li>
          )}
          {campaign.events.map((e) => (
            <li key={e.id} className="border-b border-gray-50 pb-2 text-xs last:border-0">
              <div className="text-gray-800">{e.message || e.type}</div>
              <div className="mt-0.5 text-gray-400">
                {e.actorName} · {new Date(e.createdAt).toLocaleString("fr-FR")}
              </div>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}

function MarquesTab({
  campaign,
  canManage,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canManage: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MarqueHit[]>([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState<MarqueHit | null>(null);
  const [manualBrand, setManualBrand] = useState("");
  const [reason, setReason] = useState("");
  const [angle, setAngle] = useState("");
  const [priority, setPriority] = useState("MEDIUM");
  const [contactEmail, setContactEmail] = useState("");
  const [contactFirst, setContactFirst] = useState("");
  const [contactLast, setContactLast] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (query.trim().length < 2) {
      setHits([]);
      return;
    }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/marques/search?q=${encodeURIComponent(query.trim())}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        setHits(Array.isArray(data.marques) ? data.marques : []);
      } finally {
        setSearching(false);
      }
    }, 250);
    return () => clearTimeout(t);
  }, [query]);

  async function addBrand(e: FormEvent) {
    e.preventDefault();
    if (!canManage) return;
    const targetBrand = selected?.nom || manualBrand.trim();
    if (!targetBrand) {
      setError("Le nom de la marque est requis.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const clientContacts =
        contactEmail.trim().length > 0
          ? [
              {
                email: contactEmail.trim(),
                firstname: contactFirst.trim() || undefined,
                lastname: contactLast.trim() || undefined,
              },
            ]
          : null;
      const res = await fetch(`/api/projets-outreach/${campaign.id}/brands`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: [
            {
              targetBrand,
              marqueId: selected?.id ?? null,
              strategyReason: reason.trim(),
              recommendedAngle: angle.trim() || null,
              priority,
              clientContacts,
            },
          ],
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout impossible.");
      setSuccess(`${targetBrand} ajoutée.`);
      setSelected(null);
      setManualBrand("");
      setQuery("");
      setReason("");
      setAngle("");
      setContactEmail("");
      setContactFirst("");
      setContactLast("");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  async function removeMission(missionId: string) {
    if (!canManage) return;
    if (!confirm("Retirer cette marque du projet ?")) return;
    setSaving(true);
    setError(null);
    try {
      const res = await fetch(`/api/projets-outreach/${campaign.id}/brands`, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ missionId }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Suppression impossible.");
      setSuccess("Marque retirée.");
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-5">
      {canManage && (
        <form
          onSubmit={addBrand}
          className="space-y-4 rounded-xl border border-gray-200 bg-white p-5"
        >
          <h3 className="text-sm font-medium text-[#1A1110]">Ajouter une marque</h3>
          <div className="relative">
            <Search className="absolute left-3 top-2.5 h-4 w-4 text-gray-400" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
              placeholder="Rechercher dans le CRM Marques…"
              className="w-full rounded-lg border border-gray-200 py-2 pl-9 pr-3 text-sm"
            />
            {(hits.length > 0 || searching) && !selected && (
              <div className="absolute z-10 mt-1 max-h-56 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                {searching && (
                  <div className="px-3 py-2 text-xs text-gray-500">Recherche…</div>
                )}
                {hits.map((h) => (
                  <button
                    key={h.id}
                    type="button"
                    onClick={() => {
                      setSelected(h);
                      setQuery(h.nom);
                      setHits([]);
                    }}
                    className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                  >
                    <span>{h.nom}</span>
                    <span className="text-xs text-gray-400">{h.contactCount} contact(s)</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          {!selected && (
            <Field label="Ou saisir un nom libre">
              <input
                value={manualBrand}
                onChange={(e) => setManualBrand(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Nouvelle marque"
              />
            </Field>
          )}
          {selected && (
            <div className="rounded-lg bg-[#F5EBE0]/60 px-3 py-2 text-sm">
              Sélection : <strong>{selected.nom}</strong>
            </div>
          )}
          <div className="grid gap-3 md:grid-cols-2">
            <Field label="Raison strategy">
              <textarea
                rows={2}
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
                placeholder="Optionnel"
              />
            </Field>
            <Field label="Angle recommandé">
              <textarea
                rows={2}
                value={angle}
                onChange={(e) => setAngle(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Priorité">
              <select
                value={priority}
                onChange={(e) => setPriority(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              >
                <option value="LOW">Basse</option>
                <option value="MEDIUM">Moyenne</option>
                <option value="HIGH">Haute</option>
                <option value="URGENT">Urgente</option>
              </select>
            </Field>
            <Field label="Email contact (optionnel)">
              <input
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Prénom contact">
              <input
                value={contactFirst}
                onChange={(e) => setContactFirst(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
            <Field label="Nom contact">
              <input
                value={contactLast}
                onChange={(e) => setContactLast(e.target.value)}
                className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm"
              />
            </Field>
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-[#1A1110] px-3 py-2 text-sm text-white disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Ajouter
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Marque</th>
              <th className="px-4 py-3">Raison</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Priorité</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody>
            {campaign.missions.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-gray-500">
                  Aucune marque pour l&apos;instant.
                </td>
              </tr>
            ) : (
              campaign.missions.map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium">
                    {m.marqueNom || m.targetBrand}
                    {m.marqueId && (
                      <Link
                        href={`/marques/${m.marqueId}`}
                        className="ml-2 text-xs text-[#C08B8B] hover:underline"
                      >
                        fiche
                      </Link>
                    )}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-gray-600">{m.strategyReason}</td>
                  <td className="px-4 py-3">{STAGE_LABEL[m.stage] || m.stage}</td>
                  <td className="px-4 py-3">{m.priority}</td>
                  <td className="px-4 py-3 text-right">
                    {canManage && !m.sentAt && (
                      <button
                        type="button"
                        onClick={() => void removeMission(m.id)}
                        className="text-gray-400 hover:text-red-600"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RedactionTab({
  campaign,
  canEdit,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canEdit: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const draftable = useMemo(
    () =>
      campaign.missions.filter(
        (m) =>
          m.stage === "TO_DRAFT" ||
          m.stage === "DRAFTED_FOR_VALIDATION" ||
          m.stage === "STRATEGY_DEFINED" ||
          m.stage === "TO_SEND"
      ),
    [campaign.missions]
  );

  type ComposerContact = {
    company: string;
    contacts: Array<{
      id: string;
      firstname: string;
      lastname: string;
      email: string;
      role?: string;
      linkedinUrl?: string;
    }>;
    initialSubject?: string;
    initialBodyHtml?: string;
    missionBrief: {
      id: string;
      creatorName: string;
      targetBrand: string;
      strategyReason: string;
      recommendedAngle?: string | null;
      objective?: string | null;
      dos?: string | null;
      donts?: string | null;
      priority: "LOW" | "MEDIUM" | "HIGH" | "URGENT";
      status: "READY_FOR_CASTING" | "EMAIL_DRAFTED" | "APPROVED_BY_SALES" | "SENT" | "CANCELLED";
      clientLanguage?: "FR" | "EN" | null;
      clientContacts?: Array<{
        firstname?: string;
        lastname?: string;
        email?: string;
        role?: string;
      }> | null;
      projectTitle?: string | null;
      projectDescription?: string | null;
      deliverables?: string | null;
      angles?: string | null;
      timeline?: string | null;
      budgetRange?: string | null;
    };
  };

  const [composerOpen, setComposerOpen] = useState(false);
  const [composerContact, setComposerContact] = useState<ComposerContact | null>(null);
  const [busy, setBusy] = useState(false);

  function openComposer(m: Mission) {
    const localContacts = effectiveMissionContacts(m);
    const priority = (["LOW", "MEDIUM", "HIGH", "URGENT"].includes(m.priority)
      ? m.priority
      : "MEDIUM") as ComposerContact["missionBrief"]["priority"];
    const status = (
      ["READY_FOR_CASTING", "EMAIL_DRAFTED", "APPROVED_BY_SALES", "SENT", "CANCELLED"].includes(
        m.status
      )
        ? m.status
        : "READY_FOR_CASTING"
    ) as ComposerContact["missionBrief"]["status"];

    setComposerContact({
      company: m.marqueNom || m.targetBrand,
      contacts: localContacts.map((c) => ({
        id: c.id,
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        role: c.role,
        linkedinUrl: c.linkedinUrl,
      })),
      initialSubject: String(m.draftEmailSubject || "").trim(),
      initialBodyHtml: String(m.draftEmailBody || "").trim(),
      missionBrief: {
        id: m.id,
        creatorName: campaign.talent.name,
        targetBrand: m.targetBrand,
        strategyReason: m.strategyReason,
        recommendedAngle: m.recommendedAngle,
        objective: m.objective || campaign.objective,
        dos: m.dos || campaign.dos,
        donts: m.donts || campaign.donts,
        priority,
        status,
        clientLanguage: null,
        clientContacts: localContacts,
        projectTitle: campaign.title,
        projectDescription: campaign.description,
        deliverables: campaign.deliverables,
        angles: campaign.angles,
        timeline: campaign.timeline,
        budgetRange: campaign.budgetRange,
      },
    });
    setComposerOpen(true);
  }

  async function patchMission(
    missionId: string,
    payload: Record<string, unknown>
  ) {
    const res = await fetch("/api/strategy/contact-missions", {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ missionId, ...payload }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Sauvegarde impossible.");
  }

  async function sendFromLeyna(missionId: string) {
    const scheduleRes = await fetch(
      `/api/strategy/contact-missions/${missionId}/schedule-send`,
      {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      }
    );
    const scheduleData = await scheduleRes.json().catch(() => ({}));
    if (!scheduleRes.ok) {
      throw new Error(scheduleData.error || "Planification impossible.");
    }

    const sendRes = await fetch(`/api/strategy/contact-missions/${missionId}/send-now`, {
      method: "POST",
      credentials: "include",
    });
    const sendData = await sendRes.json().catch(() => ({}));
    if (!sendRes.ok) throw new Error(sendData.error || "Envoi impossible.");
    return sendData as { succeeded?: number };
  }

  async function handleComposerSaved(
    status: "pret" | "en_cours" | "reset",
    draft?: {
      subject: string;
      bodyHtml: string;
      language?: "fr" | "en";
      scheduledAt?: string | null;
      selectedContacts?: Array<{
        id: string;
        firstname: string;
        lastname: string;
        email: string;
        role?: string;
        linkedinUrl?: string;
      }>;
    }
  ) {
    const missionId = composerContact?.missionBrief?.id;
    if (!missionId || !canEdit) return;
    setBusy(true);
    setError(null);
    try {
      const draftLanguage: "fr" | "en" = draft?.language === "en" ? "en" : "fr";
      const selected = Array.isArray(draft?.selectedContacts)
        ? draft.selectedContacts.filter((c) => String(c.email || "").trim())
        : [];

      if (status === "en_cours") {
        await patchMission(missionId, {
          stage: "TO_DRAFT",
          status: "EMAIL_DRAFTED",
          draftEmailSubject: draft?.subject ?? "",
          draftEmailBody: draft?.bodyHtml ?? "",
          draftLanguage,
          ...(selected.length > 0
            ? {
                clientContacts: selected.map((c) => ({
                  firstname: c.firstname,
                  lastname: c.lastname,
                  email: c.email,
                  role: c.role || "",
                })),
              }
            : {}),
        });
        setSuccess("Brouillon enregistré.");
        setComposerOpen(false);
        await onChanged();
        return;
      }

      if (status === "pret") {
        if (selected.length === 0) {
          throw new Error(
            "Aucun destinataire sélectionné. Coche au moins un contact de la fiche marque."
          );
        }

        await patchMission(missionId, {
          stage: "DRAFTED_FOR_VALIDATION",
          status: "EMAIL_DRAFTED",
          draftEmailSubject: draft?.subject ?? "",
          draftEmailBody: draft?.bodyHtml ?? "",
          draftLanguage,
          clientContacts: selected.map((c) => ({
            firstname: c.firstname,
            lastname: c.lastname,
            email: c.email,
            role: c.role || "",
          })),
        });

        const sendData = await sendFromLeyna(missionId);
        setSuccess(
          `Envoyé depuis Leyna (${sendData.succeeded ?? 0} destinataire(s)).`
        );
        setComposerOpen(false);
        await onChanged();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusy(false);
    }
  }

  if (draftable.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
        Aucune marque à rédiger. Inès doit d&apos;abord ajouter des marques.
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {draftable.map((m) => {
          const contactCount = effectiveMissionContacts(m).length;
          return (
            <div
              key={m.id}
              className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <div className="font-medium text-[#1A1110]">
                    {m.marqueNom || m.targetBrand}
                  </div>
                  <div className="mt-0.5 text-xs text-gray-500">
                    {STAGE_LABEL[m.stage] || m.stage}
                    {" · "}
                    {contactCount} contact(s)
                  </div>
                </div>
                <Mail className="h-4 w-4 text-[#C08B8B]" />
              </div>
              <p className="mt-2 line-clamp-2 text-xs text-gray-600">{m.strategyReason}</p>
              {canEdit ? (
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => openComposer(m)}
                  className="mt-4 inline-flex items-center justify-center gap-2 rounded-xl bg-[#1A1110] px-3 py-2 text-sm text-white disabled:opacity-50"
                >
                  {m.draftEmailSubject ? "Ouvrir le composer" : "Rédiger le mail"}
                </button>
              ) : (
                <p className="mt-4 text-xs text-amber-700">
                  Rédaction réservée au Casting (Manon).
                </p>
              )}
            </div>
          );
        })}
      </div>

      <CastingComposer
        open={composerOpen}
        contact={composerContact}
        brandColumn="todo"
        useHubspot={false}
        allowSchedule={false}
        lockedTalentId={campaign.talent.id}
        readyLabel="Envoyer depuis Leyna"
        onClose={() => {
          setComposerOpen(false);
          setComposerContact(null);
        }}
        onSaved={(status, draft) => {
          void handleComposerSaved(status, draft);
        }}
        onError={(msg) => setError(msg)}
        onSuccess={(msg) => setSuccess(msg)}
      />
    </div>
  );
}

function EnvoisTab({
  campaign,
  canSendMails,
  onChanged,
  setError,
  setSuccess,
}: {
  campaign: Campaign;
  canSendMails: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
}) {
  const queue = campaign.missions.filter(
    (m) =>
      m.stage === "DRAFTED_FOR_VALIDATION" ||
      m.stage === "TO_SEND" ||
      (m.scheduledSendAt && !m.sentAt)
  );
  const [busyId, setBusyId] = useState<string | null>(null);

  async function scheduleAndSend(missionId: string) {
    if (!canSendMails) return;
    setBusyId(missionId);
    setError(null);
    try {
      const scheduleRes = await fetch(
        `/api/strategy/contact-missions/${missionId}/schedule-send`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({}),
        }
      );
      const scheduleData = await scheduleRes.json().catch(() => ({}));
      if (!scheduleRes.ok) {
        throw new Error(scheduleData.error || "Planification impossible.");
      }

      const sendRes = await fetch(`/api/strategy/contact-missions/${missionId}/send-now`, {
        method: "POST",
        credentials: "include",
      });
      const sendData = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) throw new Error(sendData.error || "Envoi impossible.");

      setSuccess(
        `Envoyé depuis Leyna (${sendData.succeeded ?? 0} destinataire(s)).`
      );
      await onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur");
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="space-y-4">
      {queue.length === 0 ? (
        <div className="rounded-xl border border-dashed border-gray-300 bg-white p-10 text-center text-sm text-gray-500">
          Rien en file d&apos;envoi.
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
          <table className="min-w-full text-left text-sm">
            <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
              <tr>
                <th className="px-4 py-3">Marque</th>
                <th className="px-4 py-3">Objet</th>
                <th className="px-4 py-3">Contacts</th>
                <th className="px-4 py-3">Stage</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody>
              {queue.map((m) => {
                const contacts = Array.isArray(m.clientContacts) ? m.clientContacts : [];
                return (
                  <tr key={m.id} className="border-b border-gray-50">
                    <td className="px-4 py-3 font-medium">{m.marqueNom || m.targetBrand}</td>
                    <td className="max-w-xs truncate px-4 py-3">{m.draftEmailSubject || "—"}</td>
                    <td className="px-4 py-3 text-xs text-gray-600">
                      {contacts.map((c) => c.email).filter(Boolean).join(", ") || "—"}
                    </td>
                    <td className="px-4 py-3">{STAGE_LABEL[m.stage] || m.stage}</td>
                    <td className="px-4 py-3 text-right">
                      {canSendMails && (
                        <button
                          type="button"
                          disabled={busyId === m.id}
                          onClick={() => void scheduleAndSend(m.id)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-[#1A1110] px-3 py-1.5 text-xs text-white disabled:opacity-50"
                        >
                          {busyId === m.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Send className="h-3.5 w-3.5" />
                          )}
                          Envoyer
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SuiviTab({ campaign }: { campaign: Campaign }) {
  const contacted = campaign.missions.filter(
    (m) =>
      m.sentAt ||
      m.stage === "SENT" ||
      m.stage === "RESPONSE_RECEIVED" ||
      m.stage === "IN_NEGOTIATION" ||
      m.stage === "WON" ||
      m.stage === "LOST"
  );

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-4">
        <StatCard label="Marques" value={campaign.missions.length} />
        <StatCard label="Contactées" value={contacted.length} />
        <StatCard
          label="Ouvertures"
          value={campaign.missions.reduce((n, m) => n + (m.openCount || 0), 0)}
        />
        <StatCard
          label="Réponses"
          value={campaign.missions.filter((m) => m.replied || m.stage === "RESPONSE_RECEIVED" || m.stage === "IN_NEGOTIATION" || m.stage === "WON").length}
        />
      </div>

      <div className="overflow-hidden rounded-xl border border-gray-200 bg-white">
        <table className="min-w-full text-left text-sm">
          <thead className="border-b border-gray-100 bg-gray-50 text-xs uppercase text-gray-500">
            <tr>
              <th className="px-4 py-3">Marque</th>
              <th className="px-4 py-3">Stage</th>
              <th className="px-4 py-3">Envoyé</th>
              <th className="px-4 py-3">Opens</th>
              <th className="px-4 py-3">Clics</th>
              <th className="px-4 py-3">Relances</th>
              <th className="px-4 py-3">Erreur</th>
            </tr>
          </thead>
          <tbody>
            {campaign.missions.length === 0 ? (
              <tr>
                <td colSpan={7} className="px-4 py-8 text-center text-gray-500">
                  Pas encore de suivi.
                </td>
              </tr>
            ) : (
              campaign.missions.map((m) => (
                <tr key={m.id} className="border-b border-gray-50">
                  <td className="px-4 py-3 font-medium">{m.marqueNom || m.targetBrand}</td>
                  <td className="px-4 py-3">{STAGE_LABEL[m.stage] || m.stage}</td>
                  <td className="px-4 py-3 text-xs">
                    {m.sentAt ? new Date(m.sentAt).toLocaleString("fr-FR") : "—"}
                  </td>
                  <td className="px-4 py-3">{m.openCount}</td>
                  <td className="px-4 py-3">{m.clickCount}</td>
                  <td className="px-4 py-3 text-xs">
                    {[m.relanceSentAt && "J+3", m.relance2SentAt && "J+10"]
                      .filter(Boolean)
                      .join(" · ") || "—"}
                  </td>
                  <td className="max-w-[160px] truncate px-4 py-3 text-xs text-red-600">
                    {m.sendError || ""}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function Field({
  label,
  children,
  disabled,
}: {
  label: string;
  children: React.ReactNode;
  disabled?: boolean;
}) {
  return (
    <label className={`block text-sm ${disabled ? "opacity-80" : ""}`}>
      <span className="mb-1 block text-gray-600">{label}</span>
      {children}
    </label>
  );
}

function StatCard({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white px-4 py-3">
      <div className="text-xs text-gray-500">{label}</div>
      <div className="mt-1 text-2xl font-semibold text-[#1A1110]">{value}</div>
    </div>
  );
}
