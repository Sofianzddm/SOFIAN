"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  X,
  ExternalLink,
  LayoutDashboard,
  Users,
  Mail,
  FileText,
  StickyNote,
  Loader2,
  Plus,
  Copy,
  Check,
  Eye,
  Trash2,
  Send,
  Reply,
  Clock,
  TrendingUp,
  Wallet,
  Sparkles,
  PenSquare,
} from "lucide-react";
import { type Proposal, type ParticipantLite } from "./propositions-tab";

type DealRoomOpportunite = {
  id: string;
  nomMarque: string;
  marqueId?: string | null;
  secteur: string | null;
  angleNote: string | null;
  budgetEstime: number | null;
  typeActivation: string | null;
  talents: unknown;
  statut: string;
  contactQualifie: boolean;
  lastEmailSentAt?: string | null;
  lastEmailFrom?: string | null;
  emailSubject?: string | null;
  emailOpenedAt?: string | null;
  emailOpenCount?: number;
  emailRepliedAt?: string | null;
  relanceSentAt?: string | null;
  updatedAt?: string;
  contacts?: unknown;
};

type TalentOption = {
  id: string;
  prenom: string;
  nom: string;
  instagram?: string | null;
  photo?: string | null;
  niches?: string[];
};

type Section = "overview" | "talents" | "prospection" | "propositions" | "notes";

const SECTIONS: Array<{ key: Section; label: string; icon: React.ReactNode }> = [
  { key: "overview", label: "Synthèse", icon: <LayoutDashboard className="h-4 w-4" /> },
  { key: "talents", label: "Talents", icon: <Users className="h-4 w-4" /> },
  { key: "prospection", label: "Prospection", icon: <Mail className="h-4 w-4" /> },
  { key: "propositions", label: "Propositions", icon: <FileText className="h-4 w-4" /> },
  { key: "notes", label: "Notes", icon: <StickyNote className="h-4 w-4" /> },
];

const PIPELINE_STATUSES = [
  { key: "IDENTIFIEE", label: "Identifiée" },
  { key: "CONTACTEE", label: "Contactée" },
  { key: "EN_NEGO", label: "En négo" },
  { key: "SIGNEE", label: "Signée" },
  { key: "PERDUE", label: "Perdue" },
] as const;

function asArrayIds(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function asContacts(v: unknown): Array<{ firstName?: string; lastName?: string; email?: string; role?: string }> {
  if (!Array.isArray(v)) return [];
  return v
    .map((c) =>
      typeof c === "object" && c
        ? {
            firstName: String((c as { firstName?: string }).firstName || ""),
            lastName: String((c as { lastName?: string }).lastName || ""),
            email: String((c as { email?: string }).email || ""),
            role: String((c as { role?: string }).role || ""),
          }
        : null
    )
    .filter(Boolean) as Array<{ firstName?: string; lastName?: string; email?: string; role?: string }>;
}

function decodeClientLang(angleNote?: string | null): { language: "FR" | "EN" | ""; cleanNote: string } {
  const raw = (angleNote || "").trim();
  const match = raw.match(/^\[CLIENT_LANG:(FR|EN)\]\s*/);
  const language = (match?.[1] as "FR" | "EN" | undefined) || "";
  return { language, cleanNote: raw.replace(/^\[CLIENT_LANG:(FR|EN)\]\s*/, "") };
}

function encodeClientLang(cleanNote: string, language: "FR" | "EN" | ""): string | null {
  const note = (cleanNote || "").trim();
  if (!language) return note || null;
  return note ? `[CLIENT_LANG:${language}] ${note}` : `[CLIENT_LANG:${language}]`;
}

function formatCompact(n?: number | null): string {
  if (n == null || Number.isNaN(n)) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 === 0 ? 0 : 1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(n % 1_000 === 0 ? 0 : 1)}K`;
  return String(n);
}

function money(n?: number | null): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function initials(name: string): string {
  return name.split(" ").filter(Boolean).slice(0, 2).map((s) => s[0]?.toUpperCase() || "").join("");
}

function statusBadgeClass(statut: string): string {
  switch (statut) {
    case "SIGNEE":
      return "bg-emerald-100 text-emerald-700";
    case "EN_NEGO":
      return "bg-amber-100 text-amber-700";
    case "CONTACTEE":
      return "bg-sky-100 text-sky-700";
    case "PERDUE":
      return "bg-gray-200 text-gray-600";
    default:
      return "bg-orange-100 text-orange-700";
  }
}

export function BrandDealRoom({
  opportunite,
  projetSlug,
  projetNom,
  talentNameById,
  talentPhotoById,
  talentOptions,
  participants,
  isAdmin,
  canSendProspection,
  onClose,
  onRefresh,
  onSendEmail,
  onSignDeal,
  onDelete,
}: {
  opportunite: DealRoomOpportunite;
  projetSlug: string;
  projetNom: string;
  talentNameById: Map<string, string>;
  talentPhotoById: Map<string, string | null>;
  talentOptions: TalentOption[];
  participants: ParticipantLite[];
  isAdmin: boolean;
  canSendProspection: boolean;
  onClose: () => void;
  onRefresh: () => void | Promise<void>;
  onSendEmail: (opp: DealRoomOpportunite) => void;
  onSignDeal: (opp: DealRoomOpportunite) => void;
  onDelete: (id: string) => void;
}) {
  const router = useRouter();
  const [section, setSection] = useState<Section>("overview");
  const [busy, setBusy] = useState(false);

  // Talents
  const [editTalents, setEditTalents] = useState(false);
  const [talentIds, setTalentIds] = useState<string[]>(asArrayIds(opportunite.talents));

  // Notes
  const initialNote = decodeClientLang(opportunite.angleNote);
  const [note, setNote] = useState(initialNote.cleanNote);
  const [lang, setLang] = useState<"FR" | "EN" | "">(initialNote.language || "FR");

  // Propositions
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [propLoading, setPropLoading] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const statsById = useMemo(() => {
    const m = new Map<string, { followers: number | null; engagement: number | null; handle: string | null }>();
    for (const p of participants) {
      m.set(p.talentId, { followers: p.talent.abonnes, engagement: p.talent.engagement, handle: p.talent.handle });
    }
    return m;
  }, [participants]);

  const talentOptionById = useMemo(() => {
    const m = new Map<string, TalentOption>();
    for (const t of talentOptions) m.set(t.id, t);
    return m;
  }, [talentOptions]);

  const matchedTalents = useMemo(
    () =>
      asArrayIds(opportunite.talents).map((id) => {
        const st = statsById.get(id);
        const opt = talentOptionById.get(id);
        return {
          id,
          name: talentNameById.get(id) || id,
          photo: talentPhotoById.get(id) || null,
          handle: st?.handle || opt?.instagram || null,
          followers: st?.followers ?? null,
          engagement: st?.engagement ?? null,
          niche: opt?.niches?.[0] || null,
        };
      }),
    [opportunite.talents, statsById, talentOptionById, talentNameById, talentPhotoById]
  );

  const totalAudience = useMemo(
    () => matchedTalents.reduce((s, t) => s + (t.followers || 0), 0),
    [matchedTalents]
  );
  const avgEngagement = useMemo(() => {
    const vals = matchedTalents.map((t) => t.engagement).filter((v): v is number => typeof v === "number");
    if (vals.length === 0) return null;
    return vals.reduce((s, v) => s + v, 0) / vals.length;
  }, [matchedTalents]);

  const contacts = asContacts(opportunite.contacts);
  const hasContacts = contacts.some((c) => c.email);

  const loadProposals = useCallback(async () => {
    setPropLoading(true);
    try {
      const res = await fetch(`/api/strategy/propositions?projetSlug=${encodeURIComponent(projetSlug)}`);
      if (res.ok) {
        const json = await res.json();
        const all: Proposal[] = json.proposals || [];
        setProposals(
          all.filter((p) => p.nomMarque.trim().toLowerCase() === opportunite.nomMarque.trim().toLowerCase())
        );
      }
    } finally {
      setPropLoading(false);
    }
  }, [projetSlug, opportunite.nomMarque]);

  useEffect(() => {
    if (section === "propositions") void loadProposals();
  }, [section, loadProposals]);

  async function changeStatus(next: string) {
    if (next === opportunite.statut) return;
    if (next === "SIGNEE") {
      onSignDeal(opportunite);
      return;
    }
    setBusy(true);
    try {
      await fetch(`/api/strategy/opportunites/${opportunite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: next }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveTalents() {
    setBusy(true);
    try {
      await fetch(`/api/strategy/opportunites/${opportunite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talents: talentIds }),
      });
      setEditTalents(false);
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function saveNotes() {
    setBusy(true);
    try {
      await fetch(`/api/strategy/opportunites/${opportunite.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ angleNote: encodeClientLang(note, lang) }),
      });
      await onRefresh();
    } finally {
      setBusy(false);
    }
  }

  async function createProposal() {
    setBusy(true);
    try {
      const res = await fetch("/api/strategy/propositions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projetSlug,
          nomMarque: opportunite.nomMarque,
          title: `${projetNom} × ${opportunite.nomMarque}`,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Erreur lors de la création.");
        return;
      }
      const created = json.proposal as Proposal;
      const casting = matchedTalents.map((t) => ({
        talentId: t.id,
        name: t.name,
        handle: t.handle,
        photoUrl: t.photo,
        followers: t.followers,
        engagement: t.engagement,
        platforms: t.handle ? ["Instagram"] : [],
        role: t.niche,
      }));
      const budgetLines = opportunite.budgetEstime
        ? [{ label: "Budget global estimé", amount: opportunite.budgetEstime }]
        : [];
      await fetch(`/api/strategy/propositions/${created.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          casting,
          budgetLines,
          subtitle: projetNom,
        }),
      });
      router.push(`/strategy/propositions/${created.id}`);
    } finally {
      setBusy(false);
    }
  }

  async function deleteProposal(id: string) {
    if (!window.confirm("Supprimer cette proposition ? Le lien public ne fonctionnera plus.")) return;
    await fetch(`/api/strategy/propositions/${id}`, { method: "DELETE" });
    await loadProposals();
  }

  function copyLink(prop: Proposal) {
    void navigator.clipboard.writeText(`${window.location.origin}${prop.publicUrl}`);
    setCopiedId(prop.id);
    setTimeout(() => setCopiedId((c) => (c === prop.id ? null : c)), 1800);
  }

  const cleanNote = decodeClientLang(opportunite.angleNote).cleanNote;

  return (
    <div className="fixed inset-0 z-50 flex bg-black/40">
      <div className="ml-auto flex h-full w-full max-w-5xl flex-col bg-gray-50 shadow-2xl">
        {/* Header */}
        <div className="flex items-start justify-between gap-4 border-b border-gray-200 bg-white px-6 py-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-xl font-semibold text-gray-900">{opportunite.nomMarque}</h2>
              <span className={`rounded-full px-2.5 py-0.5 text-xs font-medium ${statusBadgeClass(opportunite.statut)}`}>
                {opportunite.statut}
              </span>
              {opportunite.secteur ? (
                <span className="rounded-full bg-gray-100 px-2.5 py-0.5 text-xs text-gray-600">{opportunite.secteur}</span>
              ) : null}
            </div>
            {opportunite.marqueId ? (
              <a
                href={`/marques/${opportunite.marqueId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#B06F70] hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Voir la fiche marque
              </a>
            ) : null}
          </div>
          <button type="button" onClick={onClose} className="rounded-lg p-2 hover:bg-gray-100">
            <X className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <div className="flex min-h-0 flex-1">
          {/* Nav */}
          <nav className="w-48 shrink-0 border-r border-gray-200 bg-white p-3">
            <div className="space-y-1">
              {SECTIONS.map((s) => (
                <button
                  key={s.key}
                  type="button"
                  onClick={() => setSection(s.key)}
                  className={`flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
                    section === s.key
                      ? "bg-glowup-rose text-white"
                      : "text-gray-600 hover:bg-gray-100"
                  }`}
                >
                  {s.icon}
                  {s.label}
                </button>
              ))}
            </div>
            <div className="mt-6 border-t border-gray-100 pt-4">
              <button
                type="button"
                onClick={() => onDelete(opportunite.id)}
                className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
              >
                <Trash2 className="h-4 w-4" /> Supprimer
              </button>
            </div>
          </nav>

          {/* Content */}
          <div className="min-w-0 flex-1 overflow-y-auto p-6">
            {busy ? (
              <div className="mb-4 inline-flex items-center gap-2 text-xs text-gray-400">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Mise à jour…
              </div>
            ) : null}

            {/* ===== OVERVIEW ===== */}
            {section === "overview" ? (
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
                  <KpiCard icon={<Wallet className="h-4 w-4" />} label="Budget estimé" value={money(opportunite.budgetEstime)} />
                  <KpiCard icon={<Users className="h-4 w-4" />} label="Talents matchés" value={String(matchedTalents.length)} />
                  <KpiCard icon={<TrendingUp className="h-4 w-4" />} label="Audience cumulée" value={formatCompact(totalAudience)} />
                  <KpiCard
                    icon={<Sparkles className="h-4 w-4" />}
                    label="Engagement moyen"
                    value={avgEngagement != null ? `${avgEngagement.toFixed(2)}%` : "—"}
                  />
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Étape du pipeline</h3>
                  <div className="flex flex-wrap gap-2">
                    {PIPELINE_STATUSES.map((s) => (
                      <button
                        key={s.key}
                        type="button"
                        onClick={() => changeStatus(s.key)}
                        className={`rounded-full px-3.5 py-1.5 text-sm font-medium transition-colors ${
                          opportunite.statut === s.key
                            ? "bg-glowup-rose text-white"
                            : "border border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                        }`}
                      >
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <h3 className="mb-3 text-sm font-semibold text-gray-900">Activité de prospection</h3>
                  <Timeline opp={opportunite} />
                </div>

                {cleanNote ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <h3 className="mb-2 text-sm font-semibold text-gray-900">Angle / note</h3>
                    <p className="whitespace-pre-line text-sm text-gray-600">{cleanNote}</p>
                  </div>
                ) : null}
              </div>
            ) : null}

            {/* ===== TALENTS ===== */}
            {section === "talents" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Talents matchés ({matchedTalents.length})</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setTalentIds(asArrayIds(opportunite.talents));
                      setEditTalents((v) => !v);
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    <PenSquare className="h-3.5 w-3.5" /> {editTalents ? "Annuler" : "Modifier"}
                  </button>
                </div>

                {editTalents ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <div className="grid max-h-[50vh] grid-cols-1 gap-2 overflow-y-auto md:grid-cols-2">
                      {talentOptions.map((t) => {
                        const checked = talentIds.includes(t.id);
                        return (
                          <label
                            key={t.id}
                            className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5 hover:bg-gray-50"
                          >
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={(e) =>
                                setTalentIds((curr) =>
                                  e.target.checked ? [...curr, t.id] : curr.filter((id) => id !== t.id)
                                )
                              }
                            />
                            <Avatar name={`${t.prenom} ${t.nom}`} photo={t.photo} className="h-7 w-7" />
                            <span className="text-sm">{t.prenom} {t.nom}</span>
                          </label>
                        );
                      })}
                    </div>
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={saveTalents}
                        className="rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                      >
                        Enregistrer
                      </button>
                    </div>
                  </div>
                ) : matchedTalents.length === 0 ? (
                  <EmptyBox text="Aucun talent matché pour cette marque." />
                ) : (
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
                    {matchedTalents.map((t) => (
                      <div key={t.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="flex items-center gap-3">
                          <Avatar name={t.name} photo={t.photo} className="h-12 w-12" />
                          <div className="min-w-0">
                            <p className="truncate font-semibold text-gray-900">{t.name}</p>
                            <p className="truncate text-xs text-gray-500">
                              @{(t.handle || "n/a").replace(/^@/, "")}{t.niche ? ` · ${t.niche}` : ""}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex items-center justify-between text-sm">
                          <div>
                            <p className="font-semibold">{formatCompact(t.followers)}</p>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Abonnés</p>
                          </div>
                          <div className="text-right">
                            <p className="font-semibold">
                              {typeof t.engagement === "number" ? `${t.engagement.toFixed(2)}%` : "—"}
                            </p>
                            <p className="text-[11px] uppercase tracking-wide text-gray-400">Engagement</p>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* ===== PROSPECTION ===== */}
            {section === "prospection" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-gray-900">Contacts client</h3>
                  {canSendProspection && hasContacts ? (
                    <button
                      type="button"
                      onClick={() => onSendEmail(opportunite)}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-3 py-1.5 text-xs font-medium text-white hover:opacity-95"
                    >
                      <Mail className="h-3.5 w-3.5" /> Envoyer le mail de prospection
                    </button>
                  ) : null}
                </div>

                {opportunite.lastEmailSentAt ? (
                  <div className="rounded-2xl border border-gray-200 bg-white p-4">
                    <p className="mb-2 text-xs text-gray-500">
                      Dernier mail le {new Date(opportunite.lastEmailSentAt).toLocaleString("fr-FR")}
                      {opportunite.lastEmailFrom ? ` depuis ${opportunite.lastEmailFrom}` : ""}
                      {opportunite.emailSubject ? ` — « ${opportunite.emailSubject} »` : ""}
                    </p>
                    <Timeline opp={opportunite} />
                  </div>
                ) : null}

                {contacts.length === 0 ? (
                  <EmptyBox text="Aucun contact enregistré. Qualifie la marque depuis l'onglet Marques pour ajouter des contacts." />
                ) : (
                  <div className="space-y-2">
                    {contacts.map((c, i) => (
                      <div key={i} className="rounded-xl border border-gray-200 bg-white px-4 py-3">
                        <p className="text-sm font-medium text-gray-900">
                          {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Contact"}
                        </p>
                        <p className="text-xs text-gray-500">{c.email || "Email non renseigné"}</p>
                        {c.role ? <p className="text-xs text-gray-400">{c.role}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
                {!isAdmin && contacts.length === 0 ? null : null}
              </div>
            ) : null}

            {/* ===== PROPOSITIONS ===== */}
            {section === "propositions" ? (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-sm font-semibold text-gray-900">Propositions de partenariat</h3>
                    <p className="text-xs text-gray-500">Présentation partageable pré-remplie avec le casting matché.</p>
                  </div>
                  <button
                    type="button"
                    onClick={createProposal}
                    disabled={busy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-3 py-1.5 text-xs font-medium text-white hover:opacity-95 disabled:opacity-60"
                  >
                    <Plus className="h-3.5 w-3.5" /> Créer une proposition
                  </button>
                </div>

                {propLoading ? (
                  <div className="flex justify-center py-8">
                    <Loader2 className="h-5 w-5 animate-spin text-gray-400" />
                  </div>
                ) : proposals.length === 0 ? (
                  <EmptyBox text="Aucune proposition pour cette marque. Clique sur « Créer une proposition » pour générer un lien partageable." />
                ) : (
                  <div className="space-y-3">
                    {proposals.map((prop) => (
                      <div key={prop.id} className="rounded-2xl border border-gray-200 bg-white p-4">
                        <div className="flex items-start justify-between gap-3">
                          <div className="flex items-center gap-3">
                            <div className="h-9 w-9 shrink-0 rounded-lg" style={{ backgroundColor: prop.accentColor }} />
                            <div>
                              <p className="font-semibold text-gray-900">{prop.title}</p>
                              <p className="text-[11px] text-gray-500">
                                {prop.casting.length} talents · {prop.budgetLines.length} lignes budget · {prop.photos.length} photos
                              </p>
                            </div>
                          </div>
                          <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                            <Eye className="h-3 w-3" /> {prop.viewCount}
                          </span>
                        </div>
                        <div className="mt-3 flex flex-wrap items-center gap-2">
                          <button
                            type="button"
                            onClick={() => router.push(`/strategy/propositions/${prop.id}`)}
                            className="rounded-lg bg-glowup-rose px-3 py-1.5 text-xs font-medium text-white hover:opacity-95"
                          >
                            Éditer
                          </button>
                          <button
                            type="button"
                            onClick={() => copyLink(prop)}
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            {copiedId === prop.id ? (
                              <><Check className="h-3.5 w-3.5 text-emerald-600" /> Copié</>
                            ) : (
                              <><Copy className="h-3.5 w-3.5" /> Copier le lien</>
                            )}
                          </button>
                          <a
                            href={prop.publicUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                          >
                            <ExternalLink className="h-3.5 w-3.5" /> Ouvrir
                          </a>
                          <button
                            type="button"
                            onClick={() => deleteProposal(prop.id)}
                            className="ml-auto rounded-lg border border-red-200 p-1.5 text-red-600 hover:bg-red-50"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}

            {/* ===== NOTES ===== */}
            {section === "notes" ? (
              <div className="space-y-4">
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Langue du client</label>
                  <select
                    value={lang || "FR"}
                    onChange={(e) => setLang(e.target.value as "FR" | "EN")}
                    className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                  >
                    <option value="FR">Client français</option>
                    <option value="EN">Client anglais</option>
                  </select>
                </div>
                <div className="rounded-2xl border border-gray-200 bg-white p-4">
                  <label className="mb-1 block text-xs font-medium text-gray-500">Angle / note</label>
                  <textarea
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    className="min-h-[160px] w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    placeholder="Angle d'approche, contexte, points clés de la négo…"
                  />
                  <div className="mt-3 flex justify-end">
                    <button
                      type="button"
                      onClick={saveNotes}
                      className="rounded-lg bg-glowup-rose px-4 py-2 text-sm font-medium text-white hover:opacity-95"
                    >
                      Enregistrer
                    </button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

function KpiCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4">
      <div className="flex items-center gap-2 text-gray-400">{icon}<span className="text-[11px] uppercase tracking-wide">{label}</span></div>
      <p className="mt-1.5 text-2xl font-semibold text-gray-900">{value}</p>
    </div>
  );
}

function EmptyBox({ text }: { text: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-8 text-center text-sm text-gray-500">
      {text}
    </div>
  );
}

function Avatar({ name, photo, className = "h-8 w-8" }: { name: string; photo?: string | null; className?: string }) {
  return (
    <div className={`${className} flex items-center justify-center overflow-hidden rounded-full bg-gradient-to-br from-gray-100 to-gray-200`}>
      {photo ? (
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-semibold text-gray-600">{initials(name)}</span>
      )}
    </div>
  );
}

function Timeline({ opp }: { opp: DealRoomOpportunite }) {
  const steps: Array<{ icon: React.ReactNode; label: string; done: boolean; tone: string }> = [
    {
      icon: <Send className="h-3.5 w-3.5" />,
      label: opp.lastEmailSentAt ? `Envoyé le ${new Date(opp.lastEmailSentAt).toLocaleDateString("fr-FR")}` : "Pas encore envoyé",
      done: !!opp.lastEmailSentAt,
      tone: "text-gray-700",
    },
    {
      icon: <Eye className="h-3.5 w-3.5" />,
      label: opp.emailOpenedAt
        ? `Ouvert${(opp.emailOpenCount || 0) > 1 ? ` ×${opp.emailOpenCount}` : ""}`
        : "Pas encore ouvert",
      done: !!opp.emailOpenedAt,
      tone: "text-sky-700",
    },
    {
      icon: <Reply className="h-3.5 w-3.5" />,
      label: opp.emailRepliedAt ? "A répondu" : "Pas de réponse",
      done: !!opp.emailRepliedAt,
      tone: "text-emerald-700",
    },
    {
      icon: <Clock className="h-3.5 w-3.5" />,
      label: opp.relanceSentAt ? `Relancé le ${new Date(opp.relanceSentAt).toLocaleDateString("fr-FR")}` : "Relance auto J+3 ouvrés",
      done: !!opp.relanceSentAt,
      tone: "text-indigo-700",
    },
  ];
  return (
    <div className="space-y-2">
      {steps.map((s, i) => (
        <div key={i} className="flex items-center gap-2.5 text-sm">
          <span
            className={`flex h-6 w-6 items-center justify-center rounded-full ${
              s.done ? "bg-gray-900 text-white" : "bg-gray-100 text-gray-400"
            }`}
          >
            {s.icon}
          </span>
          <span className={s.done ? s.tone : "text-gray-400"}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}
