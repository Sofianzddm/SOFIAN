"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Loader2,
  Plus,
  Trash2,
  ExternalLink,
  Copy,
  Check,
  Eye,
  ImagePlus,
  Wand2,
  X,
  GripVertical,
  ArrowLeft,
  Users2,
} from "lucide-react";
import {
  ProposalDeckView,
  resolveTheme,
  type ProposalPayload,
  type DeckTheme,
} from "@/app/proposition/[token]/proposal-deck";
import {
  type EmvConfig,
  DEFAULT_EMV_CONFIG,
  resolveEmvConfig,
  computeLineEmv,
} from "@/lib/emv";

type LogisticsItem = { label: string; url?: string | null; detail?: string | null; imageUrl?: string | null };

export type CastingMember = {
  talentId?: string;
  name: string;
  handle?: string | null;
  photoUrl?: string | null;
  followers?: number | null;
  engagement?: number | null;
  reach?: number | null; // legacy : reach Instagram
  reachInstagram?: number | null;
  reachTiktok?: number | null;
  avgViews?: number | null;
  platforms?: string[];
  role?: string | null;
  group?: string | null;
};

type BudgetLine = { label: string; detail?: string | null; amount?: number | null };

type Deliverable = {
  talent?: string | null;
  format?: string | null;
  platform?: string | null;
  quantity?: number | null;
  mediaValue?: number | null;
  followers?: number | null;
  engagement?: number | null;
  reach?: number | null; // reach réel saisi à la main pour ce format
  avgViews?: number | null; // vues moyennes saisies à la main pour ce format
};

export type Proposal = {
  id: string;
  projetSlug: string;
  publicToken: string;
  publicUrl: string;
  nomMarque: string;
  marqueId?: string | null;
  brandLogoUrl?: string | null;
  title: string;
  subtitle?: string | null;
  coverPhotoUrl?: string | null;
  accentColor: string;
  theme?: Partial<DeckTheme> | null;
  emvConfig?: Partial<EmvConfig> | null;
  introMessage?: string | null;
  casting: CastingMember[];
  castingGroups: string[];
  budgetLines: BudgetLine[];
  budgetCurrency: string;
  deliverables: Deliverable[];
  photos: string[];
  logistics: LogisticsItem[];
  eventLocation?: string | null;
  eventDateLabel?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
  status: string;
  viewCount: number;
  lastViewedAt?: string | null;
};

export type ParticipantLite = {
  talentId: string;
  statut: string;
  talent: {
    prenom: string;
    nom: string;
    avatar: string | null;
    handle: string | null;
    abonnes: number | null;
    engagement: number | null;
    niche: string | null;
  };
};

type AgencyTalent = {
  id: string;
  name: string;
  prenom: string;
  nom: string;
  photo: string | null;
  instagram: string | null;
  tiktok: string | null;
  niches: string[];
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

const ACCENT_PRESETS = ["#B06F70", "#1E3A8A", "#0F766E", "#B45309", "#7C3AED", "#BE123C"];

const THEME_PRESETS: Array<{ name: string; theme: DeckTheme }> = [
  { name: "Nuit", theme: { background: "solid", bgColor: "#220101", bgColor2: "#3A1414", bgImageUrl: null, bgOverlay: 60, textColor: "#F5EDE0", font: "sans" } },
  { name: "Crème", theme: { background: "solid", bgColor: "#F5EDE0", bgColor2: "#E7D8C3", bgImageUrl: null, bgOverlay: 30, textColor: "#220101", font: "serif" } },
  { name: "Or noir", theme: { background: "gradient", bgColor: "#0B0B0C", bgColor2: "#2A2118", bgImageUrl: null, bgOverlay: 60, textColor: "#F5EDE0", font: "serif" } },
  { name: "Bleu nuit", theme: { background: "gradient", bgColor: "#0A1124", bgColor2: "#1E2A52", bgImageUrl: null, bgOverlay: 55, textColor: "#EAF0FF", font: "sans" } },
  { name: "Rosé", theme: { background: "gradient", bgColor: "#FBEDEA", bgColor2: "#F3D9D2", bgImageUrl: null, bgOverlay: 30, textColor: "#3A1414", font: "serif" } },
];

function money(n: number | null | undefined, currency: string): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: currency || "EUR",
    maximumFractionDigits: 0,
  }).format(n || 0);
}

function formatCompactN(n: number | null | undefined): string {
  return new Intl.NumberFormat("fr-FR", { notation: "compact", maximumFractionDigits: 1 }).format(n || 0);
}

const FORMAT_OPTIONS = ["Reel", "Story", "Post", "Carrousel", "TikTok", "YouTube Short", "Vidéo YouTube"];
const PLATFORM_OPTIONS = ["Instagram", "TikTok", "YouTube", "Snapchat"];

/* ===================================================================== */
/* Liste des propositions (onglet du projet)                              */
/* ===================================================================== */

export function PropositionsTab({
  projetSlug,
  projetNom,
  participants,
}: {
  projetSlug: string;
  projetNom: string;
  participants: ParticipantLite[];
}) {
  void projetNom;
  void participants;
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [creating, setCreating] = useState(false);
  const [newBrand, setNewBrand] = useState("");
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/strategy/propositions?projetSlug=${encodeURIComponent(projetSlug)}`);
      if (res.ok) {
        const json = await res.json();
        setProposals(json.proposals || []);
      }
    } finally {
      setLoading(false);
    }
  }, [projetSlug]);

  useEffect(() => {
    void load();
  }, [load]);

  async function createProposal() {
    const nomMarque = newBrand.trim();
    if (!nomMarque) return;
    setCreating(true);
    try {
      const res = await fetch("/api/strategy/propositions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projetSlug, nomMarque }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        window.alert(json.error || "Erreur lors de la création.");
        return;
      }
      router.push(`/strategy/propositions/${json.proposal.id}`);
    } finally {
      setCreating(false);
    }
  }

  async function removeProposal(id: string) {
    if (!window.confirm("Supprimer cette proposition ? Le lien public ne fonctionnera plus.")) return;
    await fetch(`/api/strategy/propositions/${id}`, { method: "DELETE" });
    await load();
  }

  function copyLink(prop: Proposal) {
    void navigator.clipboard.writeText(`${window.location.origin}${prop.publicUrl}`);
    setCopiedId(prop.id);
    setTimeout(() => setCopiedId((c) => (c === prop.id ? null : c)), 1800);
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-gray-900">Propositions de partenariat</h2>
          <p className="mt-1 text-sm text-gray-500">
            Génère une présentation partageable (casting, budget, livrables, photos) pour une marque intéressée.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <input
            value={newBrand}
            onChange={(e) => setNewBrand(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void createProposal();
            }}
            placeholder="Nom de la marque…"
            className="rounded-xl border border-gray-300 px-3 py-2 text-sm"
          />
          <button
            type="button"
            onClick={createProposal}
            disabled={creating || !newBrand.trim()}
            className="inline-flex items-center gap-2 rounded-xl bg-glowup-rose px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-50"
          >
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            Nouvelle proposition
          </button>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center justify-center rounded-xl border border-gray-200 bg-white p-10">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </div>
      ) : proposals.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-gray-300 bg-white p-10 text-center">
          <p className="text-sm text-gray-600">
            Aucune proposition pour l&apos;instant. Saisis le nom d&apos;une marque ci-dessus pour démarrer.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {proposals.map((prop) => (
            <div key={prop.id} className="flex flex-col rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 shrink-0 rounded-lg" style={{ backgroundColor: prop.accentColor }} />
                  <div>
                    <p className="font-semibold text-gray-900">{prop.nomMarque}</p>
                    <p className="text-xs text-gray-500">{prop.title}</p>
                  </div>
                </div>
                <span className="inline-flex items-center gap-1 rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-600">
                  <Eye className="h-3 w-3" /> {prop.viewCount}
                </span>
              </div>

              <div className="mt-3 flex flex-wrap gap-1.5 text-[11px] text-gray-500">
                <span className="rounded-full bg-gray-50 px-2 py-0.5">{prop.casting.length} talents</span>
                <span className="rounded-full bg-gray-50 px-2 py-0.5">{prop.budgetLines.length} lignes budget</span>
                <span className="rounded-full bg-gray-50 px-2 py-0.5">{prop.deliverables.length} livrables</span>
                <span className="rounded-full bg-gray-50 px-2 py-0.5">{prop.photos.length} photos</span>
              </div>

              <div className="mt-4 flex flex-wrap items-center gap-2">
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
                    <>
                      <Check className="h-3.5 w-3.5 text-emerald-600" /> Copié
                    </>
                  ) : (
                    <>
                      <Copy className="h-3.5 w-3.5" /> Copier le lien
                    </>
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
                  onClick={() => removeProposal(prop.id)}
                  className="ml-auto inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ===================================================================== */
/* Page builder : formulaire (gauche) + aperçu live (droite)             */
/* ===================================================================== */

export function ProposalBuilder({ proposalId }: { proposalId: string }) {
  const router = useRouter();
  const [form, setForm] = useState<Proposal | null>(null);
  const [projetNom, setProjetNom] = useState("");
  const [participants, setParticipants] = useState<ParticipantLite[]>([]);
  const [agencyTalents, setAgencyTalents] = useState<AgencyTalent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState<BuilderTab>("presentation");

  const set = useCallback(
    <K extends keyof Proposal>(key: K, value: Proposal[K]) =>
      setForm((f) => (f ? { ...f, [key]: value } : f)),
    []
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/strategy/propositions/${proposalId}`);
        const json = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(json.error || "Introuvable");
        const prop = json.proposal as Proposal;
        if (cancelled) return;
        setForm({
          ...prop,
          logistics: Array.isArray(prop.logistics) ? prop.logistics : [],
          castingGroups: Array.isArray(prop.castingGroups) ? prop.castingGroups : [],
        });
        const [castRes, talentsRes] = await Promise.all([
          fetch(`/api/strategy/casting?projetSlug=${encodeURIComponent(prop.projetSlug)}`),
          fetch("/api/talents?presskit=true"),
        ]);
        if (castRes.ok) {
          const castJson = await castRes.json();
          if (!cancelled) {
            setParticipants(castJson.participants || []);
            setProjetNom(castJson.projet?.nom || prop.subtitle || "");
          }
        }
        if (talentsRes.ok) {
          const tJson = await talentsRes.json();
          if (!cancelled) setAgencyTalents(tJson.talents || []);
        }
      } catch {
        if (!cancelled) setForm(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [proposalId]);

  async function save() {
    if (!form) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/strategy/propositions/${form.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          nomMarque: form.nomMarque,
          brandLogoUrl: form.brandLogoUrl,
          title: form.title,
          subtitle: form.subtitle,
          coverPhotoUrl: form.coverPhotoUrl,
          accentColor: form.accentColor,
          theme: form.theme ?? null,
          emvConfig: form.emvConfig ?? null,
          introMessage: form.introMessage,
          budgetCurrency: form.budgetCurrency,
          eventLocation: form.eventLocation,
          eventDateLabel: form.eventDateLabel,
          contactName: form.contactName,
          contactEmail: form.contactEmail,
          casting: form.casting,
          castingGroups: form.castingGroups,
          budgetLines: form.budgetLines,
          deliverables: form.deliverables,
          photos: form.photos,
          logistics: form.logistics,
          status: "SHARED",
        }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        window.alert(json.error || "Erreur lors de l'enregistrement.");
        return;
      }
      setSavedAt(Date.now());
    } finally {
      setSaving(false);
    }
  }

  function copyLink() {
    if (!form) return;
    void navigator.clipboard.writeText(`${window.location.origin}${form.publicUrl}`);
    setCopied(true);
    setTimeout(() => setCopied(false), 1800);
  }

  if (loading) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <Loader2 className="h-7 w-7 animate-spin text-gray-400" />
      </div>
    );
  }

  if (!form) {
    return (
      <div className="flex h-[70vh] flex-col items-center justify-center gap-3 text-center">
        <p className="text-gray-600">Proposition introuvable.</p>
        <button
          type="button"
          onClick={() => router.push("/strategy/projets/villa-cannes")}
          className="rounded-lg border border-gray-300 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50"
        >
          Retour
        </button>
      </div>
    );
  }

  return (
    <div className="flex h-[calc(100vh-2rem)] flex-col overflow-hidden rounded-2xl border border-gray-200 bg-white">
      {/* Top bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-gray-200 px-4 py-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => router.push(`/strategy/projets/${form.projetSlug}`)}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ArrowLeft className="h-4 w-4" /> Projet
          </button>
          <div className="flex items-center gap-2">
            <div className="h-8 w-8 rounded-lg" style={{ backgroundColor: form.accentColor }} />
            <div>
              <p className="text-sm font-semibold text-gray-900">{form.nomMarque}</p>
              <p className="flex items-center gap-1 text-[11px] text-gray-500">
                <Eye className="h-3 w-3" /> {form.viewCount} vue{form.viewCount > 1 ? "s" : ""}
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={copyLink}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            {copied ? <Check className="h-4 w-4 text-emerald-600" /> : <Copy className="h-4 w-4" />}
            {copied ? "Copié" : "Copier le lien"}
          </button>
          <a
            href={form.publicUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-50"
          >
            <ExternalLink className="h-4 w-4" /> Ouvrir
          </a>
          <button
            type="button"
            onClick={save}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-glowup-rose px-4 py-1.5 text-sm font-medium text-white hover:opacity-95 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
            {savedAt && !saving ? "Enregistré" : "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Onglets */}
      <div className="flex items-center gap-1 overflow-x-auto border-b border-gray-200 bg-white px-2">
        {BUILDER_TABS.map((t) => {
          const active = activeTab === t.id;
          return (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`whitespace-nowrap border-b-2 px-3.5 py-3 text-sm font-medium transition-colors ${
                active
                  ? "border-glowup-rose text-glowup-rose"
                  : "border-transparent text-gray-500 hover:text-gray-800"
              }`}
            >
              {t.label}
            </button>
          );
        })}
      </div>

      {/* Contenu de l'onglet */}
      <div className="min-h-0 flex-1 overflow-y-auto bg-gray-50">
        {activeTab === "preview" ? (
          <div className="pointer-events-none">
            <ProposalDeckView proposal={form as unknown as ProposalPayload} animate={false} />
          </div>
        ) : (
          <div className="mx-auto max-w-3xl px-5 py-8">
            <ProposalFormBody
              form={form}
              set={set}
              tab={activeTab}
              projetNom={projetNom}
              participants={participants}
              agencyTalents={agencyTalents}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type BuilderTab =
  | "presentation"
  | "apparence"
  | "casting"
  | "budget"
  | "livrables"
  | "logistique"
  | "galerie"
  | "contact"
  | "preview";

const BUILDER_TABS: { id: BuilderTab; label: string }[] = [
  { id: "presentation", label: "Présentation" },
  { id: "apparence", label: "Apparence" },
  { id: "casting", label: "Casting" },
  { id: "budget", label: "Budget" },
  { id: "livrables", label: "Livrables & EMV" },
  { id: "logistique", label: "Logistique" },
  { id: "galerie", label: "Galerie" },
  { id: "contact", label: "Contact" },
  { id: "preview", label: "Aperçu" },
];

/* ===================================================================== */
/* Corps du formulaire (réutilisable)                                    */
/* ===================================================================== */

function ProposalFormBody({
  form,
  set,
  tab,
  projetNom,
  participants,
  agencyTalents,
}: {
  form: Proposal;
  set: <K extends keyof Proposal>(key: K, value: Proposal[K]) => void;
  tab: BuilderTab;
  projetNom: string;
  participants: ParticipantLite[];
  agencyTalents: AgencyTalent[];
}) {
  const [uploadingKind, setUploadingKind] = useState<string | null>(null);
  const [talentPickerOpen, setTalentPickerOpen] = useState(false);
  const [talentSearch, setTalentSearch] = useState("");
  const [activeGroupIdx, setActiveGroupIdx] = useState(0);
  const [logisticsImgIdx, setLogisticsImgIdx] = useState<number | null>(null);
  const coverInputRef = useRef<HTMLInputElement | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);
  const bgInputRef = useRef<HTMLInputElement | null>(null);

  const groupNames = form.castingGroups.length ? form.castingGroups : ["Casting principal"];
  const activeGroup = groupNames[Math.min(activeGroupIdx, groupNames.length - 1)] || groupNames[0];
  const memberGroup = (c: CastingMember) => c.group || groupNames[0];

  const renderDeliverable = (d: Deliverable, i: number, showSelect: boolean) => {
    const line = computeLineEmv(d, form.casting, emvCfg);
    const matchName = (d.talent || "").trim().toLowerCase();
    const member = matchName
      ? form.casting.find((c) => (c.name || "").trim().toLowerCase() === matchName)
      : undefined;
    const orphan = !!d.talent && !member;
    return (
      <div key={i} className="rounded-xl border border-gray-200 bg-white p-3.5 shadow-sm">
        <div className={`grid grid-cols-1 items-center gap-2 ${showSelect ? "md:grid-cols-[1.6fr_1fr_1fr_70px_110px_auto]" : "md:grid-cols-[1fr_1fr_70px_110px_auto]"}`}>
          {showSelect ? (
            <select
              className={inputCls}
              value={member ? member.name : d.talent || ""}
              onChange={(e) => updateRow(form, set, "deliverables", i, { talent: e.target.value || null })}
            >
              <option value="">— Choisir un créateur —</option>
              {form.casting.map((c, ci) => (
                <option key={ci} value={c.name}>
                  {(c.name || `Créateur ${ci + 1}`) + (groupNames.length > 1 ? ` — ${memberGroup(c)}` : "")}
                </option>
              ))}
              {orphan ? <option value={d.talent as string}>{d.talent} (hors casting)</option> : null}
            </select>
          ) : null}
          <select className={inputCls} value={FORMAT_OPTIONS.includes(d.format || "") ? (d.format as string) : ""} onChange={(e) => updateRow(form, set, "deliverables", i, { format: e.target.value || null })}>
            <option value="">Format…</option>
            {FORMAT_OPTIONS.map((f) => (
              <option key={f} value={f}>{f}</option>
            ))}
            {d.format && !FORMAT_OPTIONS.includes(d.format) ? <option value={d.format}>{d.format}</option> : null}
          </select>
          <select className={inputCls} value={PLATFORM_OPTIONS.includes(d.platform || "") ? (d.platform as string) : ""} onChange={(e) => updateRow(form, set, "deliverables", i, { platform: e.target.value || null })}>
            <option value="">Plateforme…</option>
            {PLATFORM_OPTIONS.map((pf) => (
              <option key={pf} value={pf}>{pf}</option>
            ))}
            {d.platform && !PLATFORM_OPTIONS.includes(d.platform) ? <option value={d.platform}>{d.platform}</option> : null}
          </select>
          <input
            className={inputCls}
            type="number"
            placeholder="Qté"
            value={d.quantity ?? ""}
            onChange={(e) => updateRow(form, set, "deliverables", i, { quantity: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <input
            className={inputCls}
            type="number"
            placeholder={line.emv > 0 ? `auto ${Math.round(line.emv)}` : "EMV"}
            value={d.mediaValue ?? ""}
            onChange={(e) => updateRow(form, set, "deliverables", i, { mediaValue: e.target.value === "" ? null : Number(e.target.value) })}
          />
          <button type="button" onClick={() => removeRow(form, set, "deliverables", i)} className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">Reach réel (ce format)</label>
            <input
              className={inputCls}
              type="number"
              placeholder="ex : 331000"
              value={d.reach ?? ""}
              onChange={(e) => updateRow(form, set, "deliverables", i, { reach: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
          <div>
            <label className="block text-[10px] font-medium uppercase tracking-wide text-gray-400">Vues moyennes</label>
            <input
              className={inputCls}
              type="number"
              placeholder="ex : 360000"
              value={d.avgViews ?? ""}
              onChange={(e) => updateRow(form, set, "deliverables", i, { avgViews: e.target.value === "" ? null : Number(e.target.value) })}
            />
          </div>
        </div>

        <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-100 pt-2.5 text-[11px] text-gray-500">
          {line.matched ? (
            <>
              <span>{line.estimated ? "Reach estimé" : "Reach"} ≈ <b className="text-gray-700">{formatCompactN(line.reach)}</b></span>
              <span>{line.cpm}€/1000</span>
              <span>EMV ≈ <b className="text-gray-700">{money(line.emv, form.budgetCurrency)}</b></span>
              {line.estimated ? (
                <span className="rounded bg-amber-50 px-1.5 py-0.5 text-[10px] text-amber-600">reach estimé</span>
              ) : null}
              {d.mediaValue == null && line.emv > 0 ? (
                <button
                  type="button"
                  onClick={() => updateRow(form, set, "deliverables", i, { mediaValue: Math.round(line.emv) })}
                  className="font-medium text-glowup-rose hover:underline"
                >
                  Figer cette valeur
                </button>
              ) : null}
              {d.mediaValue != null ? (
                <button
                  type="button"
                  onClick={() => updateRow(form, set, "deliverables", i, { mediaValue: null })}
                  className="font-medium text-gray-500 hover:underline"
                >
                  Revenir à l&apos;auto
                </button>
              ) : null}
            </>
          ) : (
            <span className="italic">
              {member
                ? "Renseigne le reach (ou les abonnés du créateur) pour calculer l'EMV."
                : "Pas de reach pour ce format (TikTok/YouTube) — saisis-le pour afficher l'EMV."}
            </span>
          )}
        </div>
      </div>
    );
  };

  const addedTalentIds = useMemo(
    () =>
      new Set(
        form.casting
          .filter((c) => (c.group || groupNames[0]) === activeGroup)
          .map((c) => c.talentId)
          .filter(Boolean) as string[]
      ),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [form.casting, activeGroup]
  );

  function ensureGroups(): string[] {
    return form.castingGroups.length ? form.castingGroups : ["Casting principal"];
  }

  function addMembersToActive(members: CastingMember[]) {
    const base = ensureGroups();
    if (!form.castingGroups.length) set("castingGroups", base);
    const g = base[Math.min(activeGroupIdx, base.length - 1)] || base[0];
    set("casting", [...form.casting, ...members.map((m) => ({ ...m, group: m.group || g }))]);
  }

  function addGroup() {
    const base = ensureGroups();
    set("castingGroups", [...base, `Casting ${base.length + 1}`]);
    setActiveGroupIdx(base.length);
  }

  function renameGroup(idx: number, name: string) {
    const base = ensureGroups();
    const old = base[idx];
    set("castingGroups", base.map((g, i) => (i === idx ? name : g)));
    set(
      "casting",
      form.casting.map((c) => ((c.group || base[0]) === old ? { ...c, group: name } : c))
    );
  }

  function deleteGroup(idx: number) {
    const base = ensureGroups();
    if (base.length <= 1) return;
    const removed = base[idx];
    const next = base.filter((_, i) => i !== idx);
    const fallback = next[0];
    set("castingGroups", next);
    set(
      "casting",
      form.casting.map((c) => ((c.group || base[0]) === removed ? { ...c, group: fallback } : c))
    );
    setActiveGroupIdx(0);
  }

  const filteredAgencyTalents = useMemo(() => {
    const q = talentSearch.trim().toLowerCase();
    if (!q) return agencyTalents;
    return agencyTalents.filter((t) =>
      `${t.name} ${t.instagram || ""} ${(t.niches || []).join(" ")}`.toLowerCase().includes(q)
    );
  }, [agencyTalents, talentSearch]);

  function addAgencyTalent(t: AgencyTalent) {
    if (t.id && addedTalentIds.has(t.id)) return;
    const hasIg = !!t.instagram;
    const platforms: string[] = [];
    if (hasIg) platforms.push("Instagram");
    if (t.tiktok) platforms.push("TikTok");
    const member: CastingMember = {
      talentId: t.id,
      name: t.name || `${t.prenom} ${t.nom}`.trim(),
      handle: t.instagram || t.tiktok || null,
      photoUrl: t.photo,
      followers: hasIg ? t.igFollowers : t.ttFollowers || t.igFollowers,
      engagement: hasIg ? t.igEngagement : t.ttEngagement || t.igEngagement,
      platforms,
      role: t.niches?.[0] || null,
    };
    addMembersToActive([member]);
  }

  const theme = resolveTheme(form.theme);
  const setTheme = (patch: Partial<DeckTheme>) => set("theme", { ...theme, ...patch });

  const budgetTotal = useMemo(
    () => form.budgetLines.reduce((s, l) => s + (Number(l.amount) || 0), 0),
    [form.budgetLines]
  );

  async function uploadFile(file: File): Promise<string | null> {
    const fd = new FormData();
    fd.append("file", file);
    const res = await fetch("/api/strategy/propositions/upload-photo", { method: "POST", body: fd });
    const json = await res.json().catch(() => ({}));
    if (!res.ok) {
      window.alert(json.error || "Erreur upload.");
      return null;
    }
    return json.url as string;
  }

  async function handleSingleUpload(
    e: React.ChangeEvent<HTMLInputElement>,
    kind: "cover" | "logo" | "bg"
  ) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingKind(kind);
    try {
      const url = await uploadFile(file);
      if (!url) return;
      if (kind === "cover") set("coverPhotoUrl", url);
      else if (kind === "logo") set("brandLogoUrl", url);
      else setTheme({ bgImageUrl: url, background: "image" });
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleGalleryUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (files.length === 0) return;
    setUploadingKind("gallery");
    try {
      const urls: string[] = [];
      for (const f of files) {
        const url = await uploadFile(f);
        if (url) urls.push(url);
      }
      set("photos", [...form.photos, ...urls]);
    } finally {
      setUploadingKind(null);
    }
  }

  async function handleCastingPhotoUpload(e: React.ChangeEvent<HTMLInputElement>, index: number) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadingKind(`casting-${index}`);
    try {
      const url = await uploadFile(file);
      if (!url) return;
      updateRow(form, set, "casting", index, { photoUrl: url });
    } finally {
      setUploadingKind(null);
    }
  }

  function importConfirmedCasting() {
    const confirmed = participants.filter((p) => p.statut === "CONFIRME");
    if (confirmed.length === 0) {
      window.alert("Aucun talent confirmé dans le casting du projet.");
      return;
    }
    const existing = new Set(
      form.casting.filter((c) => memberGroup(c) === activeGroup).map((c) => c.talentId).filter(Boolean)
    );
    const additions: CastingMember[] = confirmed
      .filter((p) => !existing.has(p.talentId))
      .map((p) => ({
        talentId: p.talentId,
        name: `${p.talent.prenom} ${p.talent.nom}`.trim(),
        handle: p.talent.handle,
        photoUrl: p.talent.avatar,
        followers: p.talent.abonnes,
        engagement: p.talent.engagement,
        platforms: p.talent.handle ? ["Instagram"] : [],
        role: p.talent.niche,
      }));
    if (additions.length === 0) {
      window.alert("Tous les talents confirmés sont déjà dans ce casting.");
      return;
    }
    addMembersToActive(additions);
  }

  const inputCls = "w-full rounded-lg border border-gray-300 px-3 py-2 text-sm";
  const labelCls = "block text-xs font-medium text-gray-500 mb-1";

  const emvCfg = resolveEmvConfig(form.emvConfig);
  const setEmv = (patch: Partial<EmvConfig>) =>
    set("emvConfig", { ...emvCfg, ...patch });

  // Récupère automatiquement l'image (og:image) d'un lien logistique.
  const fetchLogisticsImage = async (idx: number) => {
    if (!form) return;
    const url = (form.logistics[idx]?.url || "").trim();
    if (!url) {
      window.alert("Renseigne d'abord l'URL du lien.");
      return;
    }
    setLogisticsImgIdx(idx);
    try {
      const res = await fetch(`/api/link-preview?url=${encodeURIComponent(url)}`);
      const json = (await res.json().catch(() => ({}))) as { image?: string | null };
      if (!res.ok || !json.image) {
        window.alert("Aucune image trouvée pour ce lien.");
        return;
      }
      updateRow(form, set, "logistics", idx, { imageUrl: json.image });
    } catch {
      window.alert("Impossible de récupérer l'image du lien.");
    } finally {
      setLogisticsImgIdx(null);
    }
  };

  return (
    <div className="space-y-6">
      {tab === "presentation" && (
      <Card title="Présentation">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Marque</label>
            <input className={inputCls} value={form.nomMarque} onChange={(e) => set("nomMarque", e.target.value)} />
          </div>
          <div>
            <label className={labelCls}>Sous-titre</label>
            <input
              className={inputCls}
              value={form.subtitle || ""}
              placeholder={projetNom}
              onChange={(e) => set("subtitle", e.target.value)}
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Titre principal</label>
          <input className={inputCls} value={form.title} onChange={(e) => set("title", e.target.value)} />
        </div>
        <div>
          <label className={labelCls}>Message d&apos;intro</label>
          <textarea
            className={`${inputCls} min-h-[80px]`}
            value={form.introMessage || ""}
            onChange={(e) => set("introMessage", e.target.value)}
            placeholder="Une phrase d'accroche affichée en grand…"
          />
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Lieu</label>
            <input
              className={inputCls}
              value={form.eventLocation || ""}
              onChange={(e) => set("eventLocation", e.target.value)}
              placeholder="Courchevel, France"
            />
          </div>
          <div>
            <label className={labelCls}>Dates (texte)</label>
            <input
              className={inputCls}
              value={form.eventDateLabel || ""}
              onChange={(e) => set("eventDateLabel", e.target.value)}
              placeholder="10 → 17 janvier 2027"
            />
          </div>
        </div>
        <div>
          <label className={labelCls}>Couleur d&apos;accent</label>
          <div className="flex items-center gap-2">
            {ACCENT_PRESETS.map((c) => (
              <button
                key={c}
                type="button"
                onClick={() => set("accentColor", c)}
                className={`h-7 w-7 rounded-full border-2 ${
                  form.accentColor.toLowerCase() === c.toLowerCase() ? "border-gray-900" : "border-transparent"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
            <input
              type="color"
              value={form.accentColor}
              onChange={(e) => set("accentColor", e.target.value)}
              className="h-7 w-9 cursor-pointer rounded border border-gray-300"
            />
          </div>
        </div>
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <UploadField
            label="Photo de couverture"
            url={form.coverPhotoUrl}
            uploading={uploadingKind === "cover"}
            onPick={() => coverInputRef.current?.click()}
            onClear={() => set("coverPhotoUrl", null)}
          />
          <UploadField
            label="Logo de la marque"
            url={form.brandLogoUrl}
            uploading={uploadingKind === "logo"}
            onPick={() => logoInputRef.current?.click()}
            onClear={() => set("brandLogoUrl", null)}
            contain
          />
        </div>
        <input ref={coverInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSingleUpload(e, "cover")} />
        <input ref={logoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSingleUpload(e, "logo")} />
      </Card>
      )}

      {tab === "apparence" && (
      <Card title="Apparence">
        <div>
          <label className={labelCls}>Thèmes</label>
          <div className="flex flex-wrap gap-2">
            {THEME_PRESETS.map((preset) => {
              const active =
                theme.background === preset.theme.background &&
                theme.bgColor.toLowerCase() === preset.theme.bgColor.toLowerCase() &&
                theme.textColor.toLowerCase() === preset.theme.textColor.toLowerCase();
              return (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => setTheme(preset.theme)}
                  className={`flex items-center gap-2 rounded-xl border px-2.5 py-1.5 text-xs font-medium ${
                    active ? "border-glowup-rose ring-1 ring-glowup-rose/30" : "border-gray-200 hover:bg-gray-50"
                  }`}
                >
                  <span
                    className="h-5 w-5 rounded-full border border-black/10"
                    style={{
                      background:
                        preset.theme.background === "gradient"
                          ? `linear-gradient(135deg, ${preset.theme.bgColor}, ${preset.theme.bgColor2})`
                          : preset.theme.bgColor,
                    }}
                  />
                  {preset.name}
                </button>
              );
            })}
          </div>
        </div>

        <div>
          <label className={labelCls}>Type de fond</label>
          <div className="flex gap-2">
            {(
              [
                { key: "solid", label: "Couleur" },
                { key: "gradient", label: "Dégradé" },
                { key: "image", label: "Image" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTheme({ background: opt.key })}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  theme.background === opt.key
                    ? "border-glowup-rose bg-glowup-rose/5 text-glowup-rose"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          <ColorField
            label={theme.background === "gradient" ? "Fond (début)" : "Couleur de fond"}
            value={theme.bgColor}
            onChange={(v) => setTheme({ bgColor: v })}
          />
          {theme.background === "gradient" ? (
            <ColorField label="Fond (fin)" value={theme.bgColor2} onChange={(v) => setTheme({ bgColor2: v })} />
          ) : null}
          <ColorField label="Couleur du texte" value={theme.textColor} onChange={(v) => setTheme({ textColor: v })} />
        </div>

        {theme.background === "image" ? (
          <div className="space-y-3 rounded-xl border border-gray-200 bg-gray-50 p-3">
            <UploadField
              label="Image de fond"
              url={theme.bgImageUrl}
              uploading={uploadingKind === "bg"}
              onPick={() => bgInputRef.current?.click()}
              onClear={() => setTheme({ bgImageUrl: null })}
            />
            <div>
              <label className={labelCls}>Assombrissement ({theme.bgOverlay}%)</label>
              <input
                type="range"
                min={0}
                max={100}
                value={theme.bgOverlay}
                onChange={(e) => setTheme({ bgOverlay: Number(e.target.value) })}
                className="w-full"
              />
            </div>
            <input ref={bgInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => handleSingleUpload(e, "bg")} />
          </div>
        ) : null}

        <div>
          <label className={labelCls}>Police</label>
          <div className="flex gap-2">
            {(
              [
                { key: "sans", label: "Moderne", css: "ui-sans-serif, system-ui, sans-serif" },
                { key: "serif", label: "Élégante", css: "ui-serif, Georgia, serif" },
                { key: "mono", label: "Tech", css: "ui-monospace, monospace" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.key}
                type="button"
                onClick={() => setTheme({ font: opt.key })}
                style={{ fontFamily: opt.css }}
                className={`flex-1 rounded-lg border px-3 py-2 text-sm font-medium ${
                  theme.font === opt.key
                    ? "border-glowup-rose bg-glowup-rose/5 text-glowup-rose"
                    : "border-gray-300 text-gray-600 hover:bg-gray-50"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
      </Card>
      )}

      {tab === "casting" && (
      <Card
        title="Propositions de casting"
        action={
          <button
            type="button"
            onClick={addGroup}
            className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95"
          >
            <Plus className="h-3.5 w-3.5" /> Nouveau casting
          </button>
        }
      >
        <p className="-mt-1 text-xs text-gray-500">
          Propose plusieurs line-ups de créateurs (ex : « Premium », « Accessible ») que la marque pourra comparer.
        </p>

        {/* Sélecteur de casting */}
        <div className="flex flex-wrap gap-1.5">
          {groupNames.map((g, gi) => {
            const count = form.casting.filter((c) => memberGroup(c) === g).length;
            const active = g === activeGroup;
            return (
              <button
                key={gi}
                type="button"
                onClick={() => setActiveGroupIdx(gi)}
                className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium ${
                  active
                    ? "border-glowup-rose bg-glowup-rose/5 text-glowup-rose"
                    : "border-gray-300 bg-white text-gray-600 hover:bg-gray-50"
                }`}
              >
                {g}
                <span className={`rounded-full px-1.5 text-[10px] ${active ? "bg-glowup-rose/15" : "bg-gray-100"}`}>{count}</span>
              </button>
            );
          })}
        </div>

        {/* Barre d'actions du casting actif */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-gray-200 bg-gray-50 p-2.5">
          <input
            className="w-44 rounded-lg border border-gray-300 px-3 py-1.5 text-sm font-medium"
            value={activeGroup}
            onChange={(e) => renameGroup(groupNames.indexOf(activeGroup), e.target.value)}
          />
          {groupNames.length > 1 ? (
            <button
              type="button"
              onClick={() => deleteGroup(groupNames.indexOf(activeGroup))}
              className="inline-flex items-center gap-1 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-red-600 hover:bg-red-50"
            >
              <Trash2 className="h-3.5 w-3.5" /> Supprimer
            </button>
          ) : null}
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setTalentPickerOpen((v) => !v)}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
                talentPickerOpen
                  ? "border-glowup-rose bg-glowup-rose/5 text-glowup-rose"
                  : "border-gray-300 bg-white text-gray-700 hover:bg-gray-50"
              }`}
            >
              <Users2 className="h-3.5 w-3.5" /> Nos talents
            </button>
            <button
              type="button"
              onClick={importConfirmedCasting}
              className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
            >
              <Wand2 className="h-3.5 w-3.5" /> Importer les confirmés
            </button>
            <button
              type="button"
              onClick={() => addMembersToActive([{ name: "" }])}
              className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95"
            >
              <Plus className="h-3.5 w-3.5" /> Talent externe
            </button>
          </div>
        </div>

        {talentPickerOpen ? (
          <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
            <input
              value={talentSearch}
              onChange={(e) => setTalentSearch(e.target.value)}
              placeholder="Rechercher un talent de l'agence…"
              className="mb-2 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="max-h-64 space-y-1.5 overflow-y-auto pr-1">
              {filteredAgencyTalents.length === 0 ? (
                <p className="px-1 py-3 text-center text-xs text-gray-400">Aucun talent trouvé.</p>
              ) : (
                filteredAgencyTalents.map((t) => {
                  const already = !!t.id && addedTalentIds.has(t.id);
                  return (
                    <div
                      key={t.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-2.5 py-2"
                    >
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="h-8 w-8 shrink-0 overflow-hidden rounded-full bg-gray-100">
                          {t.photo ? (
                            <img src={t.photo} alt={t.name} className="h-full w-full object-cover" />
                          ) : null}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">{t.name}</p>
                          <p className="truncate text-[11px] text-gray-500">
                            @{(t.instagram || t.tiktok || "n/a").replace(/^@/, "")}
                            {t.igFollowers ? ` · ${Intl.NumberFormat("fr-FR", { notation: "compact" }).format(t.igFollowers)} abos` : ""}
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => addAgencyTalent(t)}
                        className="shrink-0 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95 disabled:opacity-40"
                      >
                        {already ? "Ajouté" : "Ajouter"}
                      </button>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        ) : null}

        {(() => {
          const members = form.casting
            .map((c, i) => ({ c, i }))
            .filter(({ c }) => memberGroup(c) === activeGroup);
          return members.length === 0 ? (
            <EmptyHint text="Ajoute des créateurs à ce casting (nos talents, confirmés ou externe)." />
          ) : (
            <div className="space-y-3">
              {members.map(({ c, i }) => (
              <div key={i} className="rounded-xl border border-gray-200 bg-white p-3">
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2">
                  <input className={inputCls} placeholder="Nom" value={c.name} onChange={(e) => updateRow(form, set, "casting", i, { name: e.target.value })} />
                  <input className={inputCls} placeholder="@handle" value={c.handle || ""} onChange={(e) => updateRow(form, set, "casting", i, { handle: e.target.value })} />
                  <input
                    className={inputCls}
                    type="number"
                    placeholder="Abonnés"
                    value={c.followers ?? ""}
                    onChange={(e) => updateRow(form, set, "casting", i, { followers: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <input
                    className={inputCls}
                    type="number"
                    step="0.01"
                    placeholder="Engagement %"
                    value={c.engagement ?? ""}
                    onChange={(e) => updateRow(form, set, "casting", i, { engagement: e.target.value === "" ? null : Number(e.target.value) })}
                  />
                  <input className={inputCls} placeholder="Rôle / niche" value={c.role || ""} onChange={(e) => updateRow(form, set, "casting", i, { role: e.target.value })} />
                  <input
                    className={inputCls}
                    placeholder="Plateformes (séparées par ,)"
                    value={(c.platforms || []).join(", ")}
                    onChange={(e) =>
                      updateRow(form, set, "casting", i, {
                        platforms: e.target.value.split(",").map((s) => s.trim()).filter(Boolean),
                      })
                    }
                  />
                </div>
                {!(c.followers && c.followers > 0) ? (
                  <p className="mt-2 rounded-lg bg-amber-50 px-3 py-2 text-[11px] text-amber-700">
                    Renseigne les <b>abonnés</b> + l&apos;<b>engagement</b> ici. Le <b>reach</b> et les <b>vues</b> se saisissent par livrable (onglet Livrables).
                  </p>
                ) : (
                  <p className="mt-2 rounded-lg bg-glowup-rose/5 px-3 py-2 text-[11px] text-gray-500">
                    Reach et vues par contenu se saisissent dans l&apos;onglet <b>Livrables</b> (par format).
                  </p>
                )}
                <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="h-10 w-10 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                      {c.photoUrl ? (
                        <img src={c.photoUrl} alt={c.name} className="h-full w-full object-cover" />
                      ) : (
                        <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-400">photo</div>
                      )}
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-gray-300 bg-white px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50">
                      {uploadingKind === `casting-${i}` ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <ImagePlus className="h-3.5 w-3.5" />
                      )}
                      {c.photoUrl ? "Remplacer la photo" : "Ajouter une photo"}
                      <input type="file" accept="image/*" className="hidden" onChange={(e) => handleCastingPhotoUpload(e, i)} />
                    </label>
                    {c.photoUrl ? (
                      <button
                        type="button"
                        onClick={() => updateRow(form, set, "casting", i, { photoUrl: null })}
                        className="text-xs text-gray-400 hover:text-gray-600"
                      >
                        Retirer la photo
                      </button>
                    ) : null}
                  </div>
                  <div className="flex items-center gap-2">
                    {groupNames.length > 1 ? (
                      <select
                        className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs text-gray-600"
                        value={memberGroup(c)}
                        onChange={(e) => updateRow(form, set, "casting", i, { group: e.target.value })}
                      >
                        {groupNames.map((g, gi) => (
                          <option key={gi} value={g}>
                            → {g}
                          </option>
                        ))}
                      </select>
                    ) : null}
                    <button type="button" onClick={() => removeRow(form, set, "casting", i)} className="inline-flex items-center gap-1 text-xs font-medium text-red-600">
                      <Trash2 className="h-3.5 w-3.5" /> Retirer
                    </button>
                  </div>
                </div>
              </div>
              ))}
            </div>
          );
        })()}
      </Card>
      )}

      {tab === "budget" && (
      <Card
        title="Budget détaillé"
        action={
          <button
            type="button"
            onClick={() => set("budgetLines", [...form.budgetLines, { label: "" }])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95"
          >
            <Plus className="h-3.5 w-3.5" /> Ligne
          </button>
        }
      >
        {form.budgetLines.length === 0 ? (
          <EmptyHint text="Ajoute les postes de dépense (cachets, production, logistique…)." />
        ) : (
          <div className="space-y-2">
            {form.budgetLines.map((l, i) => (
              <div key={i} className="grid grid-cols-[16px_1fr_1fr_130px_auto] items-center gap-2">
                <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                <input className={inputCls} placeholder="Poste" value={l.label} onChange={(e) => updateRow(form, set, "budgetLines", i, { label: e.target.value })} />
                <input className={inputCls} placeholder="Détail (optionnel)" value={l.detail || ""} onChange={(e) => updateRow(form, set, "budgetLines", i, { detail: e.target.value })} />
                <input
                  className={inputCls}
                  type="number"
                  placeholder="Montant"
                  value={l.amount ?? ""}
                  onChange={(e) => updateRow(form, set, "budgetLines", i, { amount: e.target.value === "" ? null : Number(e.target.value) })}
                />
                <button type="button" onClick={() => removeRow(form, set, "budgetLines", i)} className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))}
            <div className="flex items-center justify-between rounded-lg bg-gray-100 px-3 py-2 text-sm font-semibold">
              <span>Total</span>
              <span>{money(budgetTotal, form.budgetCurrency)}</span>
            </div>
          </div>
        )}
      </Card>
      )}

      {tab === "livrables" && (
      <Card title="Livrables garantis">
        {form.casting.length === 0 ? (
          <EmptyHint text="Ajoute d'abord tes créateurs dans l'onglet Casting (avec abonnés + engagement) pour calculer l'EMV." />
        ) : (
          (() => {
            const indexed = form.deliverables.map((d, i) => ({ d, i }));
            const assignedNames = new Set(
              form.casting.map((c) => (c.name || "").trim().toLowerCase()).filter(Boolean)
            );
            const orphans = indexed.filter(
              ({ d }) => !d.talent || !assignedNames.has((d.talent || "").trim().toLowerCase())
            );
            return (
              <div className="space-y-5">
                {form.casting.map((c, ci) => {
                  const cname = (c.name || "").trim().toLowerCase();
                  const items = cname
                    ? indexed.filter(({ d }) => (d.talent || "").trim().toLowerCase() === cname)
                    : [];
                  return (
                    <div key={ci} className="rounded-2xl border border-gray-200 bg-gray-50/60 p-4">
                      <div className="mb-3 flex items-center justify-between gap-3">
                        <div className="flex items-center gap-2.5">
                          <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-gray-200 bg-gray-100">
                            {c.photoUrl ? (
                              <img src={c.photoUrl} alt={c.name} className="h-full w-full object-cover" />
                            ) : null}
                          </div>
                          <div>
                            <p className="text-sm font-semibold text-gray-800">{c.name || `Créateur ${ci + 1}`}</p>
                            <p className="text-[11px] text-gray-400">
                              {c.handle ? c.handle + " · " : ""}
                              {groupNames.length > 1 ? memberGroup(c) + " · " : ""}
                              {items.length} livrable{items.length > 1 ? "s" : ""}
                            </p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => set("deliverables", [...form.deliverables, { talent: c.name }])}
                          className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95"
                        >
                          <Plus className="h-3.5 w-3.5" /> Livrable
                        </button>
                      </div>
                      {items.length === 0 ? (
                        <p className="rounded-lg border border-dashed border-gray-200 bg-white px-3 py-2.5 text-[11px] text-gray-400">
                          Aucun livrable pour ce créateur — clique sur « Livrable ».
                        </p>
                      ) : (
                        <div className="space-y-3">{items.map(({ d, i }) => renderDeliverable(d, i, false))}</div>
                      )}
                    </div>
                  );
                })}

                {orphans.length > 0 ? (
                  <div className="rounded-2xl border border-amber-200 bg-amber-50/50 p-4">
                    <p className="mb-3 text-sm font-semibold text-amber-800">Livrables hors casting</p>
                    <div className="space-y-3">{orphans.map(({ d, i }) => renderDeliverable(d, i, true))}</div>
                  </div>
                ) : null}
              </div>
            );
          })()
        )}
      </Card>
      )}

      {tab === "livrables" && (
      <Card title="Paramètres de calcul EMV">
        <p className="-mt-1 text-xs text-gray-500">
          EMV = Reach estimé ÷ 1000 × CPM du format. CPM conseillés (marché France 2026), modifiables.
        </p>
        <div>
          <p className="mb-1.5 text-xs font-semibold text-gray-700">CPM par contenu ({form.budgetCurrency} / 1000 reach)</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {([
              ["story", "Story"],
              ["reel", "Reel"],
              ["post", "Post"],
              ["carrousel", "Carrousel"],
              ["tiktok", "TikTok"],
              ["ytShort", "YT Short"],
              ["ytVideo", "Vidéo YT"],
            ] as const).map(([k, label]) => (
              <div key={k}>
                <label className="block text-[11px] text-gray-500">{label}</label>
                <input
                  className={inputCls}
                  type="number"
                  value={emvCfg.formatCpm[k]}
                  onChange={(e) =>
                    setEmv({ formatCpm: { ...emvCfg.formatCpm, [k]: Number(e.target.value) || 0 } })
                  }
                />
              </div>
            ))}
            <div className="flex items-end">
              <button
                type="button"
                onClick={() => set("emvConfig", { ...DEFAULT_EMV_CONFIG })}
                className="w-full rounded-lg border border-gray-300 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </div>
        <div className="w-48">
          <label className="block text-[11px] font-medium text-gray-500">Reach estimé si non renseigné</label>
          <div className="flex items-center gap-1">
            <input
              className={inputCls}
              type="number"
              value={Math.round(emvCfg.defaultReachRate * 100)}
              onChange={(e) => setEmv({ defaultReachRate: (Number(e.target.value) || 0) / 100 })}
            />
            <span className="text-xs text-gray-400">% des abos</span>
          </div>
        </div>
      </Card>
      )}

      {tab === "logistique" && (
      <Card
        title="Logement & logistique"
        action={
          <button
            type="button"
            onClick={() => set("logistics", [...form.logistics, { label: "" }])}
            className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95"
          >
            <Plus className="h-3.5 w-3.5" /> Lien
          </button>
        }
      >
        {form.logistics.length === 0 ? (
          <EmptyHint text="Ajoute un lien de chalet, un transfert, un programme… (visible par la marque)." />
        ) : (
          <div className="space-y-2">
            {form.logistics.map((l, i) => (
              <div key={i} className="rounded-lg border border-gray-100 p-2">
                <div className="grid grid-cols-[16px_140px_1fr_1fr_auto_auto] items-center gap-2">
                  <GripVertical className="h-4 w-4 shrink-0 text-gray-300" />
                  <input
                    className={inputCls}
                    placeholder="Libellé (ex: Chalet)"
                    value={l.label}
                    onChange={(e) => updateRow(form, set, "logistics", i, { label: e.target.value })}
                  />
                  <input
                    className={inputCls}
                    placeholder="https://…"
                    value={l.url || ""}
                    onChange={(e) => updateRow(form, set, "logistics", i, { url: e.target.value })}
                  />
                  <input
                    className={inputCls}
                    placeholder="Détail (optionnel)"
                    value={l.detail || ""}
                    onChange={(e) => updateRow(form, set, "logistics", i, { detail: e.target.value })}
                  />
                  <button
                    type="button"
                    onClick={() => fetchLogisticsImage(i)}
                    disabled={logisticsImgIdx === i || !(l.url || "").trim()}
                    title="Récupérer l'image du lien"
                    className="inline-flex shrink-0 items-center gap-1 rounded-lg border border-gray-300 px-2 py-2 text-xs text-gray-600 hover:bg-gray-50 disabled:opacity-50"
                  >
                    {logisticsImgIdx === i ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <ImagePlus className="h-4 w-4" />
                    )}
                  </button>
                  <button type="button" onClick={() => removeRow(form, set, "logistics", i)} className="shrink-0 rounded p-1.5 text-red-600 hover:bg-red-50">
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
                {l.imageUrl ? (
                  <div className="mt-2 flex items-center gap-2 pl-6">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={`/api/og-image?url=${encodeURIComponent(l.imageUrl)}`}
                      alt=""
                      className="h-12 w-20 rounded border border-gray-200 object-cover"
                    />
                    <span className="truncate text-xs text-gray-400">Image d&apos;aperçu du lien</span>
                    <button
                      type="button"
                      onClick={() => updateRow(form, set, "logistics", i, { imageUrl: null })}
                      className="inline-flex items-center gap-1 rounded px-1.5 py-1 text-xs text-gray-500 hover:bg-gray-100"
                    >
                      <X className="h-3.5 w-3.5" /> Retirer
                    </button>
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Card>
      )}

      {tab === "galerie" && (
      <Card
        title="Galerie photos"
        action={
          <button
            type="button"
            onClick={() => galleryInputRef.current?.click()}
            disabled={uploadingKind === "gallery"}
            className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95 disabled:opacity-60"
          >
            {uploadingKind === "gallery" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            Ajouter des photos
          </button>
        }
      >
        <input ref={galleryInputRef} type="file" accept="image/*" multiple className="hidden" onChange={handleGalleryUpload} />
        {form.photos.length === 0 ? (
          <EmptyHint text="Ajoute un moodboard ou des photos d'éditions précédentes." />
        ) : (
          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
            {form.photos.map((src, i) => (
              <div key={`${src}-${i}`} className="group relative aspect-square overflow-hidden rounded-lg border border-gray-200">
                <img src={src} alt="" className="h-full w-full object-cover" />
                <button
                  type="button"
                  onClick={() => set("photos", form.photos.filter((_, idx) => idx !== i))}
                  className="absolute right-1 top-1 rounded-full bg-black/60 p-1 text-white opacity-0 transition-opacity group-hover:opacity-100"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              </div>
            ))}
          </div>
        )}
      </Card>
      )}

      {tab === "contact" && (
      <Card title="Contact (CTA)">
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
          <div>
            <label className={labelCls}>Nom du contact</label>
            <input className={inputCls} value={form.contactName || ""} onChange={(e) => set("contactName", e.target.value)} placeholder="Inès" />
          </div>
          <div>
            <label className={labelCls}>Email du contact</label>
            <input className={inputCls} type="email" value={form.contactEmail || ""} onChange={(e) => set("contactEmail", e.target.value)} placeholder="ines@glowupagence.fr" />
          </div>
        </div>
      </Card>
      )}
    </div>
  );
}

function updateRow<K extends "casting" | "budgetLines" | "deliverables" | "logistics">(
  form: Proposal,
  set: <T extends keyof Proposal>(key: T, value: Proposal[T]) => void,
  key: K,
  index: number,
  patch: Partial<Proposal[K][number]>
) {
  const arr = [...(form[key] as Proposal[K][number][])];
  arr[index] = { ...arr[index], ...patch };
  set(key, arr as Proposal[K]);
}

function removeRow<K extends "casting" | "budgetLines" | "deliverables" | "logistics">(
  form: Proposal,
  set: <T extends keyof Proposal>(key: T, value: Proposal[T]) => void,
  key: K,
  index: number
) {
  const arr = (form[key] as Proposal[K][number][]).filter((_, i) => i !== index);
  set(key, arr as Proposal[K]);
}

function Card({ title, action, children }: { title: string; action?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
      <div className="mb-5 flex items-center justify-between gap-3">
        <h4 className="text-base font-semibold text-gray-900">{title}</h4>
        {action}
      </div>
      <div className="space-y-4">{children}</div>
    </div>
  );
}

function EmptyHint({ text }: { text: string }) {
  return <p className="rounded-lg bg-gray-50 px-3 py-4 text-center text-xs text-gray-400">{text}</p>;
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="h-9 w-12 shrink-0 cursor-pointer rounded border border-gray-300"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="w-full rounded-lg border border-gray-300 px-2 py-2 text-sm"
        />
      </div>
    </div>
  );
}

function UploadField({
  label,
  url,
  uploading,
  onPick,
  onClear,
  contain,
}: {
  label: string;
  url?: string | null;
  uploading: boolean;
  onPick: () => void;
  onClear: () => void;
  contain?: boolean;
}) {
  return (
    <div>
      <label className="mb-1 block text-xs font-medium text-gray-500">{label}</label>
      <div className="flex items-center gap-3">
        <div className="flex h-16 w-24 items-center justify-center overflow-hidden rounded-lg border border-gray-200 bg-gray-50">
          {url ? (
            <img src={url} alt="" className={`h-full w-full ${contain ? "object-contain p-1" : "object-cover"}`} />
          ) : (
            <ImagePlus className="h-5 w-5 text-gray-300" />
          )}
        </div>
        <div className="flex flex-col gap-1">
          <button
            type="button"
            onClick={onPick}
            disabled={uploading}
            className="inline-flex items-center gap-1.5 rounded-lg border border-gray-300 px-2.5 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50 disabled:opacity-60"
          >
            {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImagePlus className="h-3.5 w-3.5" />}
            {url ? "Remplacer" : "Importer"}
          </button>
          {url ? (
            <button type="button" onClick={onClear} className="text-left text-[11px] font-medium text-red-600">
              Retirer
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
