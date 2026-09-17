"use client";

/**
 * Fiche CRM unifiée FR / BENELUX — même layout « record page » :
 * topbar, identité, stats, panneau latéral, onglets (Activité, Contacts,
 * Carto, AO, Collabs). Le marché ne change que les endpoints et les
 * sections absentes côté BENELUX (groupe, AO, collabs créées…).
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { useParams, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import Link from "next/link";
import {
  ArrowLeft,
  Pencil,
  Trash2,
  Globe,
  MapPin,
  Mail,
  Phone,
  Calendar,
  Euro,
  Loader2,
  Handshake,
  Users,
  Copy,
  Check,
  Clock,
  Banknote,
  Activity,
  Linkedin,
  Plus,
  Repeat,
  Send,
  X,
  StickyNote,
  FileSpreadsheet,
  MessageSquareReply,
  Building2,
  ReceiptText,
  Star,
  Download,
  Briefcase,
  Ban,
  GitMerge,
  ArrowLeftRight,
  Search,
} from "lucide-react";
import { MarqueCrmTab } from "@/app/(dashboard)/marques/[id]/MarqueCrmTab";
import { ImportCartoModal } from "@/components/outreach/ImportCartoModal";
import { canAccessFullMarqueCrm, canWriteMarqueCrm } from "@/lib/marque-crm-access";

/* ------------------------------------------------------------------ */
/* Types                                                               */
/* ------------------------------------------------------------------ */

type OutreachInfo = {
  id: string;
  status: "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED";
  cycleCount: number;
  lastSentAt: string | null;
  nextRecontactAt: string | null;
  lastRepliedAt: string | null;
};

type Contact = {
  id: string;
  prenom?: string | null;
  nom: string;
  email: string | null;
  telephone: string | null;
  poste: string | null;
  principal: boolean;
  language?: string | null;
  priorite?: string | null;
  perimetre?: string | null;
  localisation?: string | null;
  linkedinUrl?: string | null;
  source?: string | null;
  outreachExcluded?: boolean;
  diffusionOptOut?: boolean;
  diffusionOptOutAt?: string | null;
  outreachTargets?: OutreachInfo[];
  sousMarques?: { marque: { id: string; nom: string } }[];
};

interface MarqueDetail {
  id: string;
  nom: string;
  secteur: string | null;
  siteWeb: string | null;
  notes: string | null;
  raisonSociale: string | null;
  formeJuridique: string | null;
  siret: string | null;
  numeroTVA: string | null;
  adresseRue: string | null;
  adresseComplement: string | null;
  codePostal: string | null;
  ville: string | null;
  pays: string | null;
  delaiPaiement: number | null;
  modePaiement: string | null;
  devise: string | null;
  createdAt: string;
  contacts: Contact[];
  cartoFiles?: {
    id: string;
    fileName: string;
    size: number;
    createdAt: string;
    kind?: string;
  }[];
  collaborations: {
    id: string;
    reference: string;
    typeContenu: string;
    montantBrut: number;
    statut: string;
    talent: { prenom: string; nom: string };
  }[];
  parent?: { id: string; nom: string } | null;
  children?: {
    id: string;
    nom: string;
    secteur: string | null;
    ville: string | null;
    _count: { contacts: number; collaborations: number; sousMarqueContacts: number };
  }[];
  sousMarqueContacts?: {
    id: string;
    contact: {
      id: string;
      prenom: string | null;
      nom: string;
      email: string | null;
      poste: string | null;
      principal: boolean;
      marque: { id: string; nom: string };
    };
  }[];
  _count: { collaborations: number };
  /** Marque FR liée (fiche BENELUX) — collabs / activité 360°. */
  linkedMarqueId?: string | null;
  linkedMarque?: { id: string; nom: string } | null;
  /** Fiches BENELUX pointant vers cette marque FR (après bascule). */
  beneluxLinks?: { id: string; nom: string }[];
}

/** Résultat léger pour le sélecteur de rattachement mère/fille. */
type MarqueLite = { id: string; nom: string; secteur?: string | null; ville?: string | null };

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

const INK = "#16110F";
const ROSE = "#C08B8B";

/** Projets strategy vers lesquels on peut envoyer la marque (mêmes slugs que la sidebar). */
const STRATEGY_PROJECTS = [
  { slug: "villa-cannes", nom: "Villa Cannes 2026" },
  { slug: "ski-trip", nom: "Ski Trip 2027" },
  { slug: "coachella-2026", nom: "Coachella 2026" },
  { slug: "ynov-campus", nom: "Ynov Campus" },
] as const;

const COLLAB_STATUS_STYLE: Record<string, string> = {
  PAYE: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  NEGO: "bg-amber-50 text-amber-700 ring-amber-600/20",
  PERDU: "bg-red-50 text-red-600 ring-red-600/20",
};

function collabStatusClass(statut: string): string {
  return `${COLLAB_STATUS_STYLE[statut] || "bg-blue-50 text-blue-700 ring-blue-600/20"} ring-1 ring-inset`;
}

function prioriteStyle(priorite: string): string {
  const p = priorite.toUpperCase();
  if (p === "P1") return "bg-red-50 text-red-600 ring-red-600/20";
  if (p === "P2") return "bg-amber-50 text-amber-700 ring-amber-600/20";
  return "bg-gray-100 text-gray-500 ring-gray-500/10";
}

function initials(prenom: string | null | undefined, nom: string): string {
  return (((prenom || "").charAt(0) + (nom || "").charAt(0)) || nom.slice(0, 2)).toUpperCase();
}

function daysUntil(dateStr: string | null): number | null {
  if (!dateStr) return null;
  return Math.ceil((new Date(dateStr).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function formatMoney(amount: number): string {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }).format(amount);
}

/* ------------------------------------------------------------------ */
/* Petits composants                                                   */
/* ------------------------------------------------------------------ */

function OutreachBadge({ info }: { info: OutreachInfo }) {
  const base = "inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-md ring-1 ring-inset";
  if (info.status === "WAITING") {
    const days = daysUntil(info.nextRecontactAt);
    return (
      <span className={`${base} bg-emerald-50 text-emerald-700 ring-emerald-600/20`}>
        <Repeat className="w-3 h-3" />
        En cycle{days !== null && days > 0 ? ` · J-${days}` : " · imminent"}
      </span>
    );
  }
  if (info.status === "TO_CONTACT") {
    return (
      <span className={`${base} bg-amber-50 text-amber-700 ring-amber-600/20`}>
        <Send className="w-3 h-3" />À contacter
      </span>
    );
  }
  if (info.status === "TO_RECONTACT") {
    return (
      <span className={`${base} bg-orange-50 text-orange-700 ring-orange-600/20`}>
        <Repeat className="w-3 h-3" />À recontacter
      </span>
    );
  }
  return <span className={`${base} bg-gray-100 text-gray-500 ring-gray-500/10`}>Stoppé</span>;
}

function SectionCard({
  title,
  icon: Icon,
  children,
  action,
}: {
  title: string;
  icon: typeof Globe;
  children: React.ReactNode;
  action?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)]">
      <div className="flex items-center justify-between px-4 pt-3.5 pb-2">
        <h3 className="flex items-center gap-2 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
          <Icon className="w-3.5 h-3.5" />
          {title}
        </h3>
        {action}
      </div>
      <div className="px-4 pb-4">{children}</div>
    </div>
  );
}

function DetailRow({ label, value, mono }: { label: string; value: React.ReactNode; mono?: boolean }) {
  return (
    <div className="flex items-start justify-between gap-3 py-[7px] border-b border-gray-50 last:border-0">
      <span className="text-xs text-gray-400 shrink-0 pt-0.5">{label}</span>
      <span className={`text-[13px] text-right ${mono ? "font-mono" : ""}`} style={{ color: INK }}>
        {value}
      </span>
    </div>
  );
}

/** Sélecteur simple de marque (recherche locale) pour rattacher mère/fille. */
function HierarchyPicker({
  items,
  busy,
  placeholder,
  query,
  onQuery,
  onPick,
  onCreate,
  createLabel,
  onCancel,
}: {
  items: MarqueLite[];
  busy: boolean;
  placeholder: string;
  query: string;
  onQuery: (v: string) => void;
  onPick: (id: string) => void;
  onCreate?: (name: string) => void;
  createLabel?: string;
  onCancel: () => void;
}) {
  const q = query.trim().toLowerCase();
  const filtered = (q ? items.filter((m) => m.nom.toLowerCase().includes(q)) : items).slice(0, 8);
  const exactExists = q.length > 0 && items.some((m) => m.nom.toLowerCase() === q);
  return (
    <div className="mt-1">
      <input
        autoFocus
        value={query}
        onChange={(e) => onQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q && !busy) {
            if (filtered.length > 0) onPick(filtered[0].id);
            else if (onCreate && !exactExists) onCreate(query.trim());
          }
        }}
        placeholder={placeholder}
        className="w-full px-2.5 py-1.5 rounded-lg border text-[13px] focus:outline-none focus:ring-2 focus:ring-gray-200"
        style={{ borderColor: "#E5E0DA" }}
      />
      <div className="mt-1 rounded-lg border divide-y overflow-hidden max-h-40 overflow-y-auto" style={{ borderColor: "#EDE7DF" }}>
        {filtered.map((m) => (
          <button
            key={m.id}
            type="button"
            disabled={busy}
            onClick={() => onPick(m.id)}
            className="w-full text-left px-2.5 py-1.5 text-[13px] hover:bg-gray-50 disabled:opacity-50 flex items-center justify-between gap-2"
          >
            <span className="truncate" style={{ color: INK }}>
              {m.nom}
            </span>
            <span className="text-xs text-gray-400 truncate shrink-0">
              {[m.secteur, m.ville].filter(Boolean).join(" · ")}
            </span>
          </button>
        ))}
        {filtered.length === 0 && (
          <div className="px-2.5 py-1.5 text-xs text-gray-400">Aucune marque existante</div>
        )}
      </div>
      {onCreate && q && !exactExists && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreate(query.trim())}
          className="mt-1 w-full text-left px-2.5 py-1.5 text-[13px] font-semibold rounded-lg text-white disabled:opacity-50"
          style={{ backgroundColor: INK }}
        >
          {createLabel || "Créer"} « {query.trim()} »
        </button>
      )}
      <button
        type="button"
        onClick={onCancel}
        className="mt-1 text-xs text-gray-400 hover:text-gray-700"
      >
        Annuler
      </button>
    </div>
  );
}

/** Panneau compact pour attribuer un contact à une sous-marque (fille). */
function AssignSubMarqueControl({
  subMarques,
  allMarques,
  excludeIds,
  busy,
  error,
  onAssign,
  onCreate,
}: {
  subMarques: { id: string; nom: string }[];
  allMarques: MarqueLite[];
  excludeIds: Set<string>;
  busy: boolean;
  error: string | null;
  onAssign: (marqueId: string) => void;
  onCreate: (name: string) => void;
}) {
  const [name, setName] = useState("");
  const q = name.trim().toLowerCase();
  const matches = q
    ? allMarques
        .filter((m) => !excludeIds.has(m.id) && m.nom.toLowerCase().includes(q))
        .slice(0, 6)
    : [];
  const exactExists = q.length > 0 && allMarques.some((m) => m.nom.toLowerCase() === q);

  return (
    <div
      className="mt-2 rounded-lg border p-2 space-y-1.5"
      style={{ borderColor: "#EDE7DF", background: "#FCFAF7" }}
    >
      {/* Sous-marques déjà connues de cette marque mère : rattachement 1 clic */}
      {subMarques.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {subMarques.map((c) => (
            <button
              key={c.id}
              type="button"
              disabled={busy}
              onClick={() => onAssign(c.id)}
              className="text-[11px] px-2 py-[3px] rounded-md ring-1 ring-inset ring-black/[0.08] bg-white hover:bg-gray-50 disabled:opacity-50"
              style={{ color: INK }}
            >
              {c.nom}
            </button>
          ))}
        </div>
      )}

      <input
        value={name}
        onChange={(e) => setName(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && q && !busy) {
            if (matches.length > 0) onAssign(matches[0].id);
            else if (!exactExists) onCreate(name.trim());
          }
        }}
        placeholder="Chercher une marque existante ou en créer une…"
        className="w-full px-2 py-1 rounded-md border text-[12px] focus:outline-none focus:ring-2 focus:ring-gray-200"
        style={{ borderColor: "#E5E0DA" }}
      />

      {/* Résultats : marques existantes à rattacher comme sous-marque */}
      {q && matches.length > 0 && (
        <div className="rounded-md border divide-y overflow-hidden" style={{ borderColor: "#EDE7DF" }}>
          {matches.map((m) => (
            <button
              key={m.id}
              type="button"
              disabled={busy}
              onClick={() => onAssign(m.id)}
              className="w-full text-left px-2 py-1.5 text-[12px] hover:bg-white disabled:opacity-50 flex items-center justify-between gap-2"
            >
              <span className="truncate" style={{ color: INK }}>
                {m.nom}
              </span>
              <span className="text-[10px] shrink-0" style={{ color: ROSE }}>
                rattacher
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Créer si aucune marque existante ne correspond exactement */}
      {q && !exactExists && (
        <button
          type="button"
          disabled={busy}
          onClick={() => onCreate(name.trim())}
          className="text-[11px] font-semibold px-2 py-1 rounded-md text-white disabled:opacity-50"
          style={{ backgroundColor: INK }}
        >
          Créer « {name.trim()} »
        </button>
      )}

      {error && <p className="text-[11px] text-red-600">{error}</p>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Page                                                                */
/* ------------------------------------------------------------------ */

export type CrmMarket = "FR" | "BENELUX";

export default function MarqueRecordPage({
  market = "FR",
}: {
  market?: CrmMarket;
}) {
  const params = useParams();
  const router = useRouter();
  const { data: session } = useSession();
  const isBenelux = market === "BENELUX";
  const recordApi = isBenelux
    ? `/api/benelux-outreach/companies/${params.id}`
    : `/api/marques/${params.id}`;
  const contactsApi = `${recordApi}/contacts`;
  const outreachTargetsApi = isBenelux
    ? "/api/benelux-outreach/targets"
    : "/api/outreach/targets";
  const outreachHref = isBenelux
    ? "/outreach?market=BENELUX"
    : "/outreach";
  // STRATEGY_PLANNER : fiche en lecture seule (accès depuis les projets
  // strategy type Ski Trip) — pas de modification/suppression ni de liens
  // vers des espaces auxquels le rôle n'a pas accès.
  const readOnly =
    !isBenelux && (session?.user?.role || "") === "STRATEGY_PLANNER";
  // Lancer un contact dans le cycle Outreach est réservé aux rôles qui y ont
  // accès côté API (ADMIN / CASTING_MANAGER).
  const canOutreach = ["ADMIN", "CASTING_MANAGER"].includes(session?.user?.role || "");
  // CRM complet (onglet Achats-AO, fichiers AO, sync) : ADMIN + HEAD_OF_SALES (Leyna)
  // Masqué côté BENELUX (pas de feuille AO).
  const canFullCrm = !isBenelux && canAccessFullMarqueCrm(session?.user?.role);
  const canMerge = !isBenelux && canWriteMarqueCrm(session?.user?.role);
  const canStrategy = !isBenelux && ["ADMIN", "STRATEGY_PLANNER"].includes(session?.user?.role || "");
  const [marque, setMarque] = useState<MarqueDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"activite" | "contacts" | "carto" | "ao" | "collabs">("activite");
  const [copiedEmail, setCopiedEmail] = useState<string | null>(null);
  const [logoError, setLogoError] = useState(false);

  // Édition inline de l'email d'un contact depuis la fiche marque
  const [editEmailId, setEditEmailId] = useState<string | null>(null);
  const [editEmailValue, setEditEmailValue] = useState("");
  const [savingEmailId, setSavingEmailId] = useState<string | null>(null);
  const [editEmailError, setEditEmailError] = useState<string | null>(null);

  const [exporting, setExporting] = useState(false);
  const [transferringMarket, setTransferringMarket] = useState(false);
  const [transferringContactId, setTransferringContactId] = useState<string | null>(null);

  // Import d'une cartographie directement depuis la fiche marque
  const [showImportCarto, setShowImportCarto] = useState(false);
  const [cartoFlash, setCartoFlash] = useState<string | null>(null);

  // Ajout rapide d'un contact
  const [showAddContact, setShowAddContact] = useState(false);
  const [newContact, setNewContact] = useState({
    prenom: "",
    nom: "",
    poste: "",
    email: "",
    telephone: "",
    linkedinUrl: "",
  });
  const [newContactLang, setNewContactLang] = useState<"fr" | "en" | null>(null);
  const [savingContact, setSavingContact] = useState(false);
  const [contactError, setContactError] = useState<string | null>(null);

  // Lancement d'un contact dans le cycle Outreach depuis la fiche marque
  const [launchingId, setLaunchingId] = useState<string | null>(null);
  const [launchError, setLaunchError] = useState<{ id: string; message: string } | null>(null);
  const [envoyerBusy, setEnvoyerBusy] = useState(false);
  const [toggleOutreachBusy, setToggleOutreachBusy] = useState(false);

  // Suppression d'un contact depuis la fiche marque
  const [deletingContactId, setDeletingContactId] = useState<string | null>(null);
  // Opt-out liste de diffusion (par contact)
  const [togglingOptOutId, setTogglingOptOutId] = useState<string | null>(null);

  // Modification de la langue d'un contact directement depuis la fiche marque
  const [updatingLangId, setUpdatingLangId] = useState<string | null>(null);

  // Hiérarchie mère / marques filles
  const [allMarques, setAllMarques] = useState<MarqueLite[]>([]);
  const [marquesLoaded, setMarquesLoaded] = useState(false);
  const [childPickerOpen, setChildPickerOpen] = useState(false);
  const [parentPickerOpen, setParentPickerOpen] = useState(false);
  const [hierarchyQuery, setHierarchyQuery] = useState("");
  const [hierarchyBusy, setHierarchyBusy] = useState(false);
  const [hierarchyError, setHierarchyError] = useState<string | null>(null);

  // Attribution d'un contact à une sous-marque
  const [assignOpenId, setAssignOpenId] = useState<string | null>(null);
  const [assignBusy, setAssignBusy] = useState(false);
  const [assignError, setAssignError] = useState<string | null>(null);

  // Envoi de la marque vers un projet strategy (Ski Trip, Villa Cannes, ...)
  const [strategyPickerOpen, setStrategyPickerOpen] = useState(false);
  const [sendingToProject, setSendingToProject] = useState<string | null>(null);
  const [strategyFlash, setStrategyFlash] = useState<
    { type: "success" | "error"; message: string; projetSlug?: string; projetNom?: string } | null
  >(null);

  // Doublons potentiels de cette fiche (fusion possible en 1 marque).
  type SimilarMatch = {
    id: string;
    nom: string;
    slug: string;
    secteur: string | null;
    reason: "EXACT" | "TYPO" | "PREFIX" | "TRIGRAM";
    similarity: number;
    counts: {
      collaborations: number;
      negociations: number;
      contacts: number;
      inboundOpportunities: number;
    };
  };
  const [similarMatches, setSimilarMatches] = useState<SimilarMatch[]>([]);
  const [similarLoading, setSimilarLoading] = useState(false);
  const [similarChecked, setSimilarChecked] = useState(false);
  const [mergingSimilarId, setMergingSimilarId] = useState<string | null>(null);
  const [similarPanelOpen, setSimilarPanelOpen] = useState(false);
  /** Recherche manuelle dans le panneau Doublons (quand l’auto ne trouve rien, ou pour forcer). */
  const [manualMergeQuery, setManualMergeQuery] = useState("");
  const [manualMergeResults, setManualMergeResults] = useState<
    { id: string; nom: string; ville: string; contactCount: number }[]
  >([]);
  const [manualMergeSearching, setManualMergeSearching] = useState(false);

  const [aoSyncing, setAoSyncing] = useState(false);
  const aoSyncTriedRef = useRef(false);

  const fetchMarque = useCallback(async () => {
    try {
      const res = await fetch(recordApi);
      if (res.ok) {
        const data = await res.json();
        // BENELUX GET renvoie parfois { company } en plus — on prend la forme MarqueDetail.
        setMarque(data.id ? data : data.company);
      }
    } catch (error) {
      console.error("Erreur:", error);
    } finally {
      setLoading(false);
    }
  }, [recordApi]);

  useEffect(() => {
    aoSyncTriedRef.current = false;
    if (params.id) fetchMarque();
  }, [params.id, fetchMarque]);

  // Imports AO antérieurs : fichier stocké sans contacts → sync à l'ouverture de l'onglet
  useEffect(() => {
    if (!canFullCrm || activeTab !== "ao" || !marque || aoSyncing || aoSyncTriedRef.current) return;
    const files = (marque.cartoFiles || []).filter((f) => f.kind === "AO");
    const contactsAo = marque.contacts.filter((c) => c.source === "AO");
    if (files.length === 0 || contactsAo.length > 0) return;

    aoSyncTriedRef.current = true;
    let cancelled = false;
    (async () => {
      setAoSyncing(true);
      try {
        const res = await fetch(`${recordApi}/sync-ao`, { method: "POST" });
        if (!cancelled && res.ok) {
          const data = await res.json();
          if (data.created > 0) await fetchMarque();
        }
      } catch (e) {
        console.error(e);
      } finally {
        if (!cancelled) setAoSyncing(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canFullCrm, activeTab, marque, aoSyncing, fetchMarque]);

  // Détecte les fiches doublons / proches pour proposer une fusion sur place.
  useEffect(() => {
    if (!canMerge || !params.id) {
      setSimilarMatches([]);
      setSimilarChecked(false);
      setSimilarPanelOpen(false);
      return;
    }
    let cancelled = false;
    setSimilarLoading(true);
    setSimilarChecked(false);
    (async () => {
      try {
        const res = await fetch(`${recordApi}/similar`);
        const data = await res.json().catch(() => ({}));
        if (cancelled) return;
        if (res.ok) {
          const matches = Array.isArray(data.matches) ? data.matches : [];
          setSimilarMatches(matches);
          // Ouvre le panneau automatiquement s'il y a des doublons détectés.
          if (matches.length > 0) setSimilarPanelOpen(true);
        } else {
          setSimilarMatches([]);
        }
      } catch {
        if (!cancelled) setSimilarMatches([]);
      } finally {
        if (!cancelled) {
          setSimilarLoading(false);
          setSimilarChecked(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [canMerge, params.id]);

  // Charge la liste des marques (pour le sélecteur de rattachement) à la demande.
  const loadAllMarques = useCallback(async () => {
    if (marquesLoaded) return;
    try {
      const res = await fetch("/api/marques");
      if (res.ok) {
        const data = await res.json();
        setAllMarques(
          Array.isArray(data)
            ? data.map((m: { id: string; nom: string; secteur?: string | null; ville?: string | null }) => ({
                id: m.id,
                nom: m.nom,
                secteur: m.secteur ?? null,
                ville: m.ville ?? null,
              }))
            : []
        );
        setMarquesLoaded(true);
      }
    } catch (error) {
      console.error("Erreur chargement marques:", error);
    }
  }, [marquesLoaded]);

  const attachChild = async (childId: string) => {
    setHierarchyBusy(true);
    setHierarchyError(null);
    try {
      const res = await fetch(`${recordApi}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setHierarchyError(d.message || "Erreur lors du rattachement.");
      } else {
        setChildPickerOpen(false);
        setHierarchyQuery("");
        await fetchMarque();
      }
    } finally {
      setHierarchyBusy(false);
    }
  };

  const detachChild = async (childId: string) => {
    setHierarchyBusy(true);
    setHierarchyError(null);
    try {
      const res = await fetch(
        `/api/marques/${params.id}/children?childId=${encodeURIComponent(childId)}`,
        { method: "DELETE" }
      );
      if (res.ok) await fetchMarque();
    } finally {
      setHierarchyBusy(false);
    }
  };

  /** Rattache la marque courante comme fille de `parentId`. */
  const attachParent = async (parentId: string) => {
    setHierarchyBusy(true);
    setHierarchyError(null);
    try {
      const res = await fetch(`/api/marques/${parentId}/children`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ childId: String(params.id) }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setHierarchyError(d.message || "Erreur lors du rattachement.");
      } else {
        setParentPickerOpen(false);
        setHierarchyQuery("");
        await fetchMarque();
      }
    } finally {
      setHierarchyBusy(false);
    }
  };

  const detachParent = async () => {
    if (!marque?.parent) return;
    setHierarchyBusy(true);
    setHierarchyError(null);
    try {
      const res = await fetch(
        `/api/marques/${marque.parent.id}/children?childId=${encodeURIComponent(String(params.id))}`,
        { method: "DELETE" }
      );
      if (res.ok) await fetchMarque();
    } finally {
      setHierarchyBusy(false);
    }
  };

  /** Crée une nouvelle marque (résolue/dédoublonnée par le serveur) puis renvoie son id. */
  const createMarque = async (nom: string): Promise<string | null> => {
    const res = await fetch("/api/marques", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nom }),
    });
    if (!res.ok) {
      const d = await res.json().catch(() => ({}));
      setHierarchyError(d.message || "Erreur lors de la création de la marque.");
      return null;
    }
    const m = await res.json();
    return m?.id || null;
  };

  /** Crée une sous-marque et la rattache à la marque courante. */
  const createAndAttachChild = async (nom: string) => {
    setHierarchyBusy(true);
    setHierarchyError(null);
    try {
      const newId = await createMarque(nom);
      if (newId) await attachChild(newId);
    } finally {
      setHierarchyBusy(false);
    }
  };

  /** Crée une marque mère et y rattache la marque courante. */
  const createAndAttachParent = async (nom: string) => {
    setHierarchyBusy(true);
    setHierarchyError(null);
    try {
      const newId = await createMarque(nom);
      if (newId) await attachParent(newId);
    } finally {
      setHierarchyBusy(false);
    }
  };

  /** Rattache un contact à une sous-marque (fille existante ou nouvelle). Ne le déplace pas. */
  const assignContact = async (
    contact: Contact,
    opts: { childId?: string; newName?: string }
  ) => {
    setAssignBusy(true);
    setAssignError(null);
    try {
      const res = await fetch(contactsApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          addSousMarqueId: opts.childId,
          newSousMarqueName: opts.newName,
        }),
      });
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        setAssignError(d.error || d.message || "Erreur lors du rattachement.");
      } else {
        // On garde le panneau ouvert : un contact peut couvrir plusieurs sous-marques.
        await fetchMarque();
      }
    } finally {
      setAssignBusy(false);
    }
  };

  /** Détache une sous-marque d'un contact. */
  const removeSousMarque = async (contact: Contact, sousMarqueId: string) => {
    setAssignBusy(true);
    setAssignError(null);
    try {
      const res = await fetch(contactsApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactId: contact.id,
          removeSousMarqueId: sousMarqueId,
        }),
      });
      if (res.ok) await fetchMarque();
    } finally {
      setAssignBusy(false);
    }
  };

  /** Envoie la marque vers un projet strategy : opportunité directement dans le
   *  pipeline actif (colonne « Identifiée »), avec la langue du client déduite
   *  des contacts de la marque (FR par défaut). */
  const sendToStrategyProject = async (projet: { slug: string; nom: string }) => {
    if (!marque || sendingToProject) return;
    setSendingToProject(projet.slug);
    setStrategyFlash(null);
    const langs = marque.contacts.map((c) => (c.language || "").toLowerCase());
    const clientLang = langs.filter((l) => l === "en").length > langs.filter((l) => l === "fr").length ? "EN" : "FR";
    try {
      const res = await fetch("/api/strategy/opportunites", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          projetSlug: projet.slug,
          marqueId: marque.id,
          nomMarque: marque.nom,
          secteur: marque.secteur || undefined,
          statut: "IDENTIFIEE",
          angleNote: `[CLIENT_LANG:${clientLang}]`,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (res.ok) {
        const nbContacts = typeof data.contactsCopies === "number" ? data.contactsCopies : 0;
        setStrategyFlash({
          type: "success",
          message:
            `${marque.nom} ajoutée au pipeline « Identifiée » du projet ${projet.nom}` +
            (nbContacts > 0
              ? ` avec ${nbContacts} contact${nbContacts > 1 ? "s" : ""}.`
              : ". Attention : aucun contact avec email sur la fiche, la prospection ne pourra pas partir."),
          projetSlug: projet.slug,
          projetNom: projet.nom,
        });
        setStrategyPickerOpen(false);
      } else {
        setStrategyFlash({
          type: "error",
          message: data.error || "Erreur lors de l'envoi vers le projet.",
        });
      }
      setTimeout(() => setStrategyFlash(null), 8000);
    } catch {
      setStrategyFlash({ type: "error", message: "Erreur lors de l'envoi vers le projet." });
      setTimeout(() => setStrategyFlash(null), 8000);
    } finally {
      setSendingToProject(null);
    }
  };

  const handleDelete = async () => {
    if (!confirm(isBenelux ? "Supprimer cette entreprise BENELUX ?" : "Supprimer cette marque ?")) return;
    try {
      const res = await fetch(recordApi, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        alert(data.message || data.error || "Erreur lors de la suppression");
        return;
      }
      router.push("/marques");
    } catch {
      alert("Erreur lors de la suppression");
    }
  };

  /** Bascule CRM France ↔ BENELUX (contacts + cycles). */
  const transferMarket = async () => {
    if (!marque || transferringMarket) return;
    const ok = confirm(
      isBenelux
        ? `Passer « ${marque.nom} » en CRM France ?\n\n` +
          `Les contacts et leurs cycles seront copiés dans le CRM France. ` +
          `Les cycles BENELUX seront stoppés. La fiche BENELUX est conservée pour la trace.`
        : `Passer « ${marque.nom} » en CRM BENELUX ?\n\n` +
          `Les contacts (hors AO) et leurs cycles outreach seront copiés dans l'annuaire BENELUX. ` +
          `Les cycles France seront stoppés. La fiche France est conservée pour l'historique.`
    );
    if (!ok) return;
    setTransferringMarket(true);
    try {
      const res = await fetch(
        isBenelux ? `${recordApi}/transfer-to-fr` : `${recordApi}/transfer-to-benelux`,
        { method: "POST" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Transfert impossible.");
      router.push(
        data.targetPath ||
          (isBenelux ? `/marques/${data.targetId}` : `/marques/benelux/${data.targetId}`)
      );
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors du transfert.");
    } finally {
      setTransferringMarket(false);
    }
  };

  /** Bascule un contact vers l'autre CRM (FR ↔ BENELUX) + cycle outreach si présent. */
  const transferContactMarket = async (contact: Contact) => {
    if (!marque || transferringContactId) return;
    if (!contact.email?.trim()) {
      alert("Ajoute un email avant de basculer ce contact.");
      return;
    }
    const fullName =
      [contact.prenom, contact.nom].filter(Boolean).join(" ") || contact.email;
    const ok = confirm(
      isBenelux
        ? `Basculer ${fullName} sur la fiche CRM France ?\n\n` +
          `Le contact sera créé côté France` +
          ((contact.outreachTargets || []).some((t) => t.status !== "STOPPED")
            ? " et son cycle outreach passera en France."
            : ".")
        : `Basculer ${fullName} sur la fiche BENELUX ?\n\n` +
          `Le contact sera créé côté BENELUX` +
          ((contact.outreachTargets || []).some((t) => t.status !== "STOPPED")
            ? " et son cycle outreach passera en BENELUX."
            : ".")
    );
    if (!ok) return;
    setTransferringContactId(contact.id);
    try {
      const url = isBenelux
        ? `${recordApi}/contacts/transfer-to-fr`
        : `/api/marques/${marque.id}/contacts/transfer-to-benelux`;
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Bascule impossible.");
      router.push(data.targetPath || (isBenelux ? `/marques/${data.marqueId}` : `/marques/benelux/${data.companyId}`));
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de la bascule.");
    } finally {
      setTransferringContactId(null);
    }
  };

  /** Fusionne une fiche doublon dans la fiche courante (cible = page actuelle). */
  const mergeSimilarIntoCurrent = async (source: { id: string; nom: string }) => {
    if (mergingSimilarId || !marque) return;
    const ok = confirm(
      `Fusionner « ${source.nom} » dans « ${marque.nom} » ?\n\n` +
        `Tous les contacts, collabs et pipelines de « ${source.nom} » seront déplacés ici. ` +
        `La fiche « ${source.nom} » sera supprimée. Action irréversible.`
    );
    if (!ok) return;
    setMergingSimilarId(source.id);
    try {
      const res = await fetch(`${recordApi}/merge`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sourceMarqueId: source.id }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur lors de la fusion.");
      setSimilarMatches((prev) => prev.filter((m) => m.id !== source.id));
      setManualMergeResults((prev) => prev.filter((m) => m.id !== source.id));
      setManualMergeQuery("");
      await fetchMarque();
      alert(`Fusion réussie : « ${source.nom} » a été intégrée dans cette fiche.`);
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de la fusion.");
    } finally {
      setMergingSimilarId(null);
    }
  };

  // Recherche manuelle CRM pour fusion (debounce 280 ms, min 2 caractères).
  const marqueIdForMerge = marque?.id;
  const parentIdForMerge = marque?.parent?.id;
  const childrenIdsForMerge = (marque?.children || []).map((c) => c.id).join(",");
  useEffect(() => {
    if (!canMerge || !similarPanelOpen || !marqueIdForMerge) return;
    const q = manualMergeQuery.trim();
    if (q.length < 2) {
      setManualMergeResults([]);
      setManualMergeSearching(false);
      return;
    }
    let cancelled = false;
    setManualMergeSearching(true);
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`/api/marques/search?q=${encodeURIComponent(q)}`);
        if (!res.ok) throw new Error("Recherche impossible");
        const data = await res.json();
        const exclude = new Set<string>([
          marqueIdForMerge,
          ...(parentIdForMerge ? [parentIdForMerge] : []),
          ...childrenIdsForMerge.split(",").filter(Boolean),
        ]);
        if (!cancelled) {
          setManualMergeResults(
            ((data.marques || []) as { id: string; nom: string; ville: string; contactCount: number }[]).filter(
              (m) => !exclude.has(m.id)
            )
          );
        }
      } catch {
        if (!cancelled) setManualMergeResults([]);
      } finally {
        if (!cancelled) setManualMergeSearching(false);
      }
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [
    manualMergeQuery,
    canMerge,
    similarPanelOpen,
    marqueIdForMerge,
    parentIdForMerge,
    childrenIdsForMerge,
  ]);

  // Reset de la recherche manuelle à la fermeture du panneau.
  useEffect(() => {
    if (similarPanelOpen) return;
    setManualMergeQuery("");
    setManualMergeResults([]);
    setManualMergeSearching(false);
  }, [similarPanelOpen]);

  const copyEmail = (email: string) => {
    navigator.clipboard.writeText(email);
    setCopiedEmail(email);
    setTimeout(() => setCopiedEmail(null), 2000);
  };

  /** Ouvre l'édition inline de l'email d'un contact. */
  const startEditEmail = (contact: Contact) => {
    setEditEmailError(null);
    setEditEmailId(contact.id);
    setEditEmailValue(contact.email || "");
  };

  const cancelEditEmail = () => {
    setEditEmailId(null);
    setEditEmailValue("");
    setEditEmailError(null);
  };

  /** Enregistre le nouvel email d'un contact (fiche marque). */
  const saveContactEmail = async (contact: Contact) => {
    if (savingEmailId) return;
    const email = editEmailValue.trim();
    if (email === (contact.email || "")) {
      cancelEditEmail();
      return;
    }
    setEditEmailError(null);
    setSavingEmailId(contact.id);
    try {
      const res = await fetch(contactsApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur lors de la modification de l'email.");
      setMarque((prev) =>
        prev
          ? {
              ...prev,
              contacts: prev.contacts.map((c) =>
                c.id === contact.id ? { ...c, email: email || null } : c
              ),
            }
          : prev
      );
      cancelEditEmail();
    } catch (e) {
      setEditEmailError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingEmailId(null);
    }
  };

  const submitNewContact = async () => {
    if (savingContact) return;
    setContactError(null);
    setSavingContact(true);
    try {
      const res = await fetch(contactsApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newContact, language: newContactLang }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setNewContact({ prenom: "", nom: "", poste: "", email: "", telephone: "", linkedinUrl: "" });
      setNewContactLang(null);
      setShowAddContact(false);
      await fetchMarque();
    } catch (e) {
      setContactError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingContact(false);
    }
  };

  /** Supprime un contact de la marque. */
  const deleteContact = async (contact: Contact) => {
    if (deletingContactId) return;
    const fullName = [contact.prenom, contact.nom].filter(Boolean).join(" ") || "ce contact";
    if (!confirm(`Supprimer ${fullName} ?`)) return;
    setDeletingContactId(contact.id);
    try {
      const res = await fetch(
        `${contactsApi}?contactId=${encodeURIComponent(contact.id)}`,
        { method: "DELETE" }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression.");
      await fetchMarque();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors de la suppression.");
    } finally {
      setDeletingContactId(null);
    }
  };

  /** Opt-out / réinscription liste de diffusion (email conservé, enrôlement bloqué). */
  const toggleDiffusionOptOut = async (contact: Contact, optedOut: boolean) => {
    if (togglingOptOutId) return;
    const fullName = [contact.prenom, contact.nom].filter(Boolean).join(" ") || "ce contact";
    if (optedOut) {
      const ok = confirm(
        `${fullName} ne souhaite plus faire partie de la liste de diffusion ?\n\n` +
          `L'email reste sur la fiche, mais le contact sortira de tous les cycles ` +
          `(Outreach, mailer, projets) et ne pourra plus être enrôlé.`
      );
      if (!ok) return;
    }
    setTogglingOptOutId(contact.id);
    // Optimiste
    setMarque((prev) =>
      prev
        ? {
            ...prev,
            contacts: prev.contacts.map((c) =>
              c.id === contact.id
                ? {
                    ...c,
                    diffusionOptOut: optedOut,
                    diffusionOptOutAt: optedOut ? new Date().toISOString() : null,
                    outreachExcluded: optedOut ? true : c.outreachExcluded,
                    outreachTargets: optedOut ? [] : c.outreachTargets,
                  }
                : c
            ),
          }
        : prev
    );
    try {
      const res = await fetch(contactsApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, diffusionOptOut: optedOut }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur lors de la mise à jour.");
      await fetchMarque();
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur");
      await fetchMarque();
    } finally {
      setTogglingOptOutId(null);
    }
  };

  /** Change la langue d'un contact (fr/en) — utilisée par l'outreach. */
  const updateContactLanguage = async (contact: Contact, language: "fr" | "en") => {
    if (updatingLangId || (contact.language || "fr") === language) return;
    setUpdatingLangId(contact.id);
    // Optimiste : on met à jour l'UI tout de suite.
    setMarque((prev) =>
      prev
        ? {
            ...prev,
            contacts: prev.contacts.map((c) =>
              c.id === contact.id ? { ...c, language } : c
            ),
          }
        : prev
    );
    try {
      const res = await fetch(contactsApi, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactId: contact.id, language }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Erreur lors du changement de langue.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : "Erreur lors du changement de langue.");
      await fetchMarque();
    } finally {
      setUpdatingLangId(null);
    }
  };

  /** Envoie un contact (avec email) dans le cycle Outreach « À contacter ». */
  const launchOutreach = async (contact: Contact) => {
    if (launchingId || !contact.email) return;
    setLaunchError(null);
    setLaunchingId(contact.id);
    try {
      const res = await fetch(outreachTargetsApi, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(
          isBenelux
            ? {
                marqueContactId: contact.id,
                marqueId: marque?.id,
                email: contact.email,
                firstname: contact.prenom || contact.nom,
                lastname: contact.prenom ? contact.nom : undefined,
                language: contact.language || "fr",
              }
            : { marqueContactId: contact.id, email: contact.email }
        ),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de lancer le contact.");
      await fetchMarque();
    } catch (e) {
      setLaunchError({ id: contact.id, message: e instanceof Error ? e.message : "Erreur" });
    } finally {
      setLaunchingId(null);
    }
  };

  /**
   * Envoie toute la carto influence en outreach.
   * Gate : AO obligatoire. Sans email → file enrichissement ; avec tous les mails → cycle.
   */
  const envoyerCartoEnOutreach = async () => {
    if (envoyerBusy || !marque) return;
    setEnvoyerBusy(true);
    setCartoFlash(null);
    try {
      const res = await fetch(`${recordApi}/envoyer-outreach`, {
        method: "POST",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible d'envoyer en outreach.");
      setCartoFlash(data.message || "OK");
      setTimeout(() => setCartoFlash(null), 10000);
      await fetchMarque();
    } catch (e) {
      setCartoFlash(e instanceof Error ? e.message : "Erreur");
      setTimeout(() => setCartoFlash(null), 10000);
    } finally {
      setEnvoyerBusy(false);
    }
  };

  /** Bascule la marque en / hors Outreach (« Mettre en Outreach » / « Retirer »). */
  const toggleMarqueOutreach = async (enabled: boolean) => {
    if (toggleOutreachBusy || !marque) return;
    setToggleOutreachBusy(true);
    setCartoFlash(null);
    try {
      const res = await fetch(`${recordApi}/outreach-toggle`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Action impossible.");
      setCartoFlash(data.message || "OK");
      setTimeout(() => setCartoFlash(null), 10000);
      await fetchMarque();
    } catch (e) {
      setCartoFlash(e instanceof Error ? e.message : "Erreur");
      setTimeout(() => setCartoFlash(null), 10000);
    } finally {
      setToggleOutreachBusy(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-8 h-8 animate-spin" style={{ color: ROSE }} />
      </div>
    );
  }

  if (!marque) {
    return (
      <div className="text-center py-12">
        <p className="text-gray-500">Marque non trouvée</p>
        <Link href="/marques" className="hover:underline mt-2 inline-block" style={{ color: ROSE }}>
          Retour à la liste
        </Link>
      </div>
    );
  }

  const totalCA = marque.collaborations
    .filter((c) => c.statut !== "PERDU" && c.statut !== "NEGO")
    .reduce((acc, c) => acc + Number(c.montantBrut), 0);
  const crmContacts = marque.contacts.filter((c) => c.source !== "AO");
  const contactsInCycle = crmContacts.filter((c) =>
    (c.outreachTargets || []).some((t) => t.status !== "STOPPED")
  ).length;
  const cartoCount = marque.contacts.filter((c) => c.source === "CARTO").length;
  const repliedCount = crmContacts.filter((c) =>
    (c.outreachTargets || []).some((t) => t.lastRepliedAt)
  ).length;
  const siteDomain = marque.siteWeb ? marque.siteWeb.replace(/^https?:\/\//, "").split("/")[0] : null;
  const collabStatusCounts = marque.collaborations.reduce<Record<string, number>>((acc, c) => {
    acc[c.statut] = (acc[c.statut] || 0) + 1;
    return acc;
  }, {});

  const STATS: { label: string; value: string; sub: string | null; icon: typeof Euro | typeof Handshake | typeof Send | typeof Users | typeof Repeat | typeof Clock; tint: string }[] = [
    ...(!readOnly
      ? [
          isBenelux
            ? {
                label: marque._count.collaborations > 0 ? "CA total" : "En prospection",
                value:
                  marque._count.collaborations > 0
                    ? formatMoney(totalCA)
                    : String(contactsInCycle),
                sub:
                  marque._count.collaborations > 0
                    ? `${marque._count.collaborations} collab${marque._count.collaborations > 1 ? "s" : ""} (fiche FR liée)`
                    : "cycle outreach BENELUX",
                icon: marque._count.collaborations > 0 ? Euro : Send,
                tint: "text-emerald-600 bg-emerald-50",
              }
            : {
            label: "CA total",
            value: formatMoney(totalCA),
            sub: marque._count.collaborations > 0 ? `${marque._count.collaborations} collab${marque._count.collaborations > 1 ? "s" : ""}` : "aucune collab",
            icon: Euro,
            tint: "text-emerald-600 bg-emerald-50",
          },
        ]
      : [
          {
            label: "Collaborations",
            value: String(marque._count.collaborations),
            sub: null,
            icon: Handshake,
            tint: "text-emerald-600 bg-emerald-50",
          },
        ]),
    {
      label: "Contacts",
      value: String(crmContacts.length),
      sub: cartoCount > 0 ? `${cartoCount} via carto` : null,
      icon: Users,
      tint: "text-blue-600 bg-blue-50",
    },
    {
      label: "En cycle outreach",
      value: String(contactsInCycle),
      sub: repliedCount > 0 ? `${repliedCount} a répondu` : "relance auto J+3 · 45j",
      icon: Repeat,
      tint: "text-purple-600 bg-purple-50",
    },
    {
      label: "Paiement",
      value: `${marque.delaiPaiement || 30}j`,
      sub: marque.modePaiement || "Virement",
      icon: Clock,
      tint: "text-orange-600 bg-orange-50",
    },
  ];

  const cartoContacts = marque.contacts
    .filter((c) => c.source === "CARTO")
    .sort((a, b) => (a.priorite || "P9").localeCompare(b.priorite || "P9"));
  // La carto influence est « hors outreach » si tous ses contacts sont exclus
  // (import « Ne pas mettre en Outreach » ou « Retirer de l'Outreach »).
  const cartoOutOfOutreach =
    cartoContacts.length > 0 && cartoContacts.every((c) => c.outreachExcluded);
  const allCartoFiles = marque.cartoFiles || [];
  const cartoFiles = allCartoFiles.filter((f) => (f.kind || "CARTO") !== "AO");
  const aoFiles = allCartoFiles.filter((f) => f.kind === "AO");
  const aoContacts = marque.contacts
    .filter((c) => c.source === "AO")
    .sort((a, b) => (a.priorite || "P9").localeCompare(b.priorite || "P9"));

  /** Regénère le fichier Excel AO (contacts feuille 2). */
  const downloadAoExcel = async () => {
    if (exporting || aoContacts.length === 0) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Appel d'offre");

      ws.columns = [
        { width: 10 },
        { width: 14 },
        { width: 16 },
        { width: 46 },
        { width: 36 },
        { width: 18 },
        { width: 32 },
        { width: 48 },
      ];

      ws.mergeCells("A1:H1");
      const title = ws.getCell("A1");
      title.value = `${marque.nom} — Appel d'offre`;
      title.font = { bold: true, size: 14 };

      ws.addRow([]);
      const headerRow = ws.addRow([
        "Priorité",
        "Prénom",
        "Nom",
        "Rôle",
        "Périmètre",
        "Localisation",
        "Email",
        "URL LinkedIn",
      ]);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16110F" } };
        cell.alignment = { vertical: "middle" };
      });

      for (const contact of aoContacts) {
        const row = ws.addRow([
          contact.priorite?.toUpperCase() || "",
          contact.prenom || "",
          contact.nom || "",
          contact.poste || "",
          contact.perimetre || "",
          contact.localisation || "",
          contact.email || "",
          contact.linkedinUrl || "",
        ]);
        if (contact.linkedinUrl) {
          row.getCell(8).value = { text: contact.linkedinUrl, hyperlink: contact.linkedinUrl };
          row.getCell(8).font = { color: { argb: "FF2563A8" }, underline: true };
        }
        if (contact.email) {
          row.getCell(7).value = { text: contact.email, hyperlink: `mailto:${contact.email}` };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${marque.nom} - Appel d'offre.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export AO:", e);
      alert("Impossible de générer le fichier Excel.");
    } finally {
      setExporting(false);
    }
  };

  const syncAoContacts = async () => {
    if (!marque || aoSyncing) return;
    setAoSyncing(true);
    try {
      const res = await fetch(`${recordApi}/sync-ao`, { method: "POST" });
      if (res.ok) await fetchMarque();
    } catch (e) {
      console.error(e);
    } finally {
      setAoSyncing(false);
    }
  };

  /** Regénère le fichier Excel de la cartographie (emails et statuts à jour). */
  const downloadCartoExcel = async () => {
    if (exporting || cartoContacts.length === 0) return;
    setExporting(true);
    try {
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Cartographie");

      ws.columns = [
        { width: 10 },
        { width: 14 },
        { width: 16 },
        { width: 46 },
        { width: 36 },
        { width: 18 },
        { width: 32 },
        { width: 48 },
        { width: 26 },
      ];

      // Titre
      ws.mergeCells("A1:I1");
      const title = ws.getCell("A1");
      title.value = `${marque.nom} — Cartographie contacts influence`;
      title.font = { bold: true, size: 14 };

      // Ligne vide puis en-tête
      ws.addRow([]);
      const headerRow = ws.addRow([
        "Priorité",
        "Prénom",
        "Nom",
        "Rôle",
        "Périmètre",
        "Localisation",
        "Email",
        "URL LinkedIn",
        "Statut outreach",
      ]);
      headerRow.font = { bold: true, color: { argb: "FFFFFFFF" } };
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF16110F" } };
        cell.alignment = { vertical: "middle" };
      });

      const statusLabel = (info: OutreachInfo | null): string => {
        if (!info) return "";
        if (info.status === "WAITING") {
          const days = daysUntil(info.nextRecontactAt);
          return `En cycle${days !== null && days > 0 ? ` (recontact J-${days})` : ""}`;
        }
        if (info.status === "TO_CONTACT") return "À contacter";
        if (info.status === "TO_RECONTACT") return "À recontacter";
        return "Stoppé";
      };

      for (const contact of cartoContacts) {
        const outreach = (contact.outreachTargets || [])[0] || null;
        const row = ws.addRow([
          contact.priorite?.toUpperCase() || "",
          contact.prenom || "",
          contact.nom || "",
          contact.poste || "",
          contact.perimetre || "",
          contact.localisation || "",
          contact.email || "",
          contact.linkedinUrl || "",
          statusLabel(outreach),
        ]);
        if (contact.linkedinUrl) {
          row.getCell(8).value = { text: contact.linkedinUrl, hyperlink: contact.linkedinUrl };
          row.getCell(8).font = { color: { argb: "FF2563A8" }, underline: true };
        }
        if (contact.email) {
          row.getCell(7).value = { text: contact.email, hyperlink: `mailto:${contact.email}` };
        }
      }

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${marque.nom} - Cartographie contacts.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Export carto:", e);
      alert("Impossible de générer le fichier Excel.");
    } finally {
      setExporting(false);
    }
  };

  const TABS = [
    { id: "activite" as const, label: "Activité 360°", icon: Activity, badge: null as number | null },
    { id: "contacts" as const, label: "Contacts", icon: Users, badge: crmContacts.length || null },
    ...(cartoContacts.length > 0 || cartoFiles.length > 0
      ? [{ id: "carto" as const, label: "Cartographie", icon: FileSpreadsheet, badge: (cartoContacts.length || null) as number | null }]
      : []),
    ...(canFullCrm
      ? [{ id: "ao" as const, label: "Achats - AO", icon: Briefcase, badge: (aoContacts.length || aoFiles.length || null) as number | null }]
      : []),
    { id: "collabs" as const, label: "Collaborations", icon: Handshake, badge: marque._count.collaborations || null },
  ];

  return (
    <div className="min-h-full" style={{ backgroundColor: "#FAF9F7" }}>
      <div className="max-w-7xl mx-auto px-4 md:px-6 py-5 space-y-5">
        {/* ====================== Topbar ====================== */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-sm min-w-0">
            {readOnly ? (
              <button
                type="button"
                onClick={() => router.back()}
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                Retour
              </button>
            ) : (
              <Link
                href={isBenelux ? "/marques?market=BENELUX" : "/marques"}
                className="flex items-center gap-1.5 text-gray-400 hover:text-gray-700 transition-colors shrink-0"
              >
                <ArrowLeft className="w-4 h-4" />
                {isBenelux ? "Annuaire BENELUX" : "Marques"}
              </Link>
            )}
            <span className="text-gray-300">/</span>
            {marque.parent && (
              <>
                <Link
                  href={`/marques/${marque.parent.id}`}
                  className="text-gray-400 hover:text-gray-700 transition-colors truncate max-w-[140px]"
                >
                  {marque.parent.nom}
                </Link>
                <span className="text-gray-300">/</span>
              </>
            )}
            <span className="font-medium truncate" style={{ color: INK }}>
              {marque.nom}
            </span>
          </div>

          {(!readOnly || canStrategy) && (
            <div className="flex items-center gap-2 shrink-0">
              {canStrategy && (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() => setStrategyPickerOpen((o) => !o)}
                    className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                    style={{ color: INK }}
                  >
                    {sendingToProject ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: ROSE }} />
                    ) : (
                      <Briefcase className="w-3.5 h-3.5" style={{ color: ROSE }} />
                    )}
                    Stratégie
                  </button>
                  {strategyPickerOpen && (
                    <>
                      <div className="fixed inset-0 z-10" onClick={() => setStrategyPickerOpen(false)} />
                      <div className="absolute right-0 top-full mt-1.5 z-20 w-60 rounded-xl bg-white ring-1 ring-black/[0.08] shadow-lg py-1.5">
                        <p className="px-3 pt-1 pb-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                          Envoyer vers un projet
                        </p>
                        {STRATEGY_PROJECTS.map((projet) => (
                          <button
                            key={projet.slug}
                            type="button"
                            disabled={!!sendingToProject}
                            onClick={() => sendToStrategyProject(projet)}
                            className="w-full flex items-center gap-2 px-3 py-2 text-[13px] text-left hover:bg-gray-50 transition-colors disabled:opacity-50"
                            style={{ color: INK }}
                          >
                            {sendingToProject === projet.slug ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin shrink-0" style={{ color: ROSE }} />
                            ) : (
                              <Briefcase className="w-3.5 h-3.5 shrink-0 text-gray-300" />
                            )}
                            {projet.nom}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              )}
              {!readOnly && (
              <>
              <Link
                href={outreachHref}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                style={{ color: INK }}
              >
                <Repeat className="w-3.5 h-3.5" style={{ color: ROSE }} />
                Outreach
              </Link>
              {!isBenelux && (
              <Link
                href={`/collaborations/new?marque=${marque.id}`}
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                style={{ color: INK }}
              >
                <Plus className="w-3.5 h-3.5" style={{ color: ROSE }} />
                Collab
              </Link>
              )}
              {canMerge && (
                <button
                  type="button"
                  onClick={() => setSimilarPanelOpen((o) => !o)}
                  className="relative flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                  style={{
                    color: INK,
                    ...(similarPanelOpen || similarMatches.length > 0
                      ? { backgroundColor: "#FFF8F0", boxShadow: "inset 0 0 0 1px #F5E6D3" }
                      : {}),
                  }}
                  title="Voir les fiches similaires et fusionner les doublons"
                >
                  {similarLoading ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: ROSE }} />
                  ) : (
                    <GitMerge className="w-3.5 h-3.5" style={{ color: ROSE }} />
                  )}
                  Doublons
                  {similarChecked && similarMatches.length > 0 && (
                    <span
                      className="inline-flex items-center justify-center min-w-[18px] h-[18px] px-1 rounded-full text-[10px] font-bold text-white"
                      style={{ backgroundColor: ROSE }}
                    >
                      {similarMatches.length}
                    </span>
                  )}
                </button>
              )}
              {canOutreach && (
                <button
                  type="button"
                  onClick={transferMarket}
                  disabled={transferringMarket}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-medium rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors disabled:opacity-60 disabled:cursor-wait"
                  style={{ color: INK }}
                  title={isBenelux ? "Passer cette fiche en CRM France" : "Passer cette fiche en annuaire BENELUX"}
                >
                  {transferringMarket ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" style={{ color: ROSE }} />
                  ) : (
                    <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: ROSE }} />
                  )}
                  {isBenelux ? "→ France" : "→ BENELUX"}
                </button>
              )}
              <Link
                href={isBenelux ? `/marques/benelux/${marque.id}/edit` : `/marques/${marque.id}/edit`}
                className="flex items-center gap-1.5 px-3.5 py-1.5 text-[13px] font-semibold rounded-lg text-white transition-opacity hover:opacity-90"
                style={{ backgroundColor: INK }}
              >
                <Pencil className="w-3.5 h-3.5" />
                Modifier
              </Link>
              <button
                onClick={handleDelete}
                className="p-2 rounded-lg text-gray-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                title="Supprimer la marque"
              >
                <Trash2 className="w-4 h-4" />
              </button>
              </>
              )}
            </div>
          )}
        </div>

        {strategyFlash && (
          <div
            className="flex items-center gap-2 px-4 py-2.5 rounded-xl text-[13px] ring-1 ring-inset"
            style={
              strategyFlash.type === "success"
                ? { backgroundColor: "#F8FCEF", color: "#3D8B40" }
                : { backgroundColor: "#FEF2F2", color: "#B91C1C" }
            }
          >
            {strategyFlash.type === "success" ? <Check className="w-4 h-4 shrink-0" /> : <X className="w-4 h-4 shrink-0" />}
            <span>{strategyFlash.message}</span>
            {strategyFlash.projetSlug && (
              <Link
                href={`/strategy/projets/${strategyFlash.projetSlug}`}
                className="font-semibold underline underline-offset-2 hover:opacity-80"
              >
                Voir le projet
              </Link>
            )}
          </div>
        )}

        {/* ====================== Lien croisé FR ↔ BENELUX ====================== */}
        {(() => {
          const beLink = !isBenelux ? marque.beneluxLinks?.[0] : null;
          const frLink =
            isBenelux && (marque.linkedMarque || marque.linkedMarqueId)
              ? marque.linkedMarque || {
                  id: marque.linkedMarqueId!,
                  nom: "fiche France",
                }
              : null;
          if (!beLink && !frLink) return null;
          return (
            <div
              className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 rounded-xl ring-1 ring-inset"
              style={{
                backgroundColor: isBenelux ? "#FFFBEB" : "#EEF2FF",
                boxShadow: isBenelux
                  ? "inset 0 0 0 1px #FDE68A"
                  : "inset 0 0 0 1px #C7D2FE",
              }}
            >
              <p className="text-[13px]" style={{ color: INK }}>
                {isBenelux ? (
                  <>
                    Aussi en <span className="font-semibold">🇫🇷 France</span>
                    {frLink && frLink.nom !== "fiche France" ? (
                      <> — « {frLink.nom} »</>
                    ) : null}
                    . Collabs et activité métier viennent de cette fiche.
                  </>
                ) : (
                  <>
                    Aussi en <span className="font-semibold">🇧🇪 BENELUX</span>
                    {beLink ? <> — « {beLink.nom} »</> : null}.
                    Les collabs restent sur cette fiche France.
                  </>
                )}
              </p>
              <Link
                href={
                  isBenelux
                    ? `/marques/${frLink!.id}`
                    : `/marques/benelux/${beLink!.id}`
                }
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-white shrink-0"
                style={{ backgroundColor: INK }}
              >
                <ArrowLeftRight className="w-3.5 h-3.5" style={{ color: ROSE }} />
                {isBenelux ? "Ouvrir la fiche France" : "Ouvrir la fiche BENELUX"}
              </Link>
            </div>
          );
        })()}
        <div className="flex items-center gap-4">
          <div className="w-16 h-16 rounded-2xl bg-white ring-1 ring-black/[0.07] shadow-sm flex items-center justify-center overflow-hidden shrink-0">
            {siteDomain && !logoError ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={`https://www.google.com/s2/favicons?domain=${siteDomain}&sz=128`}
                alt={marque.nom}
                className="w-9 h-9 object-contain"
                onError={() => setLogoError(true)}
              />
            ) : (
              <span className="text-2xl font-bold" style={{ color: ROSE }}>
                {marque.nom.charAt(0).toUpperCase()}
              </span>
            )}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <h1 className="text-[26px] font-bold tracking-[-0.02em] leading-tight truncate" style={{ color: INK }}>
                {marque.nom}
              </h1>
              {isBenelux && (
                <span
                  className="inline-flex items-center px-2 py-0.5 rounded-md text-[11px] font-bold uppercase tracking-wide shrink-0"
                  style={{ backgroundColor: "#FEF3C7", color: "#92400E" }}
                >
                  🇧🇪 BENELUX
                </span>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-1 mt-1 text-[13px] text-gray-500">
              {marque.secteur && (
                <span
                  className="px-2 py-[2px] rounded-md text-xs font-medium ring-1 ring-inset ring-black/[0.06]"
                  style={{ backgroundColor: "#F5EBE0", color: INK }}
                >
                  {marque.secteur}
                </span>
              )}
              {siteDomain && (
                <a
                  href={marque.siteWeb!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center gap-1 hover:underline"
                  style={{ color: ROSE }}
                >
                  <Globe className="w-3.5 h-3.5" />
                  {siteDomain}
                </a>
              )}
              {marque.ville && (
                <span className="flex items-center gap-1">
                  <MapPin className="w-3.5 h-3.5" />
                  {marque.ville}
                  {marque.pays ? `, ${marque.pays}` : ""}
                </span>
              )}
              <span className="flex items-center gap-1">
                <Calendar className="w-3.5 h-3.5" />
                {isBenelux ? "Prospect depuis" : "Client depuis"}{" "}
                {new Date(marque.createdAt).toLocaleDateString("fr-FR", { month: "short", year: "numeric" })}
              </span>
            </div>
          </div>
        </div>

        {/* ====================== Doublons / fusions possibles ====================== */}
        {canMerge && similarPanelOpen && (
          <div
            className="rounded-2xl ring-1 ring-inset overflow-hidden"
            style={{
              backgroundColor: similarMatches.some((m) => m.reason === "EXACT") ? "#FEF2F2" : "#FFF8F0",
              borderColor: similarMatches.some((m) => m.reason === "EXACT") ? "#FECACA" : "#F5E6D3",
            }}
          >
            <div className="flex items-start justify-between gap-3 px-4 py-3 border-b border-black/[0.04]">
              <div className="flex items-start gap-2.5 min-w-0">
                {similarLoading ? (
                  <Loader2 className="w-4 h-4 animate-spin mt-0.5 shrink-0" style={{ color: ROSE }} />
                ) : (
                  <GitMerge className="w-4 h-4 mt-0.5 shrink-0" style={{ color: ROSE }} />
                )}
                <div className="min-w-0">
                  <p className="text-[13px] font-semibold" style={{ color: INK }}>
                    {similarLoading
                      ? "Recherche de fiches doublons…"
                      : similarMatches.length > 0
                        ? `${similarMatches.length} fiche${similarMatches.length > 1 ? "s" : ""} similaire${
                            similarMatches.length > 1 ? "s" : ""
                          } — fusion possible`
                        : "Aucune fiche similaire détectée"}
                  </p>
                  {!similarLoading && (
                    <p className="text-[12px] text-gray-500 mt-0.5">
                      {similarMatches.length > 0
                        ? "Tu peux fusionner une fiche dans celle-ci : contacts, collabs et pipelines seront regroupés ici."
                        : "Pas de doublon exact ni de variante proche trouvée automatiquement — tu peux aussi chercher une fiche à la main."}
                    </p>
                  )}
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSimilarPanelOpen(false)}
                className="p-1 rounded-md text-gray-400 hover:text-gray-600 hover:bg-white/60 shrink-0"
                title="Fermer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            {!similarLoading && similarMatches.length > 0 && (
              <ul className="divide-y divide-black/[0.04]">
                {similarMatches.map((m) => {
                  const reasonLabel =
                    m.reason === "EXACT"
                      ? "Doublon exact"
                      : m.reason === "TYPO"
                        ? "Typo / faute"
                        : m.reason === "PREFIX"
                          ? "Nom proche (préfixe)"
                          : "Variante proche";
                  const activity =
                    m.counts.collaborations +
                    m.counts.negociations +
                    m.counts.contacts +
                    m.counts.inboundOpportunities;
                  return (
                    <li
                      key={m.id}
                      className="flex flex-wrap items-center justify-between gap-3 px-4 py-3 bg-white/50"
                    >
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <Link
                            href={`/marques/${m.id}`}
                            className="text-[13.5px] font-semibold hover:underline"
                            style={{ color: INK }}
                          >
                            {m.nom}
                          </Link>
                          <span
                            className={`text-[10px] font-bold px-1.5 py-[2px] rounded-md ${
                              m.reason === "EXACT"
                                ? "bg-red-100 text-red-700"
                                : m.reason === "TYPO"
                                  ? "bg-orange-100 text-orange-700"
                                  : "bg-amber-100 text-amber-800"
                            }`}
                          >
                            {reasonLabel}
                          </span>
                          {m.secteur && (
                            <span className="text-[11px] text-gray-400">{m.secteur}</span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-400 mt-0.5">
                          Similarité {Math.round(m.similarity * 100)}%
                          {activity > 0
                            ? ` · ${m.counts.contacts} contact${m.counts.contacts > 1 ? "s" : ""} · ${
                                m.counts.collaborations
                              } collab${m.counts.collaborations > 1 ? "s" : ""}`
                            : " · fiche peu active"}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => mergeSimilarIntoCurrent(m)}
                        disabled={mergingSimilarId === m.id}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-60 shrink-0"
                        style={{ backgroundColor: INK }}
                        title={`Fusionner « ${m.nom} » dans cette fiche`}
                      >
                        {mergingSimilarId === m.id ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <GitMerge className="w-3.5 h-3.5" />
                        )}
                        Fusionner ici
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
            {!similarLoading && (
              <div
                className={`px-4 py-3 bg-white/40 ${
                  similarMatches.length > 0 ? "border-t border-black/[0.04]" : ""
                }`}
              >
                <label className="block text-[11px] font-semibold uppercase tracking-[0.06em] text-gray-400 mb-1.5">
                  Chercher une fiche à fusionner
                </label>
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-400 pointer-events-none" />
                  <input
                    type="search"
                    value={manualMergeQuery}
                    onChange={(e) => setManualMergeQuery(e.target.value)}
                    placeholder="Nom de la marque dans le CRM…"
                    className="w-full pl-8 pr-3 py-2 text-[13px] rounded-lg bg-white ring-1 ring-black/[0.08] focus:outline-none focus:ring-2 focus:ring-black/20"
                    style={{ color: INK }}
                    autoComplete="off"
                  />
                  {manualMergeSearching && (
                    <Loader2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 animate-spin text-gray-400" />
                  )}
                </div>
                {manualMergeQuery.trim().length >= 2 && !manualMergeSearching && manualMergeResults.length === 0 && (
                  <p className="text-[12px] text-gray-400 mt-2">Aucune marque trouvée pour « {manualMergeQuery.trim()} ».</p>
                )}
                {manualMergeResults.length > 0 && (
                  <ul className="mt-2 divide-y divide-black/[0.04] rounded-lg overflow-hidden ring-1 ring-black/[0.06] bg-white">
                    {manualMergeResults.slice(0, 8).map((m) => (
                      <li
                        key={m.id}
                        className="flex flex-wrap items-center justify-between gap-3 px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <Link
                            href={`/marques/${m.id}`}
                            className="text-[13px] font-semibold hover:underline"
                            style={{ color: INK }}
                          >
                            {m.nom}
                          </Link>
                          <p className="text-[11px] text-gray-400 mt-0.5">
                            {m.contactCount} contact{m.contactCount > 1 ? "s" : ""}
                            {m.ville ? ` · ${m.ville}` : ""}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => mergeSimilarIntoCurrent(m)}
                          disabled={mergingSimilarId === m.id}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 text-[12px] font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-60 shrink-0"
                          style={{ backgroundColor: INK }}
                          title={`Fusionner « ${m.nom} » dans cette fiche`}
                        >
                          {mergingSimilarId === m.id ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <GitMerge className="w-3.5 h-3.5" />
                          )}
                          Fusionner ici
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </div>
        )}

        {/* ====================== Stat cards ====================== */}
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
          {STATS.map((stat) => (
            <div
              key={stat.label}
              className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] px-4 py-3.5 flex items-start justify-between"
            >
              <div className="min-w-0">
                <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">{stat.label}</p>
                <p className="text-[22px] font-bold tabular-nums mt-0.5 truncate" style={{ color: INK }}>
                  {stat.value}
                </p>
                {stat.sub && <p className="text-xs text-gray-400 mt-0.5 truncate">{stat.sub}</p>}
              </div>
              <div className={`p-2 rounded-xl shrink-0 ${stat.tint}`}>
                <stat.icon className="w-4 h-4" />
              </div>
            </div>
          ))}
        </div>

        {/* ====================== Body ====================== */}
        <div className="grid grid-cols-1 lg:grid-cols-[300px_minmax(0,1fr)] gap-5 items-start">
          {/* ---------- Panneau latéral ---------- */}
          <aside className="space-y-4 lg:sticky lg:top-5">
            <SectionCard title="À propos" icon={Building2}>
              <div>
                {marque.siteWeb && (
                  <DetailRow
                    label="Site"
                    value={
                      <a href={marque.siteWeb} target="_blank" rel="noopener noreferrer" className="hover:underline" style={{ color: ROSE }}>
                        {siteDomain}
                      </a>
                    }
                  />
                )}
                {marque.secteur && <DetailRow label="Secteur" value={marque.secteur} />}
                {(marque.adresseRue || marque.ville) && (
                  <DetailRow
                    label="Adresse"
                    value={
                      <span className="block leading-snug">
                        {marque.adresseRue && (
                          <>
                            {marque.adresseRue}
                            <br />
                          </>
                        )}
                        {marque.adresseComplement && (
                          <>
                            {marque.adresseComplement}
                            <br />
                          </>
                        )}
                        {[marque.codePostal, marque.ville].filter(Boolean).join(" ")}
                        {marque.pays ? `, ${marque.pays}` : ""}
                      </span>
                    }
                  />
                )}
                <DetailRow
                  label="Créée le"
                  value={new Date(marque.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short", year: "numeric" })}
                />
              </div>
            </SectionCard>

            {!isBenelux && (
            <SectionCard title="Groupe" icon={Building2}>
              <div className="space-y-3">
                {/* Marque mère */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                    Marque mère
                  </p>
                  {marque.parent ? (
                    <div className="flex items-center justify-between gap-2">
                      <Link
                        href={`/marques/${marque.parent.id}`}
                        className="text-[13px] font-medium hover:underline truncate"
                        style={{ color: INK }}
                      >
                        {marque.parent.nom}
                      </Link>
                      {!readOnly && (
                        <button
                          onClick={detachParent}
                          disabled={hierarchyBusy}
                          className="text-gray-300 hover:text-red-500 shrink-0 disabled:opacity-50"
                          title="Détacher de la marque mère"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  ) : readOnly ? (
                    <p className="text-xs text-gray-300 italic">Aucune</p>
                  ) : parentPickerOpen ? (
                    <HierarchyPicker
                      items={allMarques.filter(
                        (m) =>
                          m.id !== marque.id &&
                          !(marque.children || []).some((c) => c.id === m.id)
                      )}
                      busy={hierarchyBusy}
                      placeholder="Chercher ou créer la marque mère…"
                      query={hierarchyQuery}
                      onQuery={setHierarchyQuery}
                      onPick={attachParent}
                      onCreate={createAndAttachParent}
                      createLabel="Créer la mère"
                      onCancel={() => {
                        setParentPickerOpen(false);
                        setHierarchyQuery("");
                      }}
                    />
                  ) : (
                    <button
                      onClick={() => {
                        setChildPickerOpen(false);
                        setParentPickerOpen(true);
                        setHierarchyError(null);
                        setHierarchyQuery("");
                        loadAllMarques();
                      }}
                      className="text-[13px] hover:underline inline-flex items-center gap-1"
                      style={{ color: ROSE }}
                    >
                      <Plus className="w-3.5 h-3.5" />
                      Rattacher à une mère
                    </button>
                  )}
                </div>

                {/* Marques filles */}
                <div>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400 mb-1">
                    Sous-marques
                    {marque.children && marque.children.length > 0
                      ? ` (${marque.children.length})`
                      : ""}
                  </p>
                  {marque.children && marque.children.length > 0 && (
                    <ul className="space-y-1 mb-1.5">
                      {marque.children.map((c) => (
                        <li key={c.id} className="flex items-center justify-between gap-2">
                          <Link
                            href={`/marques/${c.id}`}
                            className="text-[13px] hover:underline truncate"
                            style={{ color: INK }}
                          >
                            {c.nom}
                            {(() => {
                              const n = c._count.contacts + c._count.sousMarqueContacts;
                              return (
                                <span className="text-gray-400 text-xs ml-1.5">
                                  {n} contact{n > 1 ? "s" : ""}
                                </span>
                              );
                            })()}
                          </Link>
                          {!readOnly && (
                            <button
                              onClick={() => detachChild(c.id)}
                              disabled={hierarchyBusy}
                              className="text-gray-300 hover:text-red-500 shrink-0 disabled:opacity-50"
                              title="Détacher cette sous-marque"
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </li>
                      ))}
                    </ul>
                  )}
                  {!readOnly &&
                    (childPickerOpen ? (
                      <HierarchyPicker
                        items={allMarques.filter(
                          (m) =>
                            m.id !== marque.id &&
                            m.id !== marque.parent?.id &&
                            !(marque.children || []).some((c) => c.id === m.id)
                        )}
                        busy={hierarchyBusy}
                        placeholder="Chercher ou créer une sous-marque…"
                        query={hierarchyQuery}
                        onQuery={setHierarchyQuery}
                        onPick={attachChild}
                        onCreate={createAndAttachChild}
                        createLabel="Créer la sous-marque"
                        onCancel={() => {
                          setChildPickerOpen(false);
                          setHierarchyQuery("");
                        }}
                      />
                    ) : (
                      <button
                        onClick={() => {
                          setParentPickerOpen(false);
                          setChildPickerOpen(true);
                          setHierarchyError(null);
                          setHierarchyQuery("");
                          loadAllMarques();
                        }}
                        className="text-[13px] hover:underline inline-flex items-center gap-1"
                        style={{ color: ROSE }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Ajouter une sous-marque
                      </button>
                    ))}
                  {(!marque.children || marque.children.length === 0) &&
                    !childPickerOpen &&
                    readOnly && <p className="text-xs text-gray-300 italic">Aucune</p>}
                </div>

                {hierarchyError && (
                  <p className="text-xs text-red-600">{hierarchyError}</p>
                )}
              </div>
            </SectionCard>
            )}

            <SectionCard title="Facturation" icon={ReceiptText}>
              <div>
                {marque.raisonSociale && <DetailRow label="Raison sociale" value={marque.raisonSociale} />}
                {marque.formeJuridique && <DetailRow label="Forme" value={marque.formeJuridique} />}
                {marque.siret && <DetailRow label="SIRET" value={marque.siret} mono />}
                {marque.numeroTVA && <DetailRow label="TVA" value={marque.numeroTVA} mono />}
                <DetailRow label="Délai" value={`${marque.delaiPaiement || 30} jours`} />
                <DetailRow
                  label="Mode"
                  value={
                    <span className="inline-flex items-center gap-1">
                      <Banknote className="w-3.5 h-3.5 text-gray-300" />
                      {marque.modePaiement || "Virement"}
                    </span>
                  }
                />
                <DetailRow label="Devise" value={marque.devise || "EUR"} />
                {!marque.raisonSociale && !marque.siret && (
                  <p className="text-xs text-gray-300 italic pt-2">
                    Infos légales à compléter via « Modifier »
                  </p>
                )}
              </div>
            </SectionCard>

            {marque.notes && (
              <SectionCard title="Notes" icon={StickyNote}>
                <p className="text-[13px] text-gray-600 leading-relaxed whitespace-pre-line">{marque.notes}</p>
              </SectionCard>
            )}
          </aside>

          {/* ---------- Zone principale ---------- */}
          <main className="min-w-0 space-y-4">
            {/* Tabs segmentés */}
            <div className="inline-flex items-center gap-1 p-1 rounded-xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)]">
              {TABS.map((tab) => {
                const active = activeTab === tab.id;
                return (
                  <button
                    key={tab.id}
                    onClick={() => setActiveTab(tab.id)}
                    className={`flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg text-[13px] font-medium transition-all ${
                      active ? "text-white shadow-sm" : "text-gray-500 hover:text-gray-800 hover:bg-gray-50"
                    }`}
                    style={active ? { backgroundColor: INK } : undefined}
                  >
                    <tab.icon className="w-3.5 h-3.5" />
                    {tab.label}
                    {tab.badge !== null && (
                      <span
                        className={`text-[10px] font-bold px-1.5 rounded-full tabular-nums ${
                          active ? "bg-white/20 text-white" : "bg-gray-100 text-gray-500"
                        }`}
                      >
                        {tab.badge}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            {/* ============ Activité ============ */}
            {activeTab === "activite" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] p-5">
                {isBenelux && !marque.linkedMarqueId ? (
                  <div className="py-6 text-center">
                    <p className="text-[14px] font-semibold" style={{ color: INK }}>
                      Activité outreach BENELUX
                    </p>
                    <p className="text-[13px] text-gray-500 mt-1.5 max-w-md mx-auto">
                      {contactsInCycle} contact{contactsInCycle > 1 ? "s" : ""} en cycle.
                      Aucune fiche France liée — collabs / négo non disponibles.
                    </p>
                    <Link
                      href={`${outreachHref}&q=${encodeURIComponent(marque.nom)}`}
                      className="inline-flex items-center gap-1.5 mt-4 text-[13px] font-semibold hover:underline"
                      style={{ color: ROSE }}
                    >
                      <Send className="w-3.5 h-3.5" />
                      Ouvrir l&apos;outreach
                    </Link>
                  </div>
                ) : (
                  <MarqueCrmTab marqueId={marque.linkedMarqueId || marque.id} />
                )}
              </div>
            )}

            {/* ============ Contacts ============ */}
            {activeTab === "contacts" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-3 px-5 py-3.5 border-b border-gray-100">
                  <div className="text-[13px] text-gray-500">
                    <span className="font-semibold" style={{ color: INK }}>
                      {crmContacts.length}
                    </span>{" "}
                    contact{crmContacts.length > 1 ? "s" : ""}
                    {cartoCount > 0 && (
                      <span className="inline-flex items-center gap-1 ml-2 text-xs text-gray-400">
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                        {cartoCount} via cartographie
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {canOutreach && !readOnly && (
                      <button
                        onClick={() => setShowImportCarto(true)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded-lg ring-1 ring-black/[0.08] bg-white text-gray-700 hover:bg-gray-50 transition-colors"
                        title="Importe un fichier Excel ou colle un tableau de contacts"
                      >
                        <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-500" />
                        Importer une carto
                      </button>
                    )}
                    <button
                      onClick={() => setShowAddContact((v) => !v)}
                      className={`flex items-center gap-1.5 px-3 py-1.5 text-[13px] font-semibold rounded-lg transition-colors ${
                        showAddContact ? "text-gray-500 ring-1 ring-black/[0.08] bg-white hover:bg-gray-50" : "text-white hover:opacity-90"
                      }`}
                      style={showAddContact ? undefined : { backgroundColor: INK }}
                    >
                      {showAddContact ? <X className="w-3.5 h-3.5" /> : <Plus className="w-3.5 h-3.5" />}
                      {showAddContact ? "Annuler" : "Ajouter"}
                    </button>
                  </div>
                </div>

                {cartoFlash && (
                  <div className="px-5 py-2.5 border-b border-gray-100 text-[13px] flex items-center gap-2" style={{ backgroundColor: "#F8FCEF", color: "#3D8B40" }}>
                    <Check className="w-4 h-4" />
                    {cartoFlash}
                  </div>
                )}

                {/* Ajout rapide */}
                {showAddContact && (
                  <div className="px-5 py-4 border-b border-gray-100" style={{ backgroundColor: "#FAF9F7" }}>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                      {(
                        [
                          ["prenom", "Prénom", "text"],
                          ["nom", "Nom", "text"],
                          ["poste", "Poste / rôle", "text"],
                          ["email", "Email", "email"],
                          ["telephone", "Téléphone", "tel"],
                          ["linkedinUrl", "URL LinkedIn", "url"],
                        ] as const
                      ).map(([key, placeholder, type]) => (
                        <input
                          key={key}
                          type={type}
                          placeholder={placeholder}
                          value={newContact[key]}
                          onChange={(e) => setNewContact({ ...newContact, [key]: e.target.value })}
                          className="px-3 py-2 rounded-lg bg-white ring-1 ring-black/[0.08] text-[13px] focus:outline-none focus:ring-2"
                        />
                      ))}
                    </div>
                    <div className="mt-3">
                      <label className="block text-[11px] font-semibold uppercase tracking-wide text-gray-500 mb-1.5">
                        Langue du contact <span className="text-red-500">*</span>
                      </label>
                      <div className="flex gap-1.5">
                        {(["fr", "en"] as const).map((lang) => {
                          const active = newContactLang === lang;
                          return (
                            <button
                              key={lang}
                              type="button"
                              onClick={() => setNewContactLang(lang)}
                              className="px-3 py-1.5 rounded-lg text-[13px] font-medium transition ring-1 ring-black/[0.08]"
                              style={
                                active
                                  ? { backgroundColor: INK, color: "white" }
                                  : { backgroundColor: "white", color: INK }
                              }
                            >
                              {lang === "fr" ? "🇫🇷 Français" : "🇬🇧 English"}
                            </button>
                          );
                        })}
                      </div>
                      {newContactLang === null && (
                        <p className="text-[11px] text-gray-400 mt-1">
                          Obligatoire : ses mails et relances auto partiront dans cette langue.
                        </p>
                      )}
                    </div>
                    {contactError && <p className="text-xs text-red-600 mt-2">{contactError}</p>}
                    <div className="flex justify-end mt-3">
                      <button
                        onClick={submitNewContact}
                        disabled={
                          savingContact ||
                          (!newContact.prenom.trim() && !newContact.nom.trim()) ||
                          newContactLang === null
                        }
                        className="flex items-center gap-2 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 disabled:opacity-40 transition-opacity"
                        style={{ backgroundColor: INK }}
                      >
                        {savingContact && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                        Enregistrer
                      </button>
                    </div>
                  </div>
                )}

                {crmContacts.length === 0 &&
                !showAddContact &&
                (!marque.sousMarqueContacts || marque.sousMarqueContacts.length === 0) ? (
                  <div className="text-center py-14">
                    <Users className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">Aucun contact enregistré</p>
                    <p className="text-xs text-gray-300 mt-1">
                      {canOutreach && !readOnly
                        ? "Ajoute un contact, ou importe directement une cartographie via « Importer une carto »."
                        : "Ajoute un contact ici, ou importe une cartographie depuis Outreach."}
                    </p>
                  </div>
                ) : (
                  <div className="divide-y divide-gray-50">
                    {crmContacts.map((contact) => {
                      const outreach = (contact.outreachTargets || [])[0] || null;
                      return (
                        <div key={contact.id} className="group px-5 py-3.5 hover:bg-gray-50/60 transition-colors">
                          <div className="flex items-start gap-3.5">
                            {/* Avatar */}
                            <div
                              className="w-10 h-10 rounded-full flex items-center justify-center text-[13px] font-bold text-white shrink-0 mt-0.5"
                              style={{
                                background: contact.principal
                                  ? `linear-gradient(135deg, ${ROSE}, #9C6B6B)`
                                  : "linear-gradient(135deg, #3A2E2A, #16110F)",
                              }}
                            >
                              {initials(contact.prenom, contact.nom)}
                            </div>

                            {/* Identité */}
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 flex-wrap">
                                <span className="text-[14px] font-semibold" style={{ color: INK }}>
                                  {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
                                </span>
                                {contact.principal && (
                                  <span className="inline-flex items-center gap-0.5 text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ring-black/[0.06]" style={{ backgroundColor: "#F5EBE0", color: INK }}>
                                    <Star className="w-2.5 h-2.5" style={{ color: ROSE }} />
                                    Principal
                                  </span>
                                )}
                                {contact.priorite && (
                                  <span className={`text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ${prioriteStyle(contact.priorite)}`}>
                                    {contact.priorite.toUpperCase()}
                                  </span>
                                )}
                                {outreach?.lastRepliedAt && (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
                                    <MessageSquareReply className="w-3 h-3" />A répondu
                                  </span>
                                )}
                                {contact.diffusionOptOut && (
                                  <span
                                    className="inline-flex items-center gap-1 text-[10px] font-semibold px-1.5 py-[2px] rounded-md ring-1 ring-inset"
                                    style={{ backgroundColor: "#FEF2F2", color: "#B91C1C", borderColor: "#FECACA" }}
                                    title="Hors liste de diffusion — email conservé, enrôlement impossible"
                                  >
                                    <Ban className="w-2.5 h-2.5" />
                                    Hors diffusion
                                  </span>
                                )}
                              </div>
                              {contact.poste && (
                                <p className="text-[12.5px] text-gray-500 mt-0.5 leading-snug">{contact.poste}</p>
                              )}
                              {(contact.perimetre || contact.localisation) && (
                                <p className="text-xs text-gray-400 mt-0.5">
                                  {[contact.perimetre, contact.localisation].filter(Boolean).join(" · ")}
                                </p>
                              )}

                              {/* Coordonnées */}
                              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 mt-1.5">
                                {editEmailId === contact.id ? (
                                  <span className="inline-flex flex-col gap-1">
                                    <span className="inline-flex items-center gap-1.5">
                                      <Mail className="w-3.5 h-3.5 text-gray-300" />
                                      <input
                                        type="email"
                                        autoFocus
                                        value={editEmailValue}
                                        onChange={(e) => setEditEmailValue(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === "Enter") {
                                            e.preventDefault();
                                            saveContactEmail(contact);
                                          } else if (e.key === "Escape") {
                                            cancelEditEmail();
                                          }
                                        }}
                                        placeholder="email@marque.com"
                                        className="text-[12.5px] px-2 py-1 rounded-md border border-gray-200 focus:outline-none focus:ring-1"
                                        style={{ minWidth: 220 }}
                                      />
                                      <button
                                        onClick={() => saveContactEmail(contact)}
                                        disabled={savingEmailId === contact.id}
                                        className="p-1 rounded-md hover:bg-emerald-50 disabled:opacity-50"
                                        title="Enregistrer"
                                      >
                                        {savingEmailId === contact.id ? (
                                          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                                        ) : (
                                          <Check className="w-3.5 h-3.5 text-emerald-500" />
                                        )}
                                      </button>
                                      <button
                                        onClick={cancelEditEmail}
                                        disabled={savingEmailId === contact.id}
                                        className="p-1 rounded-md hover:bg-gray-100 disabled:opacity-50"
                                        title="Annuler"
                                      >
                                        <X className="w-3.5 h-3.5 text-gray-400" />
                                      </button>
                                    </span>
                                    {editEmailError && (
                                      <span className="text-[11px] text-red-500">{editEmailError}</span>
                                    )}
                                  </span>
                                ) : contact.email ? (
                                  <span className="inline-flex items-center gap-1">
                                    <a
                                      href={`mailto:${contact.email}`}
                                      className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-600 hover:text-gray-900"
                                    >
                                      <Mail className="w-3.5 h-3.5 text-gray-300" />
                                      {contact.email}
                                    </a>
                                    <button
                                      onClick={() => copyEmail(contact.email!)}
                                      className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                      title="Copier"
                                    >
                                      {copiedEmail === contact.email ? (
                                        <Check className="w-3 h-3 text-emerald-500" />
                                      ) : (
                                        <Copy className="w-3 h-3 text-gray-400" />
                                      )}
                                    </button>
                                    {!readOnly && (
                                      <button
                                        onClick={() => startEditEmail(contact)}
                                        className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                        title="Modifier l'email"
                                      >
                                        <Pencil className="w-3 h-3 text-gray-400" />
                                      </button>
                                    )}
                                    {canOutreach && contact.email && (
                                      <button
                                        type="button"
                                        onClick={() => void transferContactMarket(contact)}
                                        disabled={transferringContactId === contact.id}
                                        className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-bold uppercase tracking-wide hover:opacity-90 disabled:opacity-50"
                                        style={{
                                          backgroundColor: isBenelux ? "#EEF2FF" : "#FEF3C7",
                                          color: isBenelux ? "#3730A3" : "#92400E",
                                        }}
                                        title={
                                          isBenelux
                                            ? "Basculer ce contact sur la fiche CRM France"
                                            : "Basculer ce contact sur la fiche BENELUX"
                                        }
                                      >
                                        {transferringContactId === contact.id ? (
                                          <Loader2 className="w-3 h-3 animate-spin" />
                                        ) : (
                                          <ArrowLeftRight className="w-3 h-3" />
                                        )}
                                        {isBenelux ? "→ FR" : "→ BE"}
                                      </button>
                                    )}
                                  </span>
                                ) : readOnly ? (
                                  <span className="inline-flex items-center gap-1.5 text-xs text-gray-300 italic">
                                    <Mail className="w-3.5 h-3.5" />
                                    email à compléter dans Outreach
                                  </span>
                                ) : (
                                  <button
                                    onClick={() => startEditEmail(contact)}
                                    className="inline-flex items-center gap-1.5 text-xs text-gray-400 italic hover:text-gray-700"
                                    title="Ajouter un email"
                                  >
                                    <Mail className="w-3.5 h-3.5" />
                                    Ajouter un email
                                  </button>
                                )}
                                {contact.telephone && (
                                  <span className="inline-flex items-center gap-1.5 text-[12.5px] text-gray-600">
                                    <Phone className="w-3.5 h-3.5 text-gray-300" />
                                    {contact.telephone}
                                  </span>
                                )}
                              </div>

                              {/* Langue (utilisée par l'outreach : relance + génération de mails) */}
                              <div className="flex items-center gap-1.5 mt-2">
                                <Globe className="w-3.5 h-3.5 text-gray-300" />
                                {readOnly ? (
                                  <span className="text-[12px] text-gray-500">
                                    {(contact.language || "fr") === "en" ? "🇬🇧 English" : "🇫🇷 Français"}
                                  </span>
                                ) : (
                                  <div className="inline-flex items-center gap-1">
                                    {(["fr", "en"] as const).map((lang) => {
                                      const active = (contact.language || "fr") === lang;
                                      return (
                                        <button
                                          key={lang}
                                          type="button"
                                          onClick={() => updateContactLanguage(contact, lang)}
                                          disabled={updatingLangId === contact.id}
                                          className="px-2 py-[3px] rounded-md text-[11px] font-medium ring-1 ring-inset transition-all disabled:opacity-50"
                                          style={
                                            active
                                              ? { backgroundColor: INK, color: "white", borderColor: INK }
                                              : { backgroundColor: "white", color: "#6b7280" }
                                          }
                                          title="Langue utilisée pour la relance et la génération de mails Outreach"
                                        >
                                          {lang === "fr" ? "🇫🇷 FR" : "🇬🇧 EN"}
                                        </button>
                                      );
                                    })}
                                    {updatingLangId === contact.id && (
                                      <Loader2 className="w-3 h-3 animate-spin text-gray-400" />
                                    )}
                                  </div>
                                )}
                              </div>

                              {/* Opt-out liste de diffusion */}
                              {!readOnly && (
                                <label
                                  className={`mt-2.5 flex items-start gap-2 cursor-pointer select-none rounded-lg px-2.5 py-2 ring-1 ring-inset transition-colors ${
                                    contact.diffusionOptOut
                                      ? "bg-red-50/80 ring-red-200"
                                      : "bg-gray-50/80 ring-black/[0.04] hover:bg-gray-50"
                                  }`}
                                >
                                  <input
                                    type="checkbox"
                                    className="mt-0.5 rounded border-gray-300"
                                    checked={Boolean(contact.diffusionOptOut)}
                                    disabled={togglingOptOutId === contact.id}
                                    onChange={(e) =>
                                      toggleDiffusionOptOut(contact, e.target.checked)
                                    }
                                  />
                                  <span className="min-w-0">
                                    <span
                                      className="block text-[12px] font-medium leading-snug"
                                      style={{ color: contact.diffusionOptOut ? "#B91C1C" : INK }}
                                    >
                                      Le client ne souhaite plus faire partie de notre liste de diffusion
                                    </span>
                                    <span className="block text-[11px] text-gray-400 mt-0.5 leading-snug">
                                      L&apos;email est conservé ; aucun enrôlement Outreach / mailer / projets.
                                    </span>
                                  </span>
                                  {togglingOptOutId === contact.id && (
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400 shrink-0 mt-0.5" />
                                  )}
                                </label>
                              )}
                              {readOnly && contact.diffusionOptOut && (
                                <p className="mt-2 text-[12px] text-red-700">
                                  Hors liste de diffusion — enrôlement impossible.
                                </p>
                              )}

                              {/* Sous-marques couvertes par ce contact (peut en avoir plusieurs) */}
                              {((contact.sousMarques && contact.sousMarques.length > 0) ||
                                !readOnly) && (
                                <div className="mt-2">
                                  {contact.sousMarques && contact.sousMarques.length > 0 && (
                                    <div className="flex flex-wrap items-center gap-1.5 mb-1">
                                      {contact.sousMarques.map((s) => (
                                        <span
                                          key={s.marque.id}
                                          className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-[3px] rounded-md ring-1 ring-inset ring-black/[0.06]"
                                          style={{ backgroundColor: "#F5EBE0", color: INK }}
                                        >
                                          <Building2 className="w-2.5 h-2.5" style={{ color: ROSE }} />
                                          {s.marque.nom}
                                          {!readOnly && (
                                            <button
                                              type="button"
                                              onClick={() => removeSousMarque(contact, s.marque.id)}
                                              disabled={assignBusy}
                                              className="ml-0.5 text-gray-400 hover:text-red-500 disabled:opacity-50"
                                              title="Retirer cette sous-marque"
                                            >
                                              <X className="w-2.5 h-2.5" />
                                            </button>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  )}
                                  {!readOnly && !isBenelux && (
                                    <>
                                      <button
                                        type="button"
                                        onClick={() => {
                                          setAssignError(null);
                                          setAssignOpenId(
                                            assignOpenId === contact.id ? null : contact.id
                                          );
                                          loadAllMarques();
                                        }}
                                        className="inline-flex items-center gap-1 text-[11px] font-medium hover:underline"
                                        style={{ color: ROSE }}
                                      >
                                        <Plus className="w-3 h-3" />
                                        {contact.sousMarques && contact.sousMarques.length > 0
                                          ? "Ajouter une sous-marque"
                                          : "Attribuer une sous-marque"}
                                      </button>
                                      {assignOpenId === contact.id && (
                                        <AssignSubMarqueControl
                                          subMarques={(marque.children || []).filter(
                                            (c) =>
                                              !(contact.sousMarques || []).some(
                                                (s) => s.marque.id === c.id
                                              )
                                          )}
                                          allMarques={allMarques}
                                          excludeIds={
                                            new Set<string>([
                                              marque.id,
                                              ...(contact.sousMarques || []).map(
                                                (s) => s.marque.id
                                              ),
                                            ])
                                          }
                                          busy={assignBusy}
                                          error={assignError}
                                          onAssign={(marqueId) =>
                                            assignContact(contact, { childId: marqueId })
                                          }
                                          onCreate={(newName) =>
                                            assignContact(contact, { newName })
                                          }
                                        />
                                      )}
                                    </>
                                  )}
                                </div>
                              )}
                            </div>

                            {/* Côté droit : outreach + LinkedIn */}
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <div className="flex items-center gap-1.5">
                                {contact.linkedinUrl && (
                                  <a
                                    href={contact.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1.5 rounded-lg text-[#0A66C2] bg-[#0A66C2]/[0.07] hover:bg-[#0A66C2]/15 transition-colors"
                                    title="Profil LinkedIn"
                                  >
                                    <Linkedin className="w-3.5 h-3.5" />
                                  </a>
                                )}
                                {!readOnly && (
                                  <button
                                    type="button"
                                    onClick={() => deleteContact(contact)}
                                    disabled={deletingContactId === contact.id}
                                    className="p-1.5 rounded-lg text-red-500 bg-red-50 opacity-0 group-hover:opacity-100 hover:bg-red-100 transition-all disabled:opacity-60 disabled:cursor-wait"
                                    title="Supprimer ce contact"
                                  >
                                    {deletingContactId === contact.id ? (
                                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                                    ) : (
                                      <Trash2 className="w-3.5 h-3.5" />
                                    )}
                                  </button>
                                )}
                              </div>
                              {outreach ? (
                                <OutreachBadge info={outreach} />
                              ) : (
                                contact.email &&
                                canOutreach &&
                                !contact.diffusionOptOut && (
                                  <button
                                    type="button"
                                    onClick={() => launchOutreach(contact)}
                                    disabled={launchingId === contact.id}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity hover:underline disabled:opacity-60 disabled:cursor-wait"
                                    style={{ color: ROSE }}
                                    title="Ajouter ce contact au cycle Outreach (À contacter)"
                                  >
                                    {launchingId === contact.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    Lancer le contact
                                  </button>
                                )
                              )}
                              {contact.diffusionOptOut && !outreach && (
                                <span className="text-[10px] font-medium text-red-600 text-right max-w-[160px] leading-tight">
                                  Hors liste de diffusion
                                </span>
                              )}
                              {launchError?.id === contact.id && (
                                <span className="text-[10px] text-red-500 text-right max-w-[180px] leading-tight">
                                  {launchError.message}
                                </span>
                              )}
                              {outreach && outreach.cycleCount > 0 && (
                                <span className="text-[10px] text-gray-300 tabular-nums">Cycle {outreach.cycleCount}</span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}

                {/* Contacts rattachés à cette marque en tant que sous-marque */}
                {marque.sousMarqueContacts && marque.sousMarqueContacts.length > 0 && (
                  <div className="border-t border-gray-100">
                    <div className="px-5 py-2.5 bg-gray-50/60">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-400">
                        Rattachés depuis la marque mère ({marque.sousMarqueContacts.length})
                      </p>
                    </div>
                    <div className="divide-y divide-gray-50">
                      {marque.sousMarqueContacts.map((sc) => (
                        <div key={sc.id} className="px-5 py-3 flex items-start gap-3.5">
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-[12px] font-bold text-white shrink-0"
                            style={{ background: "linear-gradient(135deg, #3A2E2A, #16110F)" }}
                          >
                            {initials(sc.contact.prenom, sc.contact.nom)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="text-[13.5px] font-semibold" style={{ color: INK }}>
                                {[sc.contact.prenom, sc.contact.nom].filter(Boolean).join(" ")}
                              </span>
                              <Link
                                href={`/marques/${sc.contact.marque.id}`}
                                className="text-[11px] text-gray-400 hover:underline"
                              >
                                via {sc.contact.marque.nom}
                              </Link>
                            </div>
                            {sc.contact.poste && (
                              <p className="text-[12px] text-gray-500 mt-0.5">{sc.contact.poste}</p>
                            )}
                            {sc.contact.email && (
                              <a
                                href={`mailto:${sc.contact.email}`}
                                className="inline-flex items-center gap-1.5 text-[12px] text-gray-600 hover:text-gray-900 mt-0.5"
                              >
                                <Mail className="w-3.5 h-3.5 text-gray-300" />
                                {sc.contact.email}
                              </a>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* ============ Collaborations ============ */}
            {/* ============ Cartographie importée ============ */}
            {activeTab === "carto" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                {cartoFlash && (
                  <div className="px-5 py-2.5 border-b border-gray-100 text-[13px] flex items-center gap-2" style={{ backgroundColor: "#F8FCEF", color: "#3D8B40" }}>
                    <Check className="w-4 h-4 shrink-0" />
                    {cartoFlash}
                    <Link href="/enrichissement" className="ml-auto text-xs font-semibold underline" style={{ color: ROSE }}>
                      Enrichissement
                    </Link>
                  </div>
                )}
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100">
                  <div className="text-[13px] text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet className="w-4 h-4 text-emerald-500" />
                      <span className="font-semibold" style={{ color: INK }}>
                        {cartoContacts.length}
                      </span>
                      contact{cartoContacts.length > 1 ? "s" : ""} importé{cartoContacts.length > 1 ? "s" : ""} — cartographie de l&apos;influence chez {marque.nom}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {canOutreach && !readOnly && cartoContacts.length > 0 && (
                      cartoOutOfOutreach ? (
                        <button
                          type="button"
                          onClick={() => toggleMarqueOutreach(true)}
                          disabled={toggleOutreachBusy}
                          className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                          style={{ backgroundColor: "#3D8B40" }}
                          title="Réintègre cette carto dans l'Outreach : contacts avec email → « À contacter », sans email → enrichissement."
                        >
                          {toggleOutreachBusy ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                          ) : (
                            <Send className="w-3.5 h-3.5" />
                          )}
                          Mettre en Outreach
                        </button>
                      ) : (
                        <>
                          <button
                            type="button"
                            onClick={() => toggleMarqueOutreach(false)}
                            disabled={toggleOutreachBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
                            style={{ color: INK }}
                            title="Retire cette carto de l'Outreach. Les contacts restent sur la fiche (CRM / pipeline talent) mais quittent le cycle « À contacter »."
                          >
                            {toggleOutreachBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <X className="w-3.5 h-3.5" />
                            )}
                            Retirer de l&apos;Outreach
                          </button>
                          <button
                            type="button"
                            onClick={envoyerCartoEnOutreach}
                            disabled={envoyerBusy}
                            className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                            style={{ backgroundColor: ROSE }}
                            title="Envoie la carto en outreach. Sans email → enrichissement."
                          >
                            {envoyerBusy ? (
                              <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            ) : (
                              <Send className="w-3.5 h-3.5" />
                            )}
                            Envoyer en outreach
                          </button>
                        </>
                      )
                    )}
                    <Link
                      href={outreachHref}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors"
                      style={{ color: INK }}
                    >
                      <Repeat className="w-3.5 h-3.5" style={{ color: ROSE }} />
                      Gérer dans Outreach
                    </Link>
                    <button
                      onClick={downloadCartoExcel}
                      disabled={exporting}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                      style={{ backgroundColor: INK }}
                      title="Regénère le fichier Excel avec les emails et statuts à jour"
                    >
                      {exporting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Télécharger l&apos;Excel
                    </button>
                  </div>
                </div>

                {/* Fichiers originaux importés */}
                {cartoFiles.length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300 mb-2">
                      Fichier{cartoFiles.length > 1 ? "s" : ""} d&apos;origine
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {cartoFiles.map((file) => (
                        <a
                          key={file.id}
                          href={`${recordApi}/carto-files/${file.id}`}
                          className="group inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg bg-white ring-1 ring-black/[0.07] hover:ring-black/20 transition-all text-[12.5px]"
                          style={{ color: INK }}
                          title="Télécharger le fichier tel qu'importé"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-emerald-500 shrink-0" />
                          <span className="font-medium truncate max-w-[260px]">{file.fileName}</span>
                          <span className="text-[11px] text-gray-300">
                            {(file.size / 1024).toFixed(0)} Ko ·{" "}
                            {new Date(file.createdAt).toLocaleDateString("fr-FR", { day: "2-digit", month: "short" })}
                          </span>
                          <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600 transition-colors shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300">
                        <th className="px-5 py-2.5 font-semibold w-16">Prio</th>
                        <th className="px-3 py-2.5 font-semibold">Contact</th>
                        <th className="px-3 py-2.5 font-semibold">Rôle</th>
                        <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">Périmètre</th>
                        <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Localisation</th>
                        <th className="px-3 py-2.5 font-semibold">Email</th>
                        <th className="px-5 py-2.5 font-semibold text-right">Statut</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {cartoContacts.map((contact) => {
                        const outreach = (contact.outreachTargets || [])[0] || null;
                        return (
                          <tr key={contact.id} className="group hover:bg-gray-50/60 transition-colors align-top">
                            <td className="px-5 py-3">
                              {contact.priorite ? (
                                <span className={`inline-block text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ${prioriteStyle(contact.priorite)}`}>
                                  {contact.priorite.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-200">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: INK }}>
                                  {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
                                </span>
                                {contact.linkedinUrl && (
                                  <a
                                    href={contact.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md text-[#0A66C2] bg-[#0A66C2]/[0.07] hover:bg-[#0A66C2]/15 transition-colors shrink-0"
                                    title="Profil LinkedIn"
                                  >
                                    <Linkedin className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-600 max-w-[260px]">
                              {contact.poste || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-500 hidden lg:table-cell max-w-[220px]">
                              {contact.perimetre || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-500 hidden md:table-cell whitespace-nowrap">
                              {contact.localisation || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3">
                              {contact.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <a
                                    href={`mailto:${contact.email}`}
                                    className="text-[12.5px] text-gray-600 hover:text-gray-900 whitespace-nowrap"
                                  >
                                    {contact.email}
                                  </a>
                                  <button
                                    onClick={() => copyEmail(contact.email!)}
                                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                    title="Copier"
                                  >
                                    {copiedEmail === contact.email ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-gray-400" />
                                    )}
                                  </button>
                                </span>
                              ) : (
                                <span className="text-xs text-gray-300 italic whitespace-nowrap">à compléter</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              {outreach ? (
                                <OutreachBadge info={outreach} />
                              ) : contact.email && canOutreach ? (
                                <div className="flex flex-col items-end gap-1">
                                  <button
                                    type="button"
                                    onClick={() => launchOutreach(contact)}
                                    disabled={launchingId === contact.id}
                                    className="inline-flex items-center gap-1 text-[11px] font-semibold transition-opacity hover:underline disabled:opacity-60 disabled:cursor-wait"
                                    style={{ color: ROSE }}
                                    title="Ajouter ce contact au cycle Outreach (À contacter)"
                                  >
                                    {launchingId === contact.id ? (
                                      <Loader2 className="w-3 h-3 animate-spin" />
                                    ) : (
                                      <Send className="w-3 h-3" />
                                    )}
                                    Lancer
                                  </button>
                                  {launchError?.id === contact.id && (
                                    <span className="text-[10px] text-red-500 leading-tight max-w-[160px]">
                                      {launchError.message}
                                    </span>
                                  )}
                                </div>
                              ) : (
                                <span className="text-xs text-gray-200">—</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-300">
                  Importée via « Importer une carto » dans Outreach — complète les emails manquants là-bas pour lancer les cycles de contact.
                </div>
              </div>
            )}

            {activeTab === "ao" && canFullCrm && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 px-5 py-3.5 border-b border-gray-100">
                  <div className="text-[13px] text-gray-500">
                    <span className="inline-flex items-center gap-1.5">
                      <Briefcase className="w-4 h-4 text-amber-600" />
                      <span className="font-semibold" style={{ color: INK }}>
                        {aoContacts.length}
                      </span>
                      contact{aoContacts.length > 1 ? "s" : ""} importé
                      {aoContacts.length > 1 ? "s" : ""} — appel d&apos;offre chez {marque.nom}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    {(aoFiles.length > 0 || cartoFiles.length > 0) && aoContacts.length === 0 && (
                      <button
                        type="button"
                        onClick={syncAoContacts}
                        disabled={aoSyncing}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg ring-1 ring-black/[0.08] bg-white hover:bg-gray-50 transition-colors disabled:opacity-50"
                        style={{ color: INK }}
                      >
                        {aoSyncing ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Repeat className="w-3.5 h-3.5 text-amber-600" />
                        )}
                        Charger les contacts
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={downloadAoExcel}
                      disabled={exporting || aoContacts.length === 0}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg text-white hover:opacity-90 disabled:opacity-50 transition-opacity"
                      style={{ backgroundColor: INK }}
                      title="Regénère le fichier Excel AO"
                    >
                      {exporting ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <Download className="w-3.5 h-3.5" />
                      )}
                      Télécharger l&apos;Excel
                    </button>
                  </div>
                </div>

                {aoFiles.length > 0 && (
                  <div className="px-5 py-3 border-b border-gray-100 bg-gray-50/50">
                    <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300 mb-2">
                      Fichier{aoFiles.length > 1 ? "s" : ""} d&apos;origine
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {aoFiles.map((file) => (
                        <a
                          key={file.id}
                          href={`${recordApi}/carto-files/${file.id}`}
                          className="group inline-flex items-center gap-2 pl-2.5 pr-3 py-1.5 rounded-lg bg-white ring-1 ring-black/[0.07] hover:ring-black/20 transition-all text-[12.5px]"
                          style={{ color: INK }}
                          title="Télécharger la feuille Appel d'offre"
                        >
                          <FileSpreadsheet className="w-4 h-4 text-amber-600 shrink-0" />
                          <span className="font-medium truncate max-w-[260px]">{file.fileName}</span>
                          <span className="text-[11px] text-gray-300">
                            {(file.size / 1024).toFixed(0)} Ko ·{" "}
                            {new Date(file.createdAt).toLocaleDateString("fr-FR", {
                              day: "2-digit",
                              month: "short",
                            })}
                          </span>
                          <Download className="w-3.5 h-3.5 text-gray-300 group-hover:text-gray-600 transition-colors shrink-0" />
                        </a>
                      ))}
                    </div>
                  </div>
                )}

                {aoSyncing ? (
                  <div className="flex items-center justify-center gap-2 py-14 text-sm text-gray-400">
                    <Loader2 className="w-4 h-4 animate-spin" />
                    Import des contacts AO…
                  </div>
                ) : aoContacts.length === 0 ? (
                  <div className="text-center py-14">
                    <Briefcase className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">
                      {aoFiles.length > 0 || cartoFiles.length > 0
                        ? "Aucun contact AO pour l'instant — clique sur « Charger les contacts »."
                        : "Aucun fichier AO pour l'instant"}
                    </p>
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left">
                      <thead>
                        <tr className="border-b border-gray-100 text-[11px] font-semibold uppercase tracking-[0.08em] text-gray-300">
                          <th className="px-5 py-2.5 font-semibold w-16">Prio</th>
                          <th className="px-3 py-2.5 font-semibold">Contact</th>
                          <th className="px-3 py-2.5 font-semibold">Rôle</th>
                          <th className="px-3 py-2.5 font-semibold hidden lg:table-cell">Périmètre</th>
                          <th className="px-3 py-2.5 font-semibold hidden md:table-cell">Localisation</th>
                          <th className="px-3 py-2.5 font-semibold">Email</th>
                          <th className="px-5 py-2.5 font-semibold text-right"> </th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-50">
                        {aoContacts.map((contact) => (
                          <tr key={contact.id} className="group hover:bg-gray-50/60 transition-colors align-top">
                            <td className="px-5 py-3">
                              {contact.priorite ? (
                                <span
                                  className={`inline-block text-[10px] font-bold px-1.5 py-[2px] rounded-md ring-1 ring-inset ${prioriteStyle(contact.priorite)}`}
                                >
                                  {contact.priorite.toUpperCase()}
                                </span>
                              ) : (
                                <span className="text-xs text-gray-200">—</span>
                              )}
                            </td>
                            <td className="px-3 py-3">
                              <div className="flex items-center gap-2">
                                <span className="text-[13px] font-semibold whitespace-nowrap" style={{ color: INK }}>
                                  {[contact.prenom, contact.nom].filter(Boolean).join(" ")}
                                </span>
                                {contact.linkedinUrl && (
                                  <a
                                    href={contact.linkedinUrl}
                                    target="_blank"
                                    rel="noopener noreferrer"
                                    className="p-1 rounded-md text-[#0A66C2] bg-[#0A66C2]/[0.07] hover:bg-[#0A66C2]/15 transition-colors shrink-0"
                                    title="Profil LinkedIn"
                                  >
                                    <Linkedin className="w-3 h-3" />
                                  </a>
                                )}
                              </div>
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-600 max-w-[260px]">
                              {contact.poste || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-500 hidden lg:table-cell max-w-[220px]">
                              {contact.perimetre || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3 text-[12.5px] text-gray-500 hidden md:table-cell whitespace-nowrap">
                              {contact.localisation || <span className="text-gray-200">—</span>}
                            </td>
                            <td className="px-3 py-3">
                              {contact.email ? (
                                <span className="inline-flex items-center gap-1">
                                  <a
                                    href={`mailto:${contact.email}`}
                                    className="text-[12.5px] text-gray-600 hover:text-gray-900 whitespace-nowrap"
                                  >
                                    {contact.email}
                                  </a>
                                  <button
                                    type="button"
                                    onClick={() => copyEmail(contact.email!)}
                                    className="p-1 rounded-md opacity-0 group-hover:opacity-100 hover:bg-gray-100 transition-all"
                                    title="Copier"
                                  >
                                    {copiedEmail === contact.email ? (
                                      <Check className="w-3 h-3 text-emerald-500" />
                                    ) : (
                                      <Copy className="w-3 h-3 text-gray-300" />
                                    )}
                                  </button>
                                </span>
                              ) : (
                                <span className="text-xs text-gray-200">—</span>
                              )}
                            </td>
                            <td className="px-5 py-3 text-right">
                              <span className="text-xs text-gray-200">—</span>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="px-5 py-2.5 border-t border-gray-100 text-xs text-gray-300">
                  Feuille 2 du classeur importé via Outreach — visible admin uniquement.
                </div>
              </div>
            )}

            {activeTab === "collabs" && (
              <div className="rounded-2xl bg-white ring-1 ring-black/[0.06] shadow-[0_1px_2px_rgba(16,12,10,0.04)] overflow-hidden">
                {marque.collaborations.length === 0 ? (
                  <div className="text-center py-14">
                    <Handshake className="w-10 h-10 text-gray-200 mx-auto mb-3" />
                    <p className="text-sm text-gray-400">
                      {isBenelux
                        ? marque.linkedMarqueId
                          ? "Aucune collaboration sur la fiche France liée"
                          : "Les collaborations vivent dans le CRM France (aucune fiche liée)"
                        : "Aucune collaboration pour l'instant"}
                    </p>
                    {!readOnly && !isBenelux && (
                      <Link
                        href={`/collaborations/new?marque=${marque.id}`}
                        className="inline-flex items-center gap-2 mt-4 px-4 py-2 text-[13px] font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                        style={{ backgroundColor: INK }}
                      >
                        <Plus className="w-3.5 h-3.5" />
                        Créer une collab
                      </Link>
                    )}
                  </div>
                ) : (
                  <>
                    <div className="flex flex-wrap items-center gap-2 px-5 py-3.5 border-b border-gray-100">
                      {!readOnly && (
                        <>
                          <span className="text-[13px] font-semibold tabular-nums" style={{ color: INK }}>
                            {formatMoney(totalCA)}
                          </span>
                          <span className="text-xs text-gray-400">de CA</span>
                          <span className="text-gray-200">·</span>
                        </>
                      )}
                      {Object.entries(collabStatusCounts).map(([statut, count]) => (
                        <span key={statut} className={`text-[11px] font-medium px-2 py-[3px] rounded-md ${collabStatusClass(statut)}`}>
                          {count} {statut}
                        </span>
                      ))}
                      {!readOnly && (
                        <Link
                          href={`/collaborations/new?marque=${marque.id}`}
                          className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-white rounded-lg hover:opacity-90 transition-opacity"
                          style={{ backgroundColor: INK }}
                        >
                          <Plus className="w-3.5 h-3.5" />
                          Nouvelle
                        </Link>
                      )}
                    </div>
                    <div className="divide-y divide-gray-50">
                      {marque.collaborations.map((collab) => (
                        <Link
                          key={collab.id}
                          href={`/collaborations/${collab.id}`}
                          className="flex items-center gap-3.5 px-5 py-3.5 hover:bg-gray-50/60 transition-colors"
                        >
                          <div
                            className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-white shrink-0"
                            style={{ background: "linear-gradient(135deg, #C08B8B, #9C6B6B)" }}
                          >
                            {initials(collab.talent.prenom, collab.talent.nom)}
                          </div>
                          <div className="min-w-0 flex-1">
                            <p className="text-[14px] font-medium truncate" style={{ color: INK }}>
                              {collab.talent.prenom} {collab.talent.nom}
                            </p>
                            <p className="text-xs text-gray-400 truncate">
                              {collab.typeContenu} · {collab.reference}
                            </p>
                          </div>
                          <div className="text-right shrink-0">
                            <p className="text-[14px] font-semibold tabular-nums" style={{ color: INK }}>
                              {formatMoney(collab.montantBrut)}
                            </p>
                            <span className={`text-[10px] font-medium px-1.5 py-[2px] rounded-md ${collabStatusClass(collab.statut)}`}>
                              {collab.statut}
                            </span>
                          </div>
                        </Link>
                      ))}
                    </div>
                  </>
                )}
              </div>
            )}
          </main>
        </div>
      </div>

      {showImportCarto && (
        <ImportCartoModal
          lockedMarque={{ id: marque.id, nom: marque.nom }}
          lockedMarket={isBenelux ? "BENELUX" : "FR"}
          onClose={() => setShowImportCarto(false)}
          onImported={({ created, skipped, addedToCycle }) => {
            setShowImportCarto(false);
            const parts: string[] = [];
            parts.push(`${created} contact${created > 1 ? "s" : ""} importé${created > 1 ? "s" : ""}`);
            if (addedToCycle > 0) parts.push(`${addedToCycle} dans « À contacter »`);
            if (skipped > 0) parts.push(`${skipped} doublon${skipped > 1 ? "s" : ""} ignoré${skipped > 1 ? "s" : ""}`);
            setCartoFlash(`Cartographie importée : ${parts.join(" · ")}.`);
            setTimeout(() => setCartoFlash(null), 8000);
            fetchMarque().then(() => setActiveTab("carto"));
          }}
          showMarket={false}
          onError={(message) => alert(message)}
        />
      )}
    </div>
  );
}
