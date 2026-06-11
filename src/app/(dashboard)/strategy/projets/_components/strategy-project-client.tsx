"use client";

import { Fragment, useMemo, useState, useEffect, useRef } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Plus, Lock, Mail, Send, ExternalLink, Eye, Reply, Clock } from "lucide-react";
import RichEmailEditor from "@/components/email/RichEmailEditor";
import { businessDaysAfter } from "@/lib/business-days";

type Tab = "casting" | "marques" | "planning" | "deals";

const tabs: Array<{ key: Tab; label: string }> = [
  { key: "casting", label: "Casting" },
  { key: "marques", label: "Marques" },
  { key: "planning", label: "Planning" },
  { key: "deals", label: "Deals" },
];

const pipelineColumns = [
  { key: "IDENTIFIEE", label: "Identifiée" },
  { key: "CONTACTEE", label: "Contactée" },
  { key: "EN_NEGO", label: "En négo" },
  { key: "SIGNEE", label: "Signée" },
  { key: "PERDUE", label: "Perdue" },
] as const;

function TabStub({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white p-6">
      <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
      {subtitle ? <p className="mt-1 text-sm text-gray-500">{subtitle}</p> : null}
      <p className="mt-4 text-sm text-gray-600">A venir</p>
    </div>
  );
}

type Kpis = {
  talentsConfirmes: number;
  talentsPressentis: number;
  pipelineMarques: number;
  marquesEnNego: number;
  caPotentiel: number;
  caConfirme: number;
  dealsSignes: number;
};

type Participant = {
  id: string;
  projetId: string;
  talentId: string;
  dateArrivee: string | null;
  dateDepart: string | null;
  statut: "PRESSENTI" | "CONFIRME" | "DESISTE" | string;
  notes?: string | null;
  talent: {
    id: string;
    prenom: string;
    nom: string;
    avatar: string | null;
    niche: string | null;
    handle: string | null;
    abonnes: number | null;
    engagement: number | null;
  };
  marquesMatchees: string[];
};

type Opportunite = {
  id: string;
  nomMarque: string;
  marqueId?: string | null;
  secteur: string | null;
  angleNote: string | null;
  budgetEstime: number | null;
  typeActivation: string | null;
  talents: unknown;
  ownerId: string | null;
  statut: string;
  contactQualifie: boolean;
  lastEmailSentAt?: string | null;
  lastEmailFrom?: string | null;
  emailSubject?: string | null;
  emailOpenedAt?: string | null;
  emailOpenCount?: number;
  emailRepliedAt?: string | null;
  relanceSentAt?: string | null;
  dateActivation?: string | null;
  montantFinal?: number | null;
  statutLivraison?: string;
  talentsLabel?: string[];
  talentsMeta?: Array<{ id: string; name: string; photo?: string | null }>;
  updatedAt?: string;
  contacts?: unknown;
};

type ClientLanguage = "FR" | "EN" | "";

type PlanningPayload = {
  projet: { id: string; dateDebut: string; dateFin: string };
  participants: Array<{
    id: string;
    dateArrivee: string | null;
    dateDepart: string | null;
    talent: { prenom: string; nom: string; niches: string[] };
  }>;
  opportunitesSignees: Array<{ id: string; nomMarque: string; dateActivation: string | null }>;
};

type TalentOption = {
  id: string;
  prenom: string;
  nom: string;
  instagram?: string | null;
  photo?: string | null;
  niches?: string[];
};

const emptyKpis: Kpis = {
  talentsConfirmes: 0,
  talentsPressentis: 0,
  pipelineMarques: 0,
  marquesEnNego: 0,
  caPotentiel: 0,
  caConfirme: 0,
  dealsSignes: 0,
};

function formatDate(value?: string | null) {
  if (!value) return "-";
  return new Date(value).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" });
}

function formatMoney(v?: number | null) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", maximumFractionDigits: 0 }).format(v || 0);
}

function asArrayIds(v: unknown): string[] {
  return Array.isArray(v) ? v.map(String) : [];
}

function asContacts(v: unknown): Array<{
  firstName?: string;
  lastName?: string;
  email?: string;
  role?: string;
}> {
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

function initials(name: string): string {
  return name
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((s) => s[0]?.toUpperCase() || "")
    .join("");
}

function TalentAvatar({
  name,
  photo,
  className = "h-8 w-8",
}: {
  name: string;
  photo?: string | null;
  className?: string;
}) {
  return (
    <div className={`${className} rounded-full bg-gradient-to-br from-gray-100 to-gray-200 overflow-hidden flex items-center justify-center`}>
      {photo ? (
        <img src={photo} alt={name} className="h-full w-full object-cover" />
      ) : (
        <span className="text-[10px] font-semibold text-gray-600">{initials(name)}</span>
      )}
    </div>
  );
}

function TalentChip({ name, photo }: { name: string; photo?: string | null }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-2 py-1 text-xs text-gray-700">
      <TalentAvatar name={name} photo={photo} className="h-5 w-5" />
      {name}
    </span>
  );
}

function statusClass(statut: string) {
  if (statut === "CONFIRME") return "bg-emerald-100 text-emerald-700";
  if (statut === "DESISTE") return "bg-gray-100 text-gray-700";
  return "bg-orange-100 text-orange-700";
}

function deliveryClass(statut?: string) {
  if (statut === "LIVRE") return "bg-emerald-100 text-emerald-700";
  if (statut === "EN_COURS") return "bg-orange-100 text-orange-700";
  return "bg-gray-100 text-gray-700";
}

function isRelanceDue(opportunite: Opportunite): boolean {
  // Mail envoyé depuis la plateforme : la relance auto J+3 ouvrés s'en charge
  if (opportunite.lastEmailSentAt) return false;
  if (opportunite.statut !== "CONTACTEE") return false;
  if (!opportunite.updatedAt) return false;
  const updatedAt = new Date(opportunite.updatedAt).getTime();
  if (Number.isNaN(updatedAt)) return false;
  const diffMs = Date.now() - updatedAt;
  return diffMs >= 72 * 60 * 60 * 1000;
}

function formatShortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("fr-FR", { day: "numeric", month: "short" });
}

/**
 * Badges de suivi du mail de prospection envoyé depuis la plateforme :
 * envoyé / ouvert / répondu / relance auto J+3 ouvrés.
 */
function EmailTrackingBadges({
  opportunite: o,
  detailed = false,
}: {
  opportunite: Opportunite;
  detailed?: boolean;
}) {
  if (!o.lastEmailSentAt) return null;

  const relancePrevue = businessDaysAfter(new Date(o.lastEmailSentAt), 3);
  const base = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium";

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className={`${base} bg-gray-100 text-gray-700`} title={o.lastEmailFrom ? `Envoyé depuis ${o.lastEmailFrom}` : undefined}>
        <Mail className="h-3 w-3" />
        Envoyé {formatShortDate(o.lastEmailSentAt)}
      </span>

      {o.emailOpenedAt ? (
        <span className={`${base} bg-sky-100 text-sky-800`} title={`Première ouverture le ${new Date(o.emailOpenedAt).toLocaleString("fr-FR")}`}>
          <Eye className="h-3 w-3" />
          Ouvert{detailed && (o.emailOpenCount || 0) > 1 ? ` ×${o.emailOpenCount}` : ""}
        </span>
      ) : detailed ? (
        <span className={`${base} bg-gray-50 text-gray-400`}>
          <Eye className="h-3 w-3" />
          Pas encore ouvert
        </span>
      ) : null}

      {o.emailRepliedAt ? (
        <span className={`${base} bg-emerald-100 text-emerald-800`} title={`Réponse le ${new Date(o.emailRepliedAt).toLocaleString("fr-FR")}`}>
          <Reply className="h-3 w-3" />
          A répondu
        </span>
      ) : null}

      {o.relanceSentAt ? (
        <span className={`${base} bg-indigo-100 text-indigo-800`}>
          <Send className="h-3 w-3" />
          Relancé {formatShortDate(o.relanceSentAt)}
        </span>
      ) : o.emailRepliedAt ? (
        detailed ? (
          <span className={`${base} bg-gray-50 text-gray-400`}>Relance annulée (réponse reçue)</span>
        ) : null
      ) : (
        <span className={`${base} bg-amber-100 text-amber-800`} title="Relance automatique dans le même fil Gmail si pas de réponse (J+3 ouvrés)">
          <Clock className="h-3 w-3" />
          Relance auto {formatShortDate(relancePrevue.toISOString())}
        </span>
      )}
    </div>
  );
}

function decodeClientLanguageFromAngleNote(angleNote?: string | null): {
  language: ClientLanguage;
  cleanNote: string;
} {
  const raw = (angleNote || "").trim();
  const match = raw.match(/^\[CLIENT_LANG:(FR|EN)\]\s*/);
  const language = (match?.[1] as ClientLanguage | undefined) || "";
  const cleanNote = raw.replace(/^\[CLIENT_LANG:(FR|EN)\]\s*/, "");
  return { language, cleanNote };
}

type SearchedContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  companyName: string;
  source: "app" | "hubspot";
};

type SenderAccount = {
  email: string;
  label: string;
};

const DEFAULT_SENDER_EMAIL = "leyna@glowupagence.fr";

function senderLabelFor(accounts: SenderAccount[], email: string | null): string {
  const normalized = (email || "").trim().toLowerCase() || DEFAULT_SENDER_EMAIL;
  const account = accounts.find((a) => a.email.toLowerCase() === normalized);
  if (account) return `${account.label} (${normalized})`;
  if (normalized === DEFAULT_SENDER_EMAIL) return `Leyna (${normalized})`;
  return normalized;
}

function encodeClientLanguageIntoAngleNote(
  cleanNote?: string | null,
  language?: ClientLanguage
): string | null {
  const note = (cleanNote || "").trim();
  if (!language) return note || null;
  const payload = `[CLIENT_LANG:${language}]`;
  return note ? `${payload} ${note}` : payload;
}

export function StrategyProjectClient({
  projetSlug,
  projetNom,
}: {
  projetSlug: string;
  projetNom: string;
}) {
  const { data: session } = useSession();
  const role = (session?.user as { role?: string } | undefined)?.role ?? "";
  const isAdmin = role === "ADMIN";
  // La strategy planner (Ines) rédige et envoie elle-même la prospection
  const canSendProspection = isAdmin || role === "STRATEGY_PLANNER";

  const [activeTab, setActiveTab] = useState<Tab>("casting");
  const [loading, setLoading] = useState(true);
  const [kpis, setKpis] = useState<Kpis>(emptyKpis);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [opportunites, setOpportunites] = useState<Opportunite[]>([]);
  const [deals, setDeals] = useState<Opportunite[]>([]);
  const [planning, setPlanning] = useState<PlanningPayload | null>(null);
  const [projetId, setProjetId] = useState<string>("");
  const [talentOptions, setTalentOptions] = useState<TalentOption[]>([]);
  const [selectedDeal, setSelectedDeal] = useState<Opportunite | null>(null);
  const [selectedPipelineOpp, setSelectedPipelineOpp] = useState<Opportunite | null>(null);
  const [selectedPipelineTalentIds, setSelectedPipelineTalentIds] = useState<string[]>([]);
  const [dealModalOpp, setDealModalOpp] = useState<Opportunite | null>(null);
  const [dealForm, setDealForm] = useState<{
    montantFinal: string;
    dateActivation: string;
    typeActivation: string;
    details: string;
    talents: string[];
  }>({
    montantFinal: "",
    dateActivation: "",
    typeActivation: "",
    details: "",
    talents: [],
  });
  const [draggingOppId, setDraggingOppId] = useState<string | null>(null);
  const [dropTargetStatus, setDropTargetStatus] = useState<string | null>(null);
  const pipelineScrollRef = useRef<HTMLDivElement | null>(null);
  const pipelineDragRef = useRef<{
    active: boolean;
    moved: boolean;
    startX: number;
    startScrollLeft: number;
  }>({ active: false, moved: false, startX: 0, startScrollLeft: 0 });

  const [showAddTalent, setShowAddTalent] = useState(false);
  const [showAddMarque, setShowAddMarque] = useState(false);
  const [qualifyTarget, setQualifyTarget] = useState<Opportunite | null>(null);
  const [qualifierSearch, setQualifierSearch] = useState("");
  const [qualifierVisibleCount, setQualifierVisibleCount] = useState(24);
  const [contacts, setContacts] = useState<Array<{ firstName: string; lastName: string; email: string; role: string }>>([
    { firstName: "", lastName: "", email: "", role: "" },
  ]);
  const [contactSearchLoading, setContactSearchLoading] = useState(false);
  const [contactSearchError, setContactSearchError] = useState<string | null>(null);
  const [contactSearchResults, setContactSearchResults] = useState<SearchedContact[] | null>(null);

  // Boîte d'envoi du projet + envoi du mail de prospection (ADMIN)
  const [projetSenderEmail, setProjetSenderEmail] = useState<string | null>(null);
  const [senderAccounts, setSenderAccounts] = useState<SenderAccount[]>([]);
  const [emailModalOpp, setEmailModalOpp] = useState<Opportunite | null>(null);
  const [emailForm, setEmailForm] = useState({ subject: "", bodyHtml: "" });
  const [emailSending, setEmailSending] = useState(false);
  const [emailError, setEmailError] = useState<string | null>(null);

  const [newTalent, setNewTalent] = useState({
    talentId: "",
    statut: "PRESSENTI",
    dateArrivee: "",
    dateDepart: "",
  });

  const [newMarque, setNewMarque] = useState({
    nomMarque: "",
    secteur: "MODE",
    clientLanguage: "FR" as ClientLanguage,
    angleNote: "",
    budgetEstime: "",
    talents: [] as string[],
  });

  const brandResearchInputRef = useRef<HTMLInputElement | null>(null);
  const [brandResearchLoading, setBrandResearchLoading] = useState(false);
  const [brandResearchError, setBrandResearchError] = useState<string | null>(null);
  const [brandResearchResult, setBrandResearchResult] = useState<{
    recentCampaigns: string;
    newProducts: string;
    brandPositioning: string;
    influenceStrategy: string;
  } | null>(null);

  async function runBrandResearch() {
    const name = (brandResearchInputRef.current?.value || "").trim();
    if (!name) {
      window.alert("Merci de saisir un nom de marque.");
      return;
    }
    setBrandResearchLoading(true);
    setBrandResearchError(null);
    try {
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName: name }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        const msg = typeof json.error === "string" && json.error ? json.error : "Erreur lors de la recherche marque.";
        setBrandResearchError(msg);
        setBrandResearchResult(null);
        return;
      }
      const data = (await res.json()) as {
        recentCampaigns?: string;
        newProducts?: string;
        brandPositioning?: string;
        influenceStrategy?: string;
      };
      setBrandResearchResult({
        recentCampaigns: data.recentCampaigns || "",
        newProducts: data.newProducts || "",
        brandPositioning: data.brandPositioning || "",
        influenceStrategy: data.influenceStrategy || "",
      });
    } catch (e) {
      console.error(e);
      setBrandResearchError("Erreur réseau lors de l'appel à Grok.");
      setBrandResearchResult(null);
    } finally {
      setBrandResearchLoading(false);
    }
  }

  async function refreshAll() {
    setLoading(true);
    try {
      const slug = encodeURIComponent(projetSlug);
      const [kpisRes, castingRes, oppRes, planningRes, dealsRes, talentsRes, projetRes] =
        await Promise.all([
          fetch(`/api/strategy/kpis?projetSlug=${slug}`),
          fetch(`/api/strategy/casting?projetSlug=${slug}`),
          fetch(`/api/strategy/opportunites?projetSlug=${slug}`),
          fetch(`/api/strategy/planning?projetSlug=${slug}`),
          fetch(`/api/strategy/deals?projetSlug=${slug}`),
          fetch("/api/talents"),
          fetch(`/api/strategy/projets?projetSlug=${slug}`),
        ]);

      if (kpisRes.ok) setKpis(await kpisRes.json());
      if (castingRes.ok) {
        const json = await castingRes.json();
        setParticipants(json.participants || []);
        setProjetId(json.projet?.id || "");
      }
      if (oppRes.ok) setOpportunites((await oppRes.json()).opportunites || []);
      if (planningRes.ok) setPlanning(await planningRes.json());
      if (dealsRes.ok) setDeals((await dealsRes.json()).deals || []);
      if (talentsRes.ok) {
        const json = await talentsRes.json();
        const list = Array.isArray(json) ? json : json.talents || [];
        setTalentOptions(list);
      }
      if (projetRes.ok) {
        const json = await projetRes.json();
        setProjetSenderEmail(json.projet?.senderEmail ?? null);
      }
    } finally {
      setLoading(false);
    }
  }

  // Liste des boîtes connectées (labels + sélecteur admin) — 403 silencieux
  // pour les rôles sans accès.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/gmail/accounts");
        if (!res.ok) return;
        const json = (await res.json().catch(() => ({}))) as {
          accounts?: Array<{
            email: string;
            displayName: string | null;
            user: { prenom: string; nom: string } | null;
          }>;
        };
        if (cancelled) return;
        setSenderAccounts(
          (json.accounts || []).map((a) => ({
            email: a.email,
            label:
              a.displayName || (a.user ? `${a.user.prenom} ${a.user.nom}`.trim() : a.email),
          }))
        );
      } catch {
        /* non bloquant */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  async function updateProjetSender(senderEmail: string | null) {
    const res = await fetch("/api/strategy/projets", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ projetSlug, senderEmail }),
    });
    if (!res.ok) {
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      window.alert(json.error || "Erreur lors du changement de boîte d'envoi.");
      return;
    }
    const json = (await res.json()) as { projet?: { senderEmail: string | null } };
    setProjetSenderEmail(json.projet?.senderEmail ?? null);
  }

  function openEmailModal(opportunite: Opportunite) {
    setEmailError(null);
    setEmailForm({ subject: "", bodyHtml: "" });
    setEmailModalOpp(opportunite);
  }

  async function sendProspectionEmail() {
    if (!emailModalOpp) return;
    const bodyTextOnly = emailForm.bodyHtml.replace(/<[^>]*>/g, "").trim();
    if (!emailForm.subject.trim() || !bodyTextOnly) {
      setEmailError("Sujet et corps du mail requis.");
      return;
    }
    setEmailSending(true);
    setEmailError(null);
    try {
      const res = await fetch(`/api/strategy/opportunites/${emailModalOpp.id}/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: emailForm.subject.trim(),
          bodyHtml: emailForm.bodyHtml,
        }),
      });
      const json = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) {
        setEmailError(json.error || "Erreur lors de l'envoi.");
        return;
      }
      setEmailModalOpp(null);
      setSelectedPipelineOpp(null);
      refreshAll();
    } catch {
      setEmailError("Erreur réseau lors de l'envoi.");
    } finally {
      setEmailSending(false);
    }
  }

  useEffect(() => {
    refreshAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projetSlug]);

  const participantByTalentId = useMemo(() => {
    const m = new Map<string, Participant>();
    for (const p of participants) m.set(p.talentId, p);
    return m;
  }, [participants]);

  const confirmedParticipants = useMemo(
    () => participants.filter((p) => p.statut === "CONFIRME"),
    [participants]
  );
  const talentNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const t of talentOptions) {
      map.set(t.id, `${t.prenom} ${t.nom}`.trim());
    }
    for (const p of participants) {
      map.set(p.talentId, `${p.talent.prenom} ${p.talent.nom}`.trim());
    }
    return map;
  }, [talentOptions, participants]);
  const talentPhotoById = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const t of talentOptions) {
      map.set(t.id, t.photo ?? null);
    }
    for (const p of participants) {
      map.set(p.talentId, p.talent.avatar ?? null);
    }
    return map;
  }, [talentOptions, participants]);

  const qualifies = useMemo(
    () => opportunites.filter((o) => o.statut === "A_QUALIFIER"),
    [opportunites]
  );
  const filteredQualifies = useMemo(() => {
    const q = qualifierSearch.trim().toLowerCase();
    if (!q) return qualifies;
    return qualifies.filter((o) => {
      const pool = [o.nomMarque, o.secteur || "", o.angleNote || ""].join(" ").toLowerCase();
      return pool.includes(q);
    });
  }, [qualifies, qualifierSearch]);
  const displayedQualifies = useMemo(
    () => filteredQualifies.slice(0, qualifierVisibleCount),
    [filteredQualifies, qualifierVisibleCount]
  );
  const pipeline = useMemo(
    () => opportunites.filter((o) => o.statut !== "A_QUALIFIER"),
    [opportunites]
  );
  const relancesDueCount = useMemo(
    () => pipeline.filter((o) => isRelanceDue(o)).length,
    [pipeline]
  );

  async function saveNewTalent() {
    const res = await fetch("/api/strategy/casting", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projetId,
        ...newTalent,
        dateArrivee: newTalent.dateArrivee || null,
        dateDepart: newTalent.dateDepart || null,
      }),
    });
    if (res.ok) {
      setShowAddTalent(false);
      setNewTalent({ talentId: "", statut: "PRESSENTI", dateArrivee: "", dateDepart: "" });
      refreshAll();
    }
  }

  async function updateParticipant(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/strategy/casting/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    refreshAll();
  }

  async function saveNewMarque() {
    const res = await fetch("/api/strategy/opportunites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        projetSlug,
        nomMarque: newMarque.nomMarque,
        secteur: newMarque.secteur,
        budgetEstime: newMarque.budgetEstime ? Number(newMarque.budgetEstime) : null,
        talents: newMarque.talents,
        angleNote: encodeClientLanguageIntoAngleNote(newMarque.angleNote, newMarque.clientLanguage),
      }),
    });
    if (res.ok) {
      setShowAddMarque(false);
      setNewMarque({ nomMarque: "", secteur: "MODE", clientLanguage: "FR", angleNote: "", budgetEstime: "", talents: [] });
      refreshAll();
    }
  }

  function closeQualifyModal() {
    setQualifyTarget(null);
    setContacts([{ firstName: "", lastName: "", email: "", role: "" }]);
    setContactSearchResults(null);
    setContactSearchError(null);
  }

  async function searchBrandContacts() {
    if (!qualifyTarget) return;
    setContactSearchLoading(true);
    setContactSearchError(null);
    try {
      const res = await fetch(
        `/api/marques/contacts?brand=${encodeURIComponent(qualifyTarget.nomMarque)}`
      );
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setContactSearchError(
          typeof json.error === "string" && json.error
            ? json.error
            : "Erreur lors de la recherche des contacts."
        );
        setContactSearchResults(null);
        return;
      }
      const json = (await res.json()) as {
        contacts?: SearchedContact[];
        marqueId?: string | null;
      };
      setContactSearchResults(json.contacts || []);
      // La marque existe dans le CRM interne → lien direct vers sa fiche
      if (json.marqueId) {
        setQualifyTarget((prev) =>
          prev ? { ...prev, marqueId: json.marqueId ?? prev.marqueId } : prev
        );
      }
    } catch (e) {
      console.error(e);
      setContactSearchError("Erreur réseau lors de la recherche des contacts.");
      setContactSearchResults(null);
    } finally {
      setContactSearchLoading(false);
    }
  }

  function addSearchedContact(c: SearchedContact) {
    setContacts((arr) => {
      if (arr.some((x) => x.email.trim().toLowerCase() === c.email.trim().toLowerCase())) {
        return arr;
      }
      const next = {
        firstName: c.firstname,
        lastName: c.lastname,
        email: c.email,
        role: c.role,
      };
      const emptyIdx = arr.findIndex(
        (x) => !x.firstName.trim() && !x.lastName.trim() && !x.email.trim() && !x.role.trim()
      );
      if (emptyIdx >= 0) {
        return arr.map((x, i) => (i === emptyIdx ? next : x));
      }
      return [...arr, next];
    });
  }

  async function saveContacts() {
    if (!qualifyTarget) return;
    const cleaned = contacts.filter((c) => c.firstName.trim() && c.email.trim());
    if (cleaned.length === 0) return;
    const res = await fetch(`/api/strategy/opportunites/${qualifyTarget.id}/qualifier`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contacts: cleaned, statut: "IDENTIFIEE", contactQualifie: true }),
    });
    if (res.ok) {
      closeQualifyModal();
      refreshAll();
    }
  }

  async function patchOpportunite(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/strategy/opportunites/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    refreshAll();
  }

  async function deleteOpportunite(id: string) {
    const ok = window.confirm("Supprimer cette marque du pipeline ?");
    if (!ok) return;
    await fetch(`/api/strategy/opportunites/${id}`, { method: "DELETE" });
    if (selectedPipelineOpp?.id === id) {
      setSelectedPipelineOpp(null);
    }
    refreshAll();
  }

  async function savePipelineTalents() {
    if (!selectedPipelineOpp) return;
    await patchOpportunite(selectedPipelineOpp.id, { talents: selectedPipelineTalentIds });
    setSelectedPipelineOpp((prev) =>
      prev ? { ...prev, talents: selectedPipelineTalentIds } : prev
    );
  }

  async function moveOpportuniteToStatus(opportuniteId: string, newStatus: string) {
    const current = pipeline.find((o) => o.id === opportuniteId);
    if (!current || current.statut === newStatus) return;
    if (newStatus === "SIGNEE") {
      openDealModal(current);
      return;
    }
    await patchOpportunite(opportuniteId, { statut: newStatus });
  }

  async function patchDeal(id: string, patch: Record<string, unknown>) {
    await fetch(`/api/strategy/deals/${id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(patch),
    });
    refreshAll();
  }

  function onPipelineMouseDown(e: React.MouseEvent<HTMLDivElement>) {
    const el = pipelineScrollRef.current;
    if (!el) return;
    pipelineDragRef.current.active = true;
    pipelineDragRef.current.moved = false;
    pipelineDragRef.current.startX = e.pageX;
    pipelineDragRef.current.startScrollLeft = el.scrollLeft;
  }

  function onPipelineMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const el = pipelineScrollRef.current;
    if (!el || !pipelineDragRef.current.active) return;
    e.preventDefault();
    const delta = e.pageX - pipelineDragRef.current.startX;
    if (Math.abs(delta) > 4) {
      pipelineDragRef.current.moved = true;
    }
    el.scrollLeft = pipelineDragRef.current.startScrollLeft - delta;
  }

  function onPipelineMouseUpOrLeave() {
    pipelineDragRef.current.active = false;
  }

  function onPipelineCardClick(opportunite: Opportunite) {
    // Si l'utilisateur a glissé, on n'ouvre pas la fiche (sinon sensation de "ça ne scroll pas").
    if (pipelineDragRef.current.moved) {
      pipelineDragRef.current.moved = false;
      return;
    }
    setSelectedPipelineOpp(opportunite);
    setSelectedPipelineTalentIds(asArrayIds(opportunite.talents));
  }

  function openDealModal(opportunite: Opportunite) {
    setDealModalOpp(opportunite);
    setDealForm({
      montantFinal: opportunite.montantFinal ? String(opportunite.montantFinal) : "",
      dateActivation: opportunite.dateActivation
        ? new Date(opportunite.dateActivation).toISOString().slice(0, 10)
        : "",
      typeActivation: opportunite.typeActivation || "",
      details: opportunite.angleNote || "",
      talents: asArrayIds(opportunite.talents),
    });
  }

  async function confirmSignedDeal() {
    if (!dealModalOpp) return;
    if (!dealForm.montantFinal || Number(dealForm.montantFinal) <= 0) {
      window.alert("Merci de renseigner un prix signé valide.");
      return;
    }
    if (dealForm.talents.length === 0) {
      window.alert("Merci de sélectionner au moins un talent.");
      return;
    }
    if (!dealForm.details.trim()) {
      window.alert("Merci de renseigner les détails du deal.");
      return;
    }

    await patchOpportunite(dealModalOpp.id, {
      statut: "SIGNEE",
      montantFinal: Number(dealForm.montantFinal),
      dateActivation: dealForm.dateActivation || null,
      typeActivation: dealForm.typeActivation || null,
      angleNote: dealForm.details,
      talents: dealForm.talents,
    });
    setDealModalOpp(null);
  }

  const planningDays = useMemo(() => {
    if (!planning?.projet) return [] as Date[];
    const start = new Date(planning.projet.dateDebut);
    const end = new Date(planning.projet.dateFin);
    const days: Date[] = [];
    for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
      days.push(new Date(d));
    }
    return days;
  }, [planning]);

  const content = useMemo(() => {
    if (loading) {
      return (
        <div className="rounded-xl border border-gray-200 bg-white p-8 flex items-center justify-center">
          <Loader2 className="w-6 h-6 animate-spin text-gray-500" />
        </div>
      );
    }

    switch (activeTab) {
      case "casting":
        return (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Casting</h2>
              <button
                type="button"
                onClick={() => setShowAddTalent(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-glowup-rose px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95"
              >
                <Plus className="w-4 h-4" /> Ajouter un talent
              </button>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
              {participants.map((p) => {
                const dayCount =
                  p.dateArrivee && p.dateDepart
                    ? Math.max(
                        1,
                        Math.ceil(
                          (new Date(p.dateDepart).getTime() - new Date(p.dateArrivee).getTime()) /
                            (24 * 3600 * 1000)
                        ) + 1
                      )
                    : null;
                return (
                  <div key={p.id} className="rounded-2xl border border-gray-200 bg-white p-4 space-y-3 shadow-sm">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <TalentAvatar
                          name={`${p.talent.prenom} ${p.talent.nom}`}
                          photo={p.talent.avatar}
                          className="h-12 w-12"
                        />
                        <div>
                          <p className="font-semibold text-gray-900">{p.talent.prenom} {p.talent.nom}</p>
                          <p className="text-xs text-gray-500">@{p.talent.handle || "sans-handle"} · {p.talent.niche || "Niche non renseignée"}</p>
                        </div>
                      </div>
                      <span className={`px-2.5 py-1 rounded-full text-xs font-medium ${statusClass(p.statut)}`}>
                        {p.statut}
                      </span>
                    </div>
                    <p className="text-sm text-gray-600">
                      {p.dateArrivee && p.dateDepart
                        ? `${formatDate(p.dateArrivee)} -> ${formatDate(p.dateDepart)} · ${dayCount} jours`
                        : "Dates non renseignées"}
                    </p>
                    <p className="text-sm text-gray-600">
                      {p.talent.abonnes ? `${p.talent.abonnes.toLocaleString("fr-FR")} abonnés` : "Abonnés n/a"} ·{" "}
                      {typeof p.talent.engagement === "number" ? `${Number(p.talent.engagement).toFixed(2)}% ER` : "ER n/a"}
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {(p.marquesMatchees || []).slice(0, 3).map((m) => (
                        <span key={m} className="px-2 py-1 rounded-full bg-pink-50 text-pink-700 text-xs">{m}</span>
                      ))}
                    </div>
                    <select
                      value={p.statut}
                      onChange={(e) => updateParticipant(p.id, { statut: e.target.value })}
                      className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                    >
                      <option value="PRESSENTI">PRESSENTI</option>
                      <option value="CONFIRME">CONFIRME</option>
                      <option value="DESISTE">DESISTE</option>
                    </select>
                  </div>
                );
              })}
            </div>
          </div>
        );
      case "marques":
        return (
          <div className="space-y-6">
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">Marques</h2>
              <button
                type="button"
                onClick={() => setShowAddMarque(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-glowup-rose px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95"
              >
                <Plus className="w-4 h-4" /> Marque identifiée
              </button>
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <h3 className="text-base font-semibold mb-3">Recherche auto</h3>
              <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-end">
                <div className="flex-1">
                  <label className="block text-xs font-medium text-gray-500 mb-1">
                    Nom de la marque
                  </label>
                  <input
                    ref={brandResearchInputRef}
                    placeholder='Ex: "Yves Saint Laurent Beauté"'
                    className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                  />
                </div>
                <button
                  type="button"
                  onClick={runBrandResearch}
                  disabled={brandResearchLoading}
                  className="inline-flex items-center justify-center gap-2 rounded-xl bg-glowup-rose px-4 py-2 text-sm font-medium text-white shadow-sm hover:opacity-95 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {brandResearchLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Analyse en cours...
                    </>
                  ) : (
                    <>
                      <Plus className="w-4 h-4" />
                      Lancer l'analyse
                    </>
                  )}
                </button>
              </div>
              {brandResearchError && (
                <p className="mt-3 text-sm text-red-600">{brandResearchError}</p>
              )}
              {brandResearchResult && (
                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-3 text-sm text-gray-700">
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      Campagnes récentes
                    </p>
                    <p className="whitespace-pre-line">{brandResearchResult.recentCampaigns || "Aucune information disponible."}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      Dernières nouveautés produit
                    </p>
                    <p className="whitespace-pre-line">{brandResearchResult.newProducts || "Aucune information disponible."}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      Positionnement de la marque
                    </p>
                    <p className="whitespace-pre-line">{brandResearchResult.brandPositioning || "Aucune information disponible."}</p>
                  </div>
                  <div className="rounded-xl border border-gray-200 bg-gray-50 p-3">
                    <p className="text-xs font-semibold text-gray-500 mb-1">
                      Stratégie influence actuelle
                    </p>
                    <p className="whitespace-pre-line">{brandResearchResult.influenceStrategy || "Aucune information disponible."}</p>
                  </div>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">À qualifier</h3>
                <span className="rounded-full bg-orange-50 px-2.5 py-1 text-xs font-medium text-orange-700">
                  {filteredQualifies.length} marque(s)
                </span>
              </div>
              <div className="mb-3">
                <input
                  value={qualifierSearch}
                  onChange={(e) => {
                    setQualifierSearch(e.target.value);
                    setQualifierVisibleCount(24);
                  }}
                  placeholder="Rechercher une marque / secteur..."
                  className="w-full rounded-xl border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-2 max-h-[560px] overflow-auto pr-1">
                {displayedQualifies.map((o) => (
                  <div key={o.id} className="rounded-xl border border-gray-200 px-3 py-2.5 bg-white">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{o.nomMarque}</p>
                        <p className="text-xs text-gray-500">{o.secteur || "Secteur n/a"}</p>
                      </div>
                      <span className="shrink-0 px-2 py-0.5 rounded-full bg-orange-100 text-orange-700 text-[11px] font-medium">
                        Contact manquant
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {asArrayIds(o.talents).map((id) => (
                        <TalentChip
                          key={id}
                          name={talentNameById.get(id) || id}
                          photo={talentPhotoById.get(id)}
                        />
                      ))}
                      {asArrayIds(o.talents).length === 0 ? (
                        <span className="text-xs text-gray-400">Aucun talent matche</span>
                      ) : null}
                    </div>
                    {o.angleNote ? (
                      <p className="mt-2 line-clamp-2 text-xs text-gray-500">{decodeClientLanguageFromAngleNote(o.angleNote).cleanNote}</p>
                    ) : null}
                    {decodeClientLanguageFromAngleNote(o.angleNote).language ? (
                      <span className="mt-2 inline-flex rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-medium text-indigo-700">
                        Client {decodeClientLanguageFromAngleNote(o.angleNote).language === "FR" ? "français" : "anglais"}
                      </span>
                    ) : null}
                    {isAdmin || role === "STRATEGY_PLANNER" ? (
                      <div className="mt-2 flex items-center gap-3">
                        <button
                          onClick={() => {
                            setContactSearchResults(null);
                            setContactSearchError(null);
                            setQualifyTarget(o);
                          }}
                          className="text-xs font-medium text-glowup-rose"
                        >
                          Ajouter le contact -&gt;
                        </button>
                        <button
                          onClick={() => deleteOpportunite(o.id)}
                          className="text-xs font-medium text-red-600"
                        >
                          Supprimer
                        </button>
                      </div>
                    ) : (
                      <p className="text-xs text-gray-500">En attente de qualification</p>
                    )}
                  </div>
                ))}
              </div>
              {qualifierVisibleCount < filteredQualifies.length && (
                <div className="mt-3 flex justify-center">
                  <button
                    type="button"
                    onClick={() => setQualifierVisibleCount((n) => n + 24)}
                    className="rounded-lg border border-gray-300 px-3 py-1.5 text-xs font-medium text-gray-700 hover:bg-gray-50"
                  >
                    Charger plus
                  </button>
                </div>
              )}
            </div>

            <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-sm">
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-base font-semibold">Pipeline actif</h3>
                <div className="flex items-center gap-2">
                  {relancesDueCount > 0 ? (
                    <span className="rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800">
                      {relancesDueCount} relance{relancesDueCount > 1 ? "s" : ""} à faire
                    </span>
                  ) : null}
                  <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                    {pipeline.length} opportunité(s)
                  </span>
                </div>
              </div>
              <div
                ref={pipelineScrollRef}
                className="overflow-x-auto cursor-grab active:cursor-grabbing select-none"
                onMouseDown={onPipelineMouseDown}
                onMouseMove={onPipelineMouseMove}
                onMouseUp={onPipelineMouseUpOrLeave}
                onMouseLeave={onPipelineMouseUpOrLeave}
              >
                <div className="grid min-w-[1200px] grid-cols-5 gap-4">
                {pipelineColumns.map((col) => (
                  <div
                    key={col.key}
                    className={`rounded-xl border p-3 bg-gray-50/40 transition-colors ${
                      col.key === "PERDUE" ? "opacity-60" : ""
                    } ${
                      dropTargetStatus === col.key
                        ? "border-glowup-rose ring-2 ring-glowup-rose/20"
                        : "border-gray-200"
                    }`}
                    onDragOver={(e) => {
                      e.preventDefault();
                      setDropTargetStatus(col.key);
                    }}
                    onDragLeave={() => setDropTargetStatus((prev) => (prev === col.key ? null : prev))}
                    onDrop={async (e) => {
                      e.preventDefault();
                      const id = e.dataTransfer.getData("text/plain");
                      setDropTargetStatus(null);
                      setDraggingOppId(null);
                      if (id) {
                        await moveOpportuniteToStatus(id, col.key);
                      }
                    }}
                  >
                    <p className="text-sm font-semibold mb-3">{col.label}</p>
                    <div className="space-y-3">
                      {pipeline.filter((o) => o.statut === col.key).map((o) => (
                        <div
                          key={o.id}
                          className={`rounded-xl border p-3 space-y-2 bg-white shadow-sm ${
                            isRelanceDue(o) ? "border-amber-300 bg-amber-50/40" : "border-gray-200"
                          } ${draggingOppId === o.id ? "opacity-60" : ""}`}
                          draggable
                          onDragStart={(e) => {
                            e.dataTransfer.setData("text/plain", o.id);
                            e.dataTransfer.effectAllowed = "move";
                            setDraggingOppId(o.id);
                          }}
                          onDragEnd={() => {
                            setDraggingOppId(null);
                            setDropTargetStatus(null);
                          }}
                          onClick={() => onPipelineCardClick(o)}
                        >
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-sm font-semibold">{o.nomMarque}</p>
                            {isAdmin && o.contactQualifie ? <Lock className="w-3.5 h-3.5 text-gray-500" /> : null}
                          </div>
                          {isRelanceDue(o) ? (
                            <div className="inline-flex items-center gap-1.5 rounded-full bg-amber-100 px-2 py-0.5 text-[11px] font-semibold text-amber-800">
                              <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                              Relance à faire (72h+)
                            </div>
                          ) : null}
                          <EmailTrackingBadges opportunite={o} />
                          <p className="text-xs text-gray-500">{o.secteur || "Secteur n/a"}</p>
                          <p className="text-xs">{formatMoney(o.budgetEstime)}</p>
                          <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-500">
                            Talents matchés
                          </p>
                          <div className="flex items-center gap-2">
                            {asArrayIds(o.talents).length > 0 ? (
                              <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-[11px] font-medium text-gray-700">
                                {asArrayIds(o.talents).length} talent
                                {asArrayIds(o.talents).length > 1 ? "s" : ""}
                              </span>
                            ) : (
                              <span className="text-[11px] text-gray-400">Aucun talent</span>
                            )}
                          </div>
                          <select
                            className="w-full rounded border border-gray-300 px-2 py-1 text-xs"
                            value={o.statut}
                            onClick={(e) => e.stopPropagation()}
                            onChange={(e) => {
                              const next = e.target.value;
                              if (next === "SIGNEE") {
                                openDealModal(o);
                                return;
                              }
                              patchOpportunite(o.id, { statut: next });
                            }}
                          >
                            <option value="IDENTIFIEE">IDENTIFIEE</option>
                            <option value="CONTACTEE">CONTACTEE</option>
                            <option value="EN_NEGO">EN_NEGO</option>
                            <option value="SIGNEE">SIGNEE</option>
                            <option value="PERDUE">PERDUE</option>
                          </select>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                </div>
              </div>
            </div>
          </div>
        );
      case "planning":
        if (!planning) return <TabStub title="Planning" />;
        return (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 overflow-auto shadow-sm">
            <div className="min-w-[980px]">
              <div className="grid" style={{ gridTemplateColumns: `220px repeat(${planningDays.length}, minmax(36px,1fr))` }}>
                <div className="font-semibold text-sm text-gray-700 p-2 border-b border-r border-gray-200">Talents confirmes</div>
                {planningDays.map((d) => {
                  const isWeekend = d.getDay() === 0 || d.getDay() === 6;
                  return (
                    <div key={d.toISOString()} className={`text-center text-xs p-2 border-b border-r border-gray-200 ${isWeekend ? "opacity-60" : ""}`}>
                      <div>{d.toLocaleDateString("fr-FR", { weekday: "short" })}</div>
                      <div className="font-semibold">{d.getDate()}</div>
                    </div>
                  );
                })}
                {planning.participants.map((p) => {
                  const start = p.dateArrivee ? new Date(p.dateArrivee) : null;
                  const end = p.dateDepart ? new Date(p.dateDepart) : null;
                  return (
                    <Fragment key={p.id}>
                      <div key={`name-${p.id}`} className="p-2 border-b border-r border-gray-200">
                        <p className="text-sm font-medium">{p.talent.prenom} {p.talent.nom}</p>
                        <p className="text-xs text-gray-500">{p.talent.niches?.[0] || "-"}</p>
                      </div>
                      {planningDays.map((d) => {
                        const startDay = start ? new Date(start) : null;
                        const endDay = end ? new Date(end) : null;
                        if (startDay) startDay.setHours(0, 0, 0, 0);
                        if (endDay) endDay.setHours(0, 0, 0, 0);
                        const present = startDay && endDay && d >= startDay && d <= endDay;
                        const activation = planning.opportunitesSignees.some((o) => {
                          if (!o.dateActivation) return false;
                          const ad = new Date(o.dateActivation);
                          return ad.toDateString() === d.toDateString();
                        });
                        return (
                          <div key={`${p.id}-${d.toISOString()}`} className="p-1 border-b border-r border-gray-200 h-9">
                            <div className={`h-full rounded ${activation ? "bg-pink-200" : present ? "bg-emerald-100" : "bg-gray-50"}`} />
                          </div>
                        );
                      })}
                    </Fragment>
                  );
                })}
              </div>
            </div>
          </div>
        );
      case "deals":
        return (
          <div className="rounded-2xl border border-gray-200 bg-white p-4 overflow-auto shadow-sm">
            <table className="w-full min-w-[900px]">
              <thead>
                <tr className="text-left text-xs text-gray-500 border-b border-gray-200">
                  <th className="py-2">Marque</th>
                  <th>Talent(s)</th>
                  <th>Type</th>
                  <th>Date prévue</th>
                  <th>Montant</th>
                  <th>Livraison</th>
                </tr>
              </thead>
              <tbody>
                {deals.map((d) => (
                  <tr key={d.id} className="border-b border-gray-100 cursor-pointer" onClick={() => setSelectedDeal(d)}>
                    <td className="py-3">{d.nomMarque}</td>
                    <td>
                      <div className="flex flex-wrap gap-1.5">
                        {(d.talentsMeta || []).length > 0
                          ? d.talentsMeta?.map((t) => (
                              <TalentChip key={t.id} name={t.name} photo={t.photo} />
                            ))
                          : <span className="text-gray-400">-</span>}
                      </div>
                    </td>
                    <td>{d.typeActivation || "-"}</td>
                    <td>{formatDate(d.dateActivation)}</td>
                    <td>{formatMoney(d.montantFinal ?? d.budgetEstime)}</td>
                    <td>
                      {isAdmin ? (
                        <select
                          value={d.statutLivraison || "A_FAIRE"}
                          onClick={(e) => e.stopPropagation()}
                          onChange={(e) => patchDeal(d.id, { statutLivraison: e.target.value })}
                          className={`rounded px-2 py-1 text-xs font-medium ${deliveryClass(d.statutLivraison)}`}
                        >
                          <option value="A_FAIRE">A FAIRE</option>
                          <option value="EN_COURS">EN COURS</option>
                          <option value="LIVRE">LIVRE</option>
                        </select>
                      ) : (
                        <span className={`rounded px-2 py-1 text-xs font-medium ${deliveryClass(d.statutLivraison)}`}>
                          {(d.statutLivraison || "A_FAIRE").replace("_", " ")}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr>
                  <td colSpan={6} className="pt-4 text-right text-sm font-semibold">
                    Total CA signé : {formatMoney(deals.reduce((s, d) => s + (d.montantFinal ?? 0), 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
        );
      default:
        return null;
    }
  }, [
    activeTab,
    brandResearchError,
    brandResearchLoading,
    brandResearchResult,
    deals,
    displayedQualifies,
    filteredQualifies.length,
    isAdmin,
    kpis.caConfirme,
    kpis.pipelineMarques,
    kpis.talentsConfirmes,
    kpis.talentsPressentis,
    loading,
    newMarque.clientLanguage,
    newMarque.nomMarque,
    newMarque.secteur,
    newMarque.talents,
    newTalent.dateArrivee,
    newTalent.dateDepart,
    newTalent.statut,
    newTalent.talentId,
    opportunites,
    participantByTalentId,
    participants,
    pipeline,
    planning,
    planningDays,
    qualifierSearch,
    qualifierVisibleCount,
    qualifies,
    relancesDueCount,
    role,
    selectedPipelineTalentIds,
    showAddMarque,
    showAddTalent,
    talentNameById,
    talentOptions,
    talentPhotoById,
  ]);

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-gray-200 bg-white p-6 shadow-sm">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-xs font-medium uppercase tracking-wide text-gray-500">Projet Strategy</p>
            <h1 className="mt-1 text-2xl font-semibold text-gray-900">{projetNom}</h1>
            <p className="mt-1 text-sm text-gray-500">Pilotage casting, marques, planning et deals.</p>
          </div>
          <div className="flex flex-col items-end gap-2">
            <span className="rounded-full bg-indigo-50 px-3 py-1 text-xs font-medium text-indigo-700">
              Espace Strategy
            </span>
            {isAdmin ? (
              <label className="flex items-center gap-2 text-xs text-gray-500">
                Prospection envoyée depuis
                <select
                  value={(projetSenderEmail || "").toLowerCase()}
                  onChange={(e) => updateProjetSender(e.target.value || null)}
                  className="rounded-lg border border-gray-300 px-2 py-1.5 text-xs font-medium text-gray-800"
                >
                  <option value="">Leyna (par défaut) — {DEFAULT_SENDER_EMAIL}</option>
                  {senderAccounts
                    .filter((a) => a.email.toLowerCase() !== DEFAULT_SENDER_EMAIL)
                    .map((a) => (
                      <option key={a.email} value={a.email.toLowerCase()}>
                        {a.label} — {a.email}
                      </option>
                    ))}
                  {projetSenderEmail &&
                    projetSenderEmail.toLowerCase() !== DEFAULT_SENDER_EMAIL &&
                    !senderAccounts.some(
                      (a) => a.email.toLowerCase() === projetSenderEmail.toLowerCase()
                    ) && (
                      <option value={projetSenderEmail.toLowerCase()}>
                        {projetSenderEmail} (non connectée)
                      </option>
                    )}
                </select>
              </label>
            ) : (
              <span className="text-xs text-gray-500">
                Prospection envoyée depuis {senderLabelFor(senderAccounts, projetSenderEmail)}
              </span>
            )}
          </div>
        </div>
        <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-3">
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Talents confirmes</p>
            <p className="text-xl font-semibold">{kpis.talentsConfirmes}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Talents pressentis</p>
            <p className="text-xl font-semibold">{kpis.talentsPressentis}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">Pipeline marques</p>
            <p className="text-xl font-semibold">{kpis.pipelineMarques}</p>
          </div>
          <div className="rounded-xl border border-gray-200 p-3">
            <p className="text-xs text-gray-500">CA confirme</p>
            <p className="text-xl font-semibold">{formatMoney(kpis.caConfirme)}</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-gray-200 bg-white p-2 shadow-sm">
        <div className="flex flex-wrap gap-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.key;
            return (
              <button
                key={tab.key}
                type="button"
                onClick={() => setActiveTab(tab.key)}
                className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
                  isActive
                    ? "bg-glowup-rose text-white shadow-sm"
                    : "text-gray-600 hover:bg-glowup-lace hover:text-glowup-licorice"
                }`}
              >
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {content}

      {showAddTalent && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-lg font-semibold">Ajouter un talent</h3>
            <select
              value={newTalent.talentId}
              onChange={(e) => setNewTalent((s) => ({ ...s, talentId: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="">Sélectionner un talent</option>
              {talentOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.prenom} {t.nom} {t.instagram ? `(@${t.instagram})` : ""}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-3">
              <select
                value={newTalent.statut}
                onChange={(e) => setNewTalent((s) => ({ ...s, statut: e.target.value }))}
                className="rounded-lg border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="PRESSENTI">PRESSENTI</option>
                <option value="CONFIRME">CONFIRME</option>
                <option value="DESISTE">DESISTE</option>
              </select>
              <input type="date" value={newTalent.dateArrivee} onChange={(e) => setNewTalent((s) => ({ ...s, dateArrivee: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
              <input type="date" value={newTalent.dateDepart} onChange={(e) => setNewTalent((s) => ({ ...s, dateDepart: e.target.value }))} className="rounded-lg border border-gray-300 px-3 py-2 text-sm" />
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={() => setShowAddTalent(false)}>Annuler</button>
              <button className="px-3 py-2 rounded bg-glowup-rose text-white" onClick={saveNewTalent}>Ajouter</button>
            </div>
          </div>
        </div>
      )}

      {showAddMarque && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-xl rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <h3 className="text-lg font-semibold">Marque identifiée</h3>
            <input
              value={newMarque.nomMarque}
              onChange={(e) => setNewMarque((s) => ({ ...s, nomMarque: e.target.value }))}
              placeholder="Nom de la marque"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <select
              value={newMarque.secteur}
              onChange={(e) => setNewMarque((s) => ({ ...s, secteur: e.target.value }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="MODE">MODE</option>
              <option value="BEAUTE">BEAUTE</option>
              <option value="LIFESTYLE">LIFESTYLE</option>
              <option value="FOOD">FOOD</option>
              <option value="TECH">TECH</option>
            </select>
            <select
              value={newMarque.clientLanguage}
              onChange={(e) => setNewMarque((state) => ({ ...state, clientLanguage: e.target.value as ClientLanguage }))}
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            >
              <option value="FR">Client français</option>
              <option value="EN">Client anglais</option>
            </select>
            <div>
              <p className="text-sm font-medium mb-2">Tous nos talents agence à matcher</p>
              <div className="grid grid-cols-2 gap-2 max-h-40 overflow-auto rounded-lg border border-gray-200 p-2">
                {talentOptions.map((t) => {
                  const checked = newMarque.talents.includes(t.id);
                  return (
                    <label key={t.id} className="flex items-center gap-2 text-sm rounded-lg border border-gray-100 px-2 py-1.5 hover:bg-gray-50">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setNewMarque((s) => ({
                            ...s,
                            talents: e.target.checked
                              ? [...s.talents, t.id]
                              : s.talents.filter((id) => id !== t.id),
                          }))
                        }
                      />
                      <TalentAvatar
                        name={`${t.prenom} ${t.nom}`}
                        photo={t.photo}
                        className="h-7 w-7"
                      />
                      <span className="flex flex-col leading-tight">
                        <span className="font-medium">{t.prenom} {t.nom}</span>
                        <span className="text-[11px] text-gray-500">@{t.instagram || "n/a"}</span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <input
              type="number"
              value={newMarque.budgetEstime}
              onChange={(e) => setNewMarque((s) => ({ ...s, budgetEstime: e.target.value }))}
              placeholder="Budget estime (optionnel)"
              className="w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
            />
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={() => setShowAddMarque(false)}>Annuler</button>
              <button className="px-3 py-2 rounded bg-glowup-rose text-white" onClick={saveNewMarque}>Créer</button>
            </div>
          </div>
        </div>
      )}

      {qualifyTarget && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[min(92vh,820px)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
              <h3 className="text-lg font-semibold">
                Ajouter les contacts · {qualifyTarget.nomMarque}
              </h3>
              {qualifyTarget.marqueId ? (
                <a
                  href={`/marques/${qualifyTarget.marqueId}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-xs font-medium text-[#B06F70] hover:underline"
                >
                  <ExternalLink className="h-3 w-3" />
                  Voir la fiche marque
                </a>
              ) : null}
            </div>
            <div className="rounded-xl border border-dashed border-gray-300 bg-gray-50 p-3 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <p className="text-sm text-gray-600">
                  Pas les contacts ? Cherche la marque dans l&apos;app et HubSpot
                </p>
                <button
                  type="button"
                  onClick={searchBrandContacts}
                  disabled={contactSearchLoading}
                  className="inline-flex items-center gap-2 rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-100 disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  {contactSearchLoading ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      Recherche...
                    </>
                  ) : (
                    <>Rechercher « {qualifyTarget.nomMarque} »</>
                  )}
                </button>
              </div>
              {contactSearchError && (
                <p className="text-sm text-red-600">{contactSearchError}</p>
              )}
              {contactSearchResults && contactSearchResults.length === 0 && (
                <p className="text-sm text-gray-500">
                  Aucun contact trouvé dans l&apos;app ni dans HubSpot pour cette marque.
                </p>
              )}
              {contactSearchResults && contactSearchResults.length > 0 && (
                <div className="space-y-1.5 max-h-56 overflow-auto pr-1">
                  {contactSearchResults.map((c) => {
                    const alreadyAdded = contacts.some(
                      (x) => x.email.trim().toLowerCase() === c.email.trim().toLowerCase()
                    );
                    return (
                      <div
                        key={c.id}
                        className="flex items-center justify-between gap-3 rounded-lg border border-gray-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-gray-900">
                            {`${c.firstname} ${c.lastname}`.trim() || c.email}
                            <span
                              className={`ml-2 rounded-full px-2 py-0.5 text-[10px] font-medium ${
                                c.source === "hubspot"
                                  ? "bg-orange-50 text-orange-700"
                                  : "bg-emerald-50 text-emerald-700"
                              }`}
                            >
                              {c.source === "hubspot" ? "HubSpot" : "App"}
                            </span>
                          </p>
                          <p className="truncate text-xs text-gray-500">
                            {c.email}
                            {c.role ? ` · ${c.role}` : ""}
                            {c.companyName ? ` · ${c.companyName}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={alreadyAdded}
                          onClick={() => addSearchedContact(c)}
                          className="shrink-0 rounded-lg bg-glowup-rose px-2.5 py-1.5 text-xs font-medium text-white hover:opacity-95 disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          {alreadyAdded ? "Ajouté" : "Ajouter"}
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
            {contacts.map((c, i) => (
              <div key={i} className="grid grid-cols-4 gap-2">
                <input className="rounded border border-gray-300 px-2 py-2 text-sm" placeholder="Prenom*" value={c.firstName} onChange={(e) => setContacts((arr) => arr.map((x, idx) => idx === i ? { ...x, firstName: e.target.value } : x))} />
                <input className="rounded border border-gray-300 px-2 py-2 text-sm" placeholder="Nom" value={c.lastName} onChange={(e) => setContacts((arr) => arr.map((x, idx) => idx === i ? { ...x, lastName: e.target.value } : x))} />
                <input className="rounded border border-gray-300 px-2 py-2 text-sm" placeholder="Email*" value={c.email} onChange={(e) => setContacts((arr) => arr.map((x, idx) => idx === i ? { ...x, email: e.target.value } : x))} />
                <input className="rounded border border-gray-300 px-2 py-2 text-sm" placeholder="Role/Poste" value={c.role} onChange={(e) => setContacts((arr) => arr.map((x, idx) => idx === i ? { ...x, role: e.target.value } : x))} />
              </div>
            ))}
            <button className="text-sm text-glowup-rose font-medium" onClick={() => setContacts((arr) => [...arr, { firstName: "", lastName: "", email: "", role: "" }])}>+ Ajouter un contact</button>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={closeQualifyModal}>Annuler</button>
              <button className="px-3 py-2 rounded bg-glowup-rose text-white" onClick={saveContacts}>Valider</button>
            </div>
          </div>
        </div>
      )}

      {selectedDeal && (
        <div className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4" onClick={() => setSelectedDeal(null)}>
          <div className="w-full max-w-lg rounded-xl border border-gray-200 bg-white p-5 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h3 className="text-lg font-semibold">{selectedDeal.nomMarque}</h3>
            <p className="text-sm text-gray-600">Type: {selectedDeal.typeActivation || "-"}</p>
            <p className="text-sm text-gray-600">Date: {formatDate(selectedDeal.dateActivation)}</p>
            <p className="text-sm text-gray-600">Montant: {formatMoney(selectedDeal.montantFinal ?? selectedDeal.budgetEstime)}</p>
            <div className="flex justify-end">
              <button className="px-3 py-2 rounded border" onClick={() => setSelectedDeal(null)}>Fermer</button>
            </div>
          </div>
        </div>
      )}

      {selectedPipelineOpp && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setSelectedPipelineOpp(null)}
        >
          <div
            className="w-full max-w-2xl max-h-[min(92vh,880px)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold">{selectedPipelineOpp.nomMarque}</h3>
                <p className="text-sm text-gray-500">{selectedPipelineOpp.secteur || "Secteur n/a"}</p>
                {selectedPipelineOpp.marqueId ? (
                  <a
                    href={`/marques/${selectedPipelineOpp.marqueId}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-1 inline-flex items-center gap-1 text-xs font-medium text-[#B06F70] hover:underline"
                  >
                    <ExternalLink className="h-3 w-3" />
                    Voir la fiche marque
                  </a>
                ) : null}
              </div>
              <span className="rounded-full bg-gray-100 px-2.5 py-1 text-xs font-medium text-gray-700">
                {selectedPipelineOpp.statut}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-500 mb-1">Budget estimé</p>
                <p className="text-sm font-medium">{formatMoney(selectedPipelineOpp.budgetEstime)}</p>
              </div>
              <div className="rounded-lg border border-gray-200 p-3">
                <p className="text-xs text-gray-500 mb-1">Type d'activation</p>
                <p className="text-sm font-medium">{selectedPipelineOpp.typeActivation || "-"}</p>
              </div>
            </div>
            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-xs text-gray-500 mb-1">Langue du client</p>
              <select
                value={decodeClientLanguageFromAngleNote(selectedPipelineOpp.angleNote).language || "FR"}
                onChange={async (e) => {
                  const language = e.target.value as ClientLanguage;
                  const parsed = decodeClientLanguageFromAngleNote(selectedPipelineOpp.angleNote);
                  const nextAngle = encodeClientLanguageIntoAngleNote(parsed.cleanNote, language);
                  await patchOpportunite(selectedPipelineOpp.id, { angleNote: nextAngle });
                  setSelectedPipelineOpp((prev) => (prev ? { ...prev, angleNote: nextAngle } : prev));
                }}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
              >
                <option value="FR">Client français</option>
                <option value="EN">Client anglais</option>
              </select>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <p className="text-sm font-medium mb-2">Talents matchés</p>
              <div className="flex flex-wrap gap-2">
                {asArrayIds(selectedPipelineOpp.talents).map((id) => (
                  <TalentChip
                    key={id}
                    name={talentNameById.get(id) || id}
                    photo={talentPhotoById.get(id)}
                  />
                ))}
                {asArrayIds(selectedPipelineOpp.talents).length === 0 ? (
                  <span className="text-xs text-gray-400">Aucun talent matché</span>
                ) : null}
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-3 pr-1">
                <p className="text-sm font-medium text-[#220101]">Modifier les talents</p>
                <button
                  type="button"
                  className="shrink-0 text-xs font-medium text-[#B06F70] hover:underline"
                  onClick={savePipelineTalents}
                >
                  Enregistrer
                </button>
              </div>
              <div
                className="max-h-[min(50vh,28rem)] overflow-y-auto overscroll-y-contain rounded-lg border border-[#F5EDE0] bg-[#F5EDE0]/40 p-2 pr-3 pb-3 [scrollbar-gutter:stable]"
                role="list"
              >
                <div className="grid grid-cols-1 gap-2 md:grid-cols-2 md:gap-2">
                {talentOptions.map((t) => {
                  const checked = selectedPipelineTalentIds.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex min-h-[2.5rem] items-center gap-2 rounded-lg border border-gray-100 bg-white px-2 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setSelectedPipelineTalentIds((curr) =>
                            e.target.checked
                              ? [...curr, t.id]
                              : curr.filter((id) => id !== t.id)
                          )
                        }
                      />
                      <TalentAvatar
                        name={`${t.prenom} ${t.nom}`}
                        photo={t.photo}
                        className="h-6 w-6"
                      />
                      <span className="text-sm">
                        {t.prenom} {t.nom}
                      </span>
                    </label>
                  );
                })}
                </div>
              </div>
            </div>

            <div className="rounded-lg border border-gray-200 p-3">
              <div className="mb-2 flex items-center justify-between gap-3">
                <p className="text-sm font-medium">Contacts client</p>
                {canSendProspection && asContacts(selectedPipelineOpp.contacts).some((c) => c.email) ? (
                  <button
                    type="button"
                    onClick={() => openEmailModal(selectedPipelineOpp)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-glowup-rose px-3 py-1.5 text-xs font-medium text-white hover:opacity-95"
                  >
                    <Mail className="h-3.5 w-3.5" />
                    Envoyer le mail de prospection
                  </button>
                ) : null}
              </div>
              {selectedPipelineOpp.lastEmailSentAt ? (
                <div className="mb-2 space-y-1.5 rounded-lg bg-gray-50 p-2.5">
                  <p className="text-[11px] text-gray-500">
                    Dernier mail envoyé le{" "}
                    {new Date(selectedPipelineOpp.lastEmailSentAt).toLocaleString("fr-FR")}
                    {selectedPipelineOpp.lastEmailFrom
                      ? ` depuis ${selectedPipelineOpp.lastEmailFrom}`
                      : ""}
                    {selectedPipelineOpp.emailSubject
                      ? ` — « ${selectedPipelineOpp.emailSubject} »`
                      : ""}
                  </p>
                  <EmailTrackingBadges opportunite={selectedPipelineOpp} detailed />
                </div>
              ) : null}
              <div className="space-y-2">
                {asContacts(selectedPipelineOpp.contacts).map((c, idx) => (
                  <div key={`${c.email || "contact"}-${idx}`} className="rounded-md border border-gray-100 px-2.5 py-2">
                    <p className="text-sm font-medium">
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || "Contact"}
                    </p>
                    <p className="text-xs text-gray-500">{c.email || "Email non renseigné"}</p>
                    {c.role ? <p className="text-xs text-gray-500">{c.role}</p> : null}
                  </div>
                ))}
                {asContacts(selectedPipelineOpp.contacts).length === 0 ? (
                  <p className="text-xs text-gray-400">Aucun contact enregistré pour cette marque.</p>
                ) : null}
              </div>
            </div>

            <div className="flex justify-end">
              <div className="flex items-center gap-2">
                <button
                  className="px-3 py-2 rounded border border-red-200 text-red-600"
                  onClick={() => deleteOpportunite(selectedPipelineOpp.id)}
                >
                  Supprimer
                </button>
                <button className="px-3 py-2 rounded border" onClick={() => setSelectedPipelineOpp(null)}>
                  Fermer
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {dealModalOpp && (
        <div
          className="fixed inset-0 z-50 bg-black/30 flex items-center justify-center p-4"
          onClick={() => setDealModalOpp(null)}
        >
          <div
            className="w-full max-w-2xl rounded-xl border border-gray-200 bg-white p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-semibold">
              Finaliser le deal signé · {dealModalOpp.nomMarque}
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div>
                <label className="text-xs text-gray-500">Prix signé (EUR) *</label>
                <input
                  type="number"
                  value={dealForm.montantFinal}
                  onChange={(e) => setDealForm((s) => ({ ...s, montantFinal: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
              <div>
                <label className="text-xs text-gray-500">Date d'activation</label>
                <input
                  type="date"
                  value={dealForm.dateActivation}
                  onChange={(e) => setDealForm((s) => ({ ...s, dateActivation: e.target.value }))}
                  className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-gray-500">Type d'activation</label>
              <input
                type="text"
                value={dealForm.typeActivation}
                onChange={(e) => setDealForm((s) => ({ ...s, typeActivation: e.target.value }))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: Reel + Stories"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Détails du deal *</label>
              <textarea
                value={dealForm.details}
                onChange={(e) => setDealForm((s) => ({ ...s, details: e.target.value }))}
                className="mt-1 w-full rounded border border-gray-300 px-3 py-2 text-sm min-h-[90px]"
                placeholder="Contexte, livrables, points clés..."
              />
            </div>
            <div>
              <p className="text-xs text-gray-500 mb-2">Talents sélectionnés *</p>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2 max-h-44 overflow-auto">
                {talentOptions.map((t) => {
                  const checked = dealForm.talents.includes(t.id);
                  return (
                    <label
                      key={t.id}
                      className="flex items-center gap-2 rounded-lg border border-gray-100 px-2 py-1.5 hover:bg-gray-50"
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) =>
                          setDealForm((s) => ({
                            ...s,
                            talents: e.target.checked
                              ? [...s.talents, t.id]
                              : s.talents.filter((id) => id !== t.id),
                          }))
                        }
                      />
                      <TalentAvatar
                        name={`${t.prenom} ${t.nom}`}
                        photo={t.photo}
                        className="h-6 w-6"
                      />
                      <span className="text-sm">
                        {t.prenom} {t.nom}
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button className="px-3 py-2 rounded border" onClick={() => setDealModalOpp(null)}>
                Annuler
              </button>
              <button
                className="px-3 py-2 rounded bg-glowup-rose text-white"
                onClick={confirmSignedDeal}
              >
                Confirmer en signé
              </button>
            </div>
          </div>
        </div>
      )}

      {emailModalOpp && (
        <div className="fixed inset-0 z-[60] bg-black/30 flex items-center justify-center p-4">
          <div className="w-full max-w-2xl max-h-[min(92vh,820px)] overflow-y-auto overscroll-contain rounded-xl border border-gray-200 bg-white p-5 space-y-4">
            <div>
              <h3 className="text-lg font-semibold">
                Mail de prospection · {emailModalOpp.nomMarque}
              </h3>
              <p className="mt-1 text-sm text-gray-500">
                Envoyé depuis{" "}
                <span className="font-medium text-gray-700">
                  {senderLabelFor(senderAccounts, projetSenderEmail)}
                </span>{" "}
                — la signature Gmail de la boîte est ajoutée automatiquement.
              </p>
            </div>

            <div className="rounded-lg border border-gray-200 bg-gray-50 p-3">
              <p className="text-xs font-semibold text-gray-500 mb-1">Destinataires</p>
              <div className="flex flex-wrap gap-1.5">
                {asContacts(emailModalOpp.contacts)
                  .filter((c) => c.email)
                  .map((c, idx) => (
                    <span
                      key={`${c.email}-${idx}`}
                      className="rounded-full bg-white border border-gray-200 px-2.5 py-1 text-xs text-gray-700"
                    >
                      {[c.firstName, c.lastName].filter(Boolean).join(" ") || c.email}
                      <span className="text-gray-400"> · {c.email}</span>
                    </span>
                  ))}
              </div>
              {asContacts(emailModalOpp.contacts).filter((c) => c.email).length > 1 ? (
                <p className="mt-1.5 text-[11px] text-gray-500">
                  Chaque contact reçoit <strong>son propre mail</strong> :{" "}
                  <code className="rounded bg-white px-1">{"{{prenom}}"}</code> est remplacé par
                  le prénom de chacun.
                </p>
              ) : null}
            </div>

            <div>
              <label className="text-xs text-gray-500">Sujet *</label>
              <input
                value={emailForm.subject}
                onChange={(e) => setEmailForm((s) => ({ ...s, subject: e.target.value }))}
                className="mt-1 w-full rounded-lg border border-gray-300 px-3 py-2 text-sm"
                placeholder="Ex: Glow Up x Ski Trip 2027 — collaboration influence"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500">Corps du mail *</label>
              <div className="mt-1">
                <RichEmailEditor
                  onChangeHtml={(html) => setEmailForm((s) => ({ ...s, bodyHtml: html }))}
                  placeholder="Bonjour {{prenom}}, rédige ton mail de prospection ici..."
                  minHeight={260}
                  variables={[
                    {
                      token: "{{prenom}}",
                      label: "PRÉNOM",
                      hint: "Prénom du contact (remplacé pour chaque destinataire)",
                    },
                    {
                      token: "{{nom}}",
                      label: "NOM",
                      hint: "Nom du contact (remplacé pour chaque destinataire)",
                    },
                    {
                      token: "{{marque}}",
                      label: "MARQUE",
                      hint: "Nom de la marque ciblée",
                    },
                  ]}
                />
              </div>
            </div>

            {emailError && <p className="text-sm text-red-600">{emailError}</p>}

            <div className="flex justify-end gap-2">
              <button
                className="px-3 py-2 rounded border"
                onClick={() => setEmailModalOpp(null)}
                disabled={emailSending}
              >
                Annuler
              </button>
              <button
                className="inline-flex items-center gap-2 px-3 py-2 rounded bg-glowup-rose text-white disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={sendProspectionEmail}
                disabled={emailSending}
              >
                {emailSending ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                {emailSending ? "Envoi..." : "Envoyer"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
