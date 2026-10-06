"use client";

/**
 * Enrichissement — /enrichissement
 *
 * Onglet Marques : drop carto → liste → fiche → mails (ou « pas d'email ») → Prêt → outreach.
 * Onglet Agences (ADMIN) : file des contacts partners sans email → Prêt →
 * agency-outreach. Seuls les contacts avec email partent en outreach.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Linkedin,
  Check,
  ChevronRight,
  ArrowLeft,
  FileSpreadsheet,
  Sparkles,
  Trash2,
  Globe,
  Zap,
  ShieldCheck,
  Inbox,
} from "lucide-react";
import { ImportCartoModal } from "@/components/outreach/ImportCartoModal";
import { FwImportCartoModal } from "@/components/fw/FwImportCartoModal";
import {
  ImportAgencyModal,
  type AgencyImportResult,
} from "@/components/agency-outreach/ImportAgencyModal";
import {
  detectEmailPattern,
  suggestEmailsForContact,
  type EmailSuggestion,
} from "@/lib/email-pattern";
import type {
  EnrichCompareResponse,
  ProviderEnrichmentResult,
} from "@/lib/enrichment/types";
import type {
  EmailVerifyResult,
  EmailVerifyStatus,
} from "@/lib/enrichment/verify-email";

const INK = "#1A1110";
const ROSE = "#C08B8B";
const CREAM = "#F5EBE0";
const GREEN = "#3D8B40";

const ALLOWED = ["ADMIN", "CASTING_MANAGER"];

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

const norm = (s: string) =>
  (s || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();

type Market = "FR" | "BENELUX" | "AGENCY" | "FW";
type BrandMarket = "FR" | "BENELUX";
type PersonMarket = BrandMarket | "BOTH";
type Tab = "marques" | "attente" | "agences" | "fw";
/** Sous-onglets Cartographies : destination outreach après « Prêt ». */
type MarqueMarketTab = PersonMarket;

const brandMarketBucket = (markets: Market[]): MarqueMarketTab => {
  const hasFr = markets.includes("FR");
  const hasBe = markets.includes("BENELUX");
  if (hasFr && hasBe) return "BOTH";
  if (hasBe) return "BENELUX";
  return "FR";
};

type AwaitingMarqueItem = {
  key: string;
  brandName: string;
  marqueId: string | null;
  emailableCount: number;
  contactCount: number;
  requestedAt: string | null;
  sources: Array<"projet" | "pipeline">;
  sourceLabel: string;
  both: boolean;
  fichePath: string | null;
  contexts: Array<{
    missionId: string;
    kind: "projet" | "pipeline";
    label: string;
    path: string;
    talentName: string;
    creatorName: string;
    requestedByName: string | null;
    requestedAt: string | null;
  }>;
};

type ContactLang = "fr" | "en";

type LookupContact = {
  id: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: string;
  marqueId: string;
  company: string;
  market: Market;
  source: "CARTO" | "AO" | null;
};
type PersonRef = { id: string; market: Market; marqueId: string };

/**
 * Personne dédupliquée : un même contact importé « FR+BE » existe en 2 lignes
 * (MarqueContact + BeneluxContact). On les fusionne pour ne saisir le mail
 * qu'une seule fois — il sera propagé à chaque `ref`.
 */
type Person = {
  key: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: ContactLang;
  source: "CARTO" | "AO" | null;
  refs: PersonRef[];
};

const personMarketSelection = (p: Person): PersonMarket => {
  const hasFr = p.refs.some((r) => r.market === "FR");
  const hasBe = p.refs.some((r) => r.market === "BENELUX");
  if (hasFr && hasBe) return "BOTH";
  if (hasBe) return "BENELUX";
  return "FR";
};

const marketsFromSelection = (m: PersonMarket): BrandMarket[] =>
  m === "BOTH" ? ["FR", "BENELUX"] : [m];

const toLang = (v: string | null | undefined): ContactLang =>
  v === "en" ? "en" : "fr";

const verifyStatusColor = (status: EmailVerifyStatus): string => {
  switch (status) {
    case "valid":
      return GREEN;
    case "invalid":
    case "no_mx":
      return "#DC2626";
    case "catch_all":
      return "#D97706";
    default:
      return "#6B7280";
  }
};

function ProviderCard({
  label,
  result,
  agreement,
  onPick,
  onVerify,
  verifyingEmail,
  verifyByEmail,
}: {
  label: string;
  result: ProviderEnrichmentResult;
  agreement: string[];
  onPick: (email: string) => void;
  onVerify: (email: string) => void;
  verifyingEmail: string | null;
  verifyByEmail: Record<string, EmailVerifyResult>;
}) {
  const agreeSet = new Set(agreement.map((e) => e.toLowerCase()));
  return (
    <div
      className="rounded-lg border p-3 space-y-2 min-w-0"
      style={{ borderColor: "#E5E0DA", backgroundColor: "#FAFAF8" }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold" style={{ color: INK }}>
          {label}
        </span>
        {!result.configured ? (
          <span className="text-[10px] font-medium text-amber-700">Clé API manquante</span>
        ) : result.ok && result.found ? (
          <span className="text-[10px] font-medium" style={{ color: GREEN }}>
            Match
            {result.confidence ? ` · ${result.confidence}` : ""}
          </span>
        ) : result.ok ? (
          <span className="text-[10px] font-medium text-gray-400">Non trouvé</span>
        ) : (
          <span className="text-[10px] font-medium text-red-600">Erreur</span>
        )}
      </div>
      {result.error ? (
        <p className="text-[11px] text-red-600/90 leading-snug">{result.error}</p>
      ) : null}
      {(result.fullName || result.title || result.company) && (
        <p className="text-[11px] text-gray-500 leading-snug">
          {[result.fullName, result.title, result.company].filter(Boolean).join(" · ")}
        </p>
      )}
      {result.emails.length > 0 ? (
        <div className="space-y-1.5">
          {result.emails.map((e) => {
            const shared = agreeSet.has(e.email.toLowerCase());
            const verified = verifyByEmail[e.email.toLowerCase()];
            const isVerifying = verifyingEmail === e.email.toLowerCase();
            return (
              <div key={e.email} className="space-y-1">
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onPick(e.email)}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md border transition"
                    style={{
                      color: INK,
                      backgroundColor: shared ? "#EEF7EE" : "#fff",
                      borderColor: shared ? GREEN : "#E5E0DA",
                    }}
                    title={shared ? "Commun aux deux providers" : "Préremplir cet email"}
                  >
                    {shared ? <Check className="w-3 h-3" style={{ color: GREEN }} /> : null}
                    {e.email}
                    <span className="text-[9px] text-gray-400 uppercase">{e.type}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => onVerify(e.email)}
                    disabled={isVerifying}
                    className="inline-flex items-center gap-1 text-[10px] px-2 py-1 rounded-md border font-semibold disabled:opacity-40"
                    style={{ color: INK, borderColor: "#E5E0DA", backgroundColor: "#fff" }}
                    title="Tester cet email (MX + SMTP)"
                  >
                    {isVerifying ? (
                      <Loader2 className="w-3 h-3 animate-spin" />
                    ) : (
                      <ShieldCheck className="w-3 h-3" />
                    )}
                    Tester
                  </button>
                </div>
                {verified ? (
                  <p
                    className="text-[10px] leading-snug pl-0.5"
                    style={{ color: verifyStatusColor(verified.status) }}
                    title={verified.detail || undefined}
                  >
                    {verified.label}
                    {verified.detail ? ` — ${verified.detail}` : ""}
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      ) : (
        <p className="text-[11px] text-gray-400">Aucun email révélé</p>
      )}
      {result.phones.length > 0 ? (
        <p className="text-[10px] text-gray-400">
          Tél. : {result.phones.map((ph) => ph.number).join(" · ")}
        </p>
      ) : null}
    </div>
  );
}

/** Une marque / agence = fusion des fiches FR et BE portant le même nom. */
type BrandGroup = {
  key: string;
  company: string;
  markets: Market[];
  people: Person[];
};

export default function EnrichissementPage() {
  const { data: session, status } = useSession();
  const role = session?.user?.role || "";
  const allowed = ALLOWED.includes(role);
  const isAdmin = role === "ADMIN";

  const [tab, setTab] = useState<Tab>("marques");
  const [marqueMarketTab, setMarqueMarketTab] = useState<MarqueMarketTab>("FR");
  const [awaitingItems, setAwaitingItems] = useState<AwaitingMarqueItem[]>([]);
  const [awaitingLoading, setAwaitingLoading] = useState(false);
  const [resolvingMissionId, setResolvingMissionId] = useState<string | null>(null);
  const [contacts, setContacts] = useState<LookupContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  /** Brouillons email par contactId — saisis sur la fiche. */
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  /** Contacts marqués « pas d'email trouvé » (sortent de la file sans email). */
  const [notFound, setNotFound] = useState<Record<string, boolean>>({});
  const [showCartoModal, setShowCartoModal] = useState(false);
  const [showFwCartoModal, setShowFwCartoModal] = useState(false);
  const [showAgencyImport, setShowAgencyImport] = useState(false);
  const [agencyPartners, setAgencyPartners] = useState<Array<{ id: string; name: string }>>([]);
  const [fwClients, setFwClients] = useState<Array<{ id: string; nom: string; language?: string | null }>>([]);
  const [agencyMarket, setAgencyMarket] = useState<"FR" | "BENELUX">("FR");
  const [dragOver, setDragOver] = useState(false);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  /** Clé de la personne en cours de suppression (spinner sur le bouton). */
  const [deletingKey, setDeletingKey] = useState<string | null>(null);
  /** Clé de la fiche (marque/agence) en cours de suppression complète. */
  const [deletingGroupKey, setDeletingGroupKey] = useState<string | null>(null);
  /** Clé personne dont la langue est en cours de sauvegarde. */
  const [savingLangKey, setSavingLangKey] = useState<string | null>(null);
  /** Clé personne dont le marché est en cours de sauvegarde. */
  const [savingMarketKey, setSavingMarketKey] = useState<string | null>(null);
  /** Maison FW dont la langue est en cours de sauvegarde. */
  const [savingFwLang, setSavingFwLang] = useState(false);
  /** Clé personne en cours d'enregistrement email (bouton Enregistrer). */
  const [savingPersonKey, setSavingPersonKey] = useState<string | null>(null);
  /** Clé personne en cours d'enrichissement Apollo+Lusha. */
  const [enrichingKey, setEnrichingKey] = useState<string | null>(null);
  /** Batch « Enrichir tous » en cours sur la fiche active. */
  const [enrichingAll, setEnrichingAll] = useState(false);
  /** Progression batch : index 1-based / total. */
  const [enrichAllProgress, setEnrichAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);
  /** Résultats de comparaison providers par personne. */
  const [enrichResults, setEnrichResults] = useState<
    Record<string, EnrichCompareResponse>
  >({});
  /** Email en cours de test (normalisé). */
  const [verifyingEmail, setVerifyingEmail] = useState<string | null>(null);
  /** Résultats de test par email. */
  const [verifyByEmail, setVerifyByEmail] = useState<
    Record<string, EmailVerifyResult>
  >({});

  const load = useCallback(async (opts?: { silent?: boolean }) => {
    if (!opts?.silent) setLoading(true);
    try {
      const res = await fetch("/api/outreach/email-lookup");
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur de chargement");
      setContacts((data.contacts || []) as LookupContact[]);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      if (!opts?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated" && allowed) load();
  }, [status, allowed, load]);

  // CASTING_MANAGER n'a pas les onglets Agences / Fashion Week.
  useEffect(() => {
    if (!isAdmin && (tab === "agences" || tab === "fw")) setTab("marques");
  }, [isAdmin, tab]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const t = new URLSearchParams(window.location.search).get("tab");
    if (t === "attente" || t === "marques" || t === "agences" || t === "fw") {
      if ((t === "agences" || t === "fw") && !isAdmin) return;
      setTab(t);
    }
  }, [isAdmin]);

  const loadAwaiting = useCallback(async () => {
    if (!allowed) return;
    setAwaitingLoading(true);
    try {
      const res = await fetch("/api/enrichissement/awaiting-marques", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Impossible de charger la file.");
      setAwaitingItems(Array.isArray(data.items) ? data.items : []);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur de chargement");
      setAwaitingItems([]);
    } finally {
      setAwaitingLoading(false);
    }
  }, [allowed]);

  useEffect(() => {
    if (!allowed) return;
    void loadAwaiting();
  }, [allowed, loadAwaiting]);

  useEffect(() => {
    if (!allowed) return;
    if (tab === "attente") void loadAwaiting();
  }, [allowed, tab, loadAwaiting]);

  const resolveAwaiting = async (item: AwaitingMarqueItem) => {
    if (resolvingMissionId) return;
    const missionIds = item.contexts.map((c) => c.missionId);
    if (missionIds.length === 0) return;
    setResolvingMissionId(item.key);
    try {
      if (item.marqueId) {
        const res = await fetch(
          `/api/enrichissement/awaiting-marques/resolve`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ marqueId: item.marqueId, force: true }),
          }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible de valider.");
        setFlash(
          data.message ||
            `${item.brandName} débloquée — ${item.sourceLabel || "pipeline / projet"}.`
        );
      } else {
        for (const id of missionIds) {
          const res = await fetch(
            `/api/strategy/contact-missions/${id}/resolve-enrichissement`,
            { method: "POST", credentials: "include" }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Impossible de valider.");
        }
        setFlash(`${item.brandName} retirée de la file.`);
      }
      await loadAwaiting();
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setResolvingMissionId(null);
    }
  };

  // Liste des agences pour le modal d'import (onglet Agences, ADMIN).
  useEffect(() => {
    if (!isAdmin || tab !== "agences") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/agency-outreach/partners");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setAgencyPartners(
            ((data.partners || []) as Array<{ id: string; name: string }>).map((p) => ({
              id: p.id,
              name: p.name,
            }))
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, tab]);

  useEffect(() => {
    if (!isAdmin || tab !== "fw") return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/strategy/fw/clients");
        const data = await res.json().catch(() => ({}));
        if (!cancelled && res.ok) {
          setFwClients(
            ((data.clients || []) as Array<{ id: string; nom: string; language?: string | null }>).map(
              (c) => ({
                id: c.id,
                nom: c.nom,
                language: c.language,
              })
            )
          );
        }
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isAdmin, tab]);

  const tabContacts = useMemo(
    () =>
      contacts.filter((c) =>
        tab === "agences"
          ? c.market === "AGENCY"
          : tab === "fw"
            ? c.market === "FW"
            : c.market !== "AGENCY" && c.market !== "FW"
      ),
    [contacts, tab]
  );

  const brands: BrandGroup[] = useMemo(() => {
    type Acc = {
      company: string;
      markets: Set<Market>;
      people: Map<string, Person>;
    };
    const map = new Map<string, Acc>();
    for (const c of tabContacts) {
      const brandKey = norm(c.company);
      let b = map.get(brandKey);
      if (!b) {
        b = { company: c.company, markets: new Set(), people: new Map() };
        map.set(brandKey, b);
      }
      const market = c.market || "FR";
      b.markets.add(market);
      const personId = `${norm(c.prenom || "")}|${norm(c.nom)}|${c.source || ""}`;
      let p = b.people.get(personId);
      if (!p) {
        p = {
          key: `${brandKey}::${personId}`,
          prenom: c.prenom,
          nom: c.nom,
          poste: c.poste,
          perimetre: c.perimetre,
          localisation: c.localisation,
          priorite: c.priorite,
          linkedinUrl: c.linkedinUrl,
          language: toLang(c.language),
          source: c.source,
          refs: [],
        };
        b.people.set(personId, p);
      }
      if (!p.linkedinUrl && c.linkedinUrl) p.linkedinUrl = c.linkedinUrl;
      if (!p.poste && c.poste) p.poste = c.poste;
      // Si un des marchés est EN, on affiche EN (sinon FR).
      if (toLang(c.language) === "en") p.language = "en";
      p.refs.push({ id: c.id, market, marqueId: c.marqueId });
    }
    return Array.from(map.entries()).map(([key, b]) => ({
      key,
      company: b.company,
      markets: Array.from(b.markets),
      people: Array.from(b.people.values()),
    }));
  }, [tabContacts]);

  const agencyCount = useMemo(
    () => contacts.filter((c) => c.market === "AGENCY").length,
    [contacts]
  );
  const fwCount = useMemo(
    () => contacts.filter((c) => c.market === "FW").length,
    [contacts]
  );
  const marquesCount = useMemo(
    () => contacts.filter((c) => c.market !== "AGENCY" && c.market !== "FW").length,
    [contacts]
  );

  const marqueMarketCounts = useMemo(() => {
    const counts: Record<MarqueMarketTab, number> = {
      FR: 0,
      BENELUX: 0,
      BOTH: 0,
    };
    for (const b of brands) {
      counts[brandMarketBucket(b.markets)] += 1;
    }
    return counts;
  }, [brands]);

  const filteredBrands = useMemo(() => {
    if (tab !== "marques") return brands;
    return brands.filter((b) => brandMarketBucket(b.markets) === marqueMarketTab);
  }, [brands, tab, marqueMarketTab]);

  const active = brands.find((b) => b.key === activeKey) || null;
  const isAgencyTab = tab === "agences";
  const isFwTab = tab === "fw";
  const isAttenteTab = tab === "attente";
  const isMarquesTab = tab === "marques";

  useEffect(() => {
    if (activeKey && !active) setActiveKey(null);
  }, [active, activeKey]);

  /** Motif déduit UNIQUEMENT des mails déjà saisis sur cette fiche. */
  const livePattern = useMemo(() => {
    if (!active) return null;
    const known = active.people
      .map((p) => {
        const email = (drafts[p.key] || "").trim().toLowerCase();
        if (!isValidEmail(email)) return null;
        return { email, prenom: p.prenom, nom: p.nom };
      })
      .filter((x): x is { email: string; prenom: string | null; nom: string } => Boolean(x));
    if (known.length === 0) return null;
    return detectEmailPattern(known);
  }, [active, drafts]);

  const suggestionFor = (p: Person): EmailSuggestion[] => {
    if (!livePattern) return [];
    if (notFound[p.key]) return [];
    if (isValidEmail(drafts[p.key] || "")) return [];
    return suggestEmailsForContact({
      prenom: p.prenom,
      nom: p.nom,
      pattern: livePattern,
    });
  };

  const remainingSuggestionCount = useMemo(() => {
    if (!active || !livePattern) return 0;
    let count = 0;
    for (const p of active.people) {
      if (notFound[p.key]) continue;
      if (isValidEmail(drafts[p.key] || "")) continue;
      const suggestions = suggestEmailsForContact({
        prenom: p.prenom,
        nom: p.nom,
        pattern: livePattern,
      });
      if (suggestions.length > 0) count += 1;
    }
    return count;
  }, [active, livePattern, drafts, notFound]);

  const applyAgencySuggestionsToAll = () => {
    if (!active || !livePattern) return;
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = 0;
      for (const p of active.people) {
        if (notFound[p.key]) continue;
        if (isValidEmail(next[p.key] || "")) continue;
        const suggestions = suggestEmailsForContact({
          prenom: p.prenom,
          nom: p.nom,
          pattern: livePattern,
        });
        if (suggestions.length > 0) {
          next[p.key] = suggestions[0].email;
          changed += 1;
        }
      }
      if (changed > 0) {
        setFlash(
          `${changed} suggestion${changed > 1 ? "s" : ""} appliquée${
            changed > 1 ? "s" : ""
          }.`
        );
      }
      return next;
    });
  };

  const emailCount = active
    ? active.people.filter((p) => isValidEmail(drafts[p.key] || "")).length
    : 0;
  const resolvedCount = active
    ? active.people.filter(
        (p) => isValidEmail(drafts[p.key] || "") || Boolean(notFound[p.key])
      ).length
    : 0;
  const allReady = Boolean(
    active && resolvedCount === active.people.length && active.people.length > 0
  );

  const openBrand = (b: BrandGroup) => {
    setFlash(null);
    setActiveKey(b.key);
    const next: Record<string, string> = {};
    const nextNf: Record<string, boolean> = {};
    for (const p of b.people) {
      next[p.key] = "";
      nextNf[p.key] = false;
    }
    setDrafts(next);
    setNotFound(nextNf);
  };

  const switchTab = (next: Tab) => {
    setTab(next);
    setActiveKey(null);
    setDrafts({});
    setNotFound({});
    setFlash(null);
  };

  const handleImported = async (result: {
    company: string;
    markets: Array<{ market: "FR" | "BENELUX"; id: string; company: string }>;
    skipOutreach?: boolean;
  }) => {
    setShowCartoModal(false);
    setDroppedFile(null);
    if (result.skipOutreach) {
      setFlash(`${result.company} — importé dans le CRM (hors Outreach)`);
      await load({ silent: true });
      return;
    }
    try {
      let totalQueued = 0;
      for (const m of result.markets) {
        const res = await fetch(`/api/marques/${m.id}/queue-enrichissement`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ market: m.market }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible de mettre en file");
        totalQueued += data.queued || 0;
      }
      setFlash(
        totalQueued > 0
          ? `${result.company} — ${totalQueued} email${totalQueued > 1 ? "s" : ""} à trouver`
          : `${result.company} — aucun email manquant`
      );
      await load({ silent: true });
      if (totalQueued > 0 && result.company) {
        setActiveKey(norm(result.company));
        setDrafts({});
        setNotFound({});
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
      await load({ silent: true });
    }
  };

  useEffect(() => {
    if (!active) return;
    setDrafts((prev) => {
      const next = { ...prev };
      let changed = false;
      for (const p of active.people) {
        if (next[p.key] === undefined) {
          next[p.key] = "";
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [active?.key, active?.people]);

  const deletePerson = async (p: Person) => {
    if (busy || deletingKey || savingPersonKey) return;
    const name = [p.prenom, p.nom].filter(Boolean).join(" ") || "ce contact";
    if (
      !window.confirm(
        `Supprimer ${name} de l'enrichissement ?\nLe contact sera retiré définitivement.`
      )
    ) {
      return;
    }
    setDeletingKey(p.key);
    setFlash(null);
    try {
      for (const ref of p.refs) {
        const res = await fetch(
          `/api/outreach/email-lookup/${ref.id}?market=${ref.market}`,
          { method: "DELETE" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec de la suppression");
      }
      setContacts((prev) =>
        prev.filter((c) => !p.refs.some((ref) => ref.id === c.id))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setNotFound((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setEnrichResults((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setFlash(`${name} supprimé.`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeletingKey(null);
    }
  };

  /**
   * Enregistre un contact tout de suite (email ou « pas d'email ») sans
   * attendre le Prêt global — utile si on quitte la fiche en cours de route.
   */
  const savePerson = async (p: Person) => {
    if (busy || savingPersonKey || deletingKey || enrichingKey || enrichingAll) return;
    const isNf = Boolean(notFound[p.key]);
    const email = (drafts[p.key] || "").trim().toLowerCase();
    if (!isNf && !isValidEmail(email)) return;

    const name = [p.prenom, p.nom].filter(Boolean).join(" ") || "Contact";
    setSavingPersonKey(p.key);
    setFlash(null);
    try {
      type ReadyRow = {
        id: string;
        email?: string;
        notFound?: boolean;
        bothMarkets?: boolean;
      };

      const bothMarkets =
        !isNf &&
        p.refs.some((r) => r.market === "FR") &&
        p.refs.some((r) => r.market === "BENELUX");

      const groups = new Map<
        string,
        { market: Market; marqueId: string; contacts: ReadyRow[] }
      >();
      for (const ref of p.refs) {
        const k = `${ref.market}:${ref.marqueId}`;
        let g = groups.get(k);
        if (!g) {
          g = { market: ref.market, marqueId: ref.marqueId, contacts: [] };
          groups.set(k, g);
        }
        g.contacts.push(
          isNf
            ? { id: ref.id, notFound: true }
            : {
                id: ref.id,
                email,
                ...(bothMarkets &&
                (ref.market === "FR" || ref.market === "BENELUX")
                  ? { bothMarkets: true }
                  : {}),
              }
        );
      }

      let totalSaved = 0;
      let totalEnrolled = 0;
      let totalNotFound = 0;
      const awaitingNotes: string[] = [];
      for (const g of groups.values()) {
        const res = await fetch("/api/outreach/email-lookup/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market: g.market,
            marqueId: g.marqueId,
            contacts: g.contacts,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec de l'enregistrement");
        totalSaved += data.saved || 0;
        totalEnrolled += data.enrolled || 0;
        totalNotFound += data.notFound || 0;
        const msg = String(data.message || "");
        if (msg.includes("demande") || msg.includes("débloquée")) {
          awaitingNotes.push(msg);
        }
      }

      setContacts((prev) =>
        prev.filter((c) => !p.refs.some((ref) => ref.id === c.id))
      );
      setDrafts((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setNotFound((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });
      setEnrichResults((prev) => {
        const next = { ...prev };
        delete next[p.key];
        return next;
      });

      const unlockSuffix =
        awaitingNotes.length > 0 ? ` · ${awaitingNotes[awaitingNotes.length - 1]}` : "";

      if (totalEnrolled > 0) {
        setFlash(
          bothMarkets
            ? `${name} enregistré — envoyé en Outreach FR et BENELUX.${unlockSuffix}`
            : `${name} enregistré — ${totalEnrolled} contact(s) envoyés en outreach.${unlockSuffix}`
        );
      } else if (isNf || totalNotFound > 0) {
        setFlash(`${name} marqué sans email.${unlockSuffix}`);
      } else {
        setFlash(
          `${name} enregistré${totalSaved > 0 ? ` (${email})` : ""}.${unlockSuffix}`
        );
      }
      if (unlockSuffix) {
        void loadAwaiting();
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingPersonKey(null);
    }
  };

  /**
   * Choisit un email à préremplir : accord Apollo∩Lusha, sinon email unique.
   */
  const pickBestEnrichEmail = (result: EnrichCompareResponse): string | null => {
    if (result.agreement.length > 0) return result.agreement[0];
    if (result.allEmails.length === 1) return result.allEmails[0].email;
    const apolloOnly = result.apollo.emails;
    const lushaOnly = result.lusha.emails;
    if (apolloOnly.length === 1 && lushaOnly.length === 0) return apolloOnly[0].email;
    if (lushaOnly.length === 1 && apolloOnly.length === 0) return lushaOnly[0].email;
    return null;
  };

  const verifyEmail = async (raw: string) => {
    const email = raw.trim().toLowerCase();
    if (!isValidEmail(email) || verifyingEmail) return;
    setVerifyingEmail(email);
    setFlash(null);
    try {
      const res = await fetch("/api/outreach/email-lookup/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec du test");
      const result = data as EmailVerifyResult;
      setVerifyByEmail((prev) => ({ ...prev, [email]: result }));
      setFlash(`${email} → ${result.label}`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur test email");
    } finally {
      setVerifyingEmail(null);
    }
  };

  const fetchEnrichResult = async (
    p: Person,
    company: string
  ): Promise<EnrichCompareResponse> => {
    const res = await fetch("/api/outreach/email-lookup/enrich", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        prenom: p.prenom,
        nom: p.nom,
        linkedinUrl: p.linkedinUrl,
        company,
        refs: p.refs.map((r) => ({ id: r.id, market: r.market })),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Échec de l'enrichissement");
    return data as EnrichCompareResponse;
  };

  /** Apollo + Lusha en parallèle — comparaison sans écrire l'email automatiquement. */
  const enrichPerson = async (p: Person, company: string) => {
    if (busy || enrichingKey || enrichingAll || savingPersonKey || deletingKey) return;
    setEnrichingKey(p.key);
    setFlash(null);
    try {
      const result = await fetchEnrichResult(p, company);
      setEnrichResults((prev) => ({ ...prev, [p.key]: result }));

      const best = pickBestEnrichEmail(result);
      if (best) {
        setNotFound((prev) => ({ ...prev, [p.key]: false }));
        setDrafts((prev) => ({ ...prev, [p.key]: best }));
      }

      const apolloN = result.apollo.emails.length;
      const lushaN = result.lusha.emails.length;
      if (result.agreement.length > 0) {
        setFlash(
          `${result.agreement.length} email(s) en commun Apollo + Lusha — prérempli.`
        );
      } else if (best) {
        setFlash(`Email prérempli (${best}) — vérifie puis Enregistrer.`);
      } else if (apolloN + lushaN > 0) {
        setFlash(
          `Enrichi : Apollo ${apolloN} · Lusha ${lushaN} — compare et choisis.`
        );
      } else {
        const missing = [
          !result.apollo.configured && "Apollo (clé)",
          !result.lusha.configured && "Lusha (clé)",
          result.apollo.configured && result.apollo.error,
          result.lusha.configured && result.lusha.error,
        ].filter(Boolean);
        setFlash(
          missing.length
            ? `Aucun email trouvé. ${missing.join(" · ")}`
            : "Aucun email trouvé chez Apollo ni Lusha."
        );
      }
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur enrichissement");
    } finally {
      setEnrichingKey(null);
    }
  };

  /** Enrichit tous les contacts de la fiche (séquentiel, pour crédits / rate-limit). */
  const enrichAllPeople = async () => {
    if (!active || busy || enrichingAll || enrichingKey || savingPersonKey || deletingKey) {
      return;
    }
    const people = active.people;
    if (people.length === 0) return;

    setEnrichingAll(true);
    setEnrichAllProgress({ done: 0, total: people.length });
    setFlash(null);

    let filled = 0;
    let found = 0;
    let errors = 0;

    try {
      for (let i = 0; i < people.length; i++) {
        const p = people[i];
        setEnrichingKey(p.key);
        setEnrichAllProgress({ done: i, total: people.length });
        try {
          const result = await fetchEnrichResult(p, active.company);
          setEnrichResults((prev) => ({ ...prev, [p.key]: result }));
          const emailCount =
            result.apollo.emails.length + result.lusha.emails.length;
          if (emailCount > 0) found += 1;
          const best = pickBestEnrichEmail(result);
          if (best) {
            filled += 1;
            setNotFound((prev) => ({ ...prev, [p.key]: false }));
            setDrafts((prev) => ({ ...prev, [p.key]: best }));
          }
        } catch {
          errors += 1;
        }
        setEnrichAllProgress({ done: i + 1, total: people.length });
      }

      const parts = [
        `${people.length} contact${people.length > 1 ? "s" : ""}`,
        found > 0 ? `${found} avec email` : "aucun email",
        filled > 0 ? `${filled} prérempli${filled > 1 ? "s" : ""}` : null,
        errors > 0 ? `${errors} erreur${errors > 1 ? "s" : ""}` : null,
      ].filter(Boolean);
      setFlash(`Enrichissement terminé — ${parts.join(" · ")}.`);
    } finally {
      setEnrichingKey(null);
      setEnrichingAll(false);
      setEnrichAllProgress(null);
    }
  };

  const updatePersonLanguage = async (p: Person, language: ContactLang) => {
    if (p.language === language || savingLangKey || busy) return;
    // FW : langue = maison, pas le contact.
    if (p.refs.every((r) => r.market === "FW")) return;
    setSavingLangKey(p.key);
    setFlash(null);
    try {
      for (const ref of p.refs) {
        if (ref.market === "FW") continue;
        const res = await fetch(`/api/outreach/email-lookup/${ref.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ market: ref.market, language }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");
      }
      const ids = new Set(p.refs.map((r) => r.id));
      setContacts((prev) =>
        prev.map((c) => (ids.has(c.id) ? { ...c, language } : c))
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingLangKey(null);
    }
  };

  const updatePersonMarkets = async (p: Person, next: PersonMarket) => {
    if (isAgencyTab || isFwTab || savingMarketKey || busy) return;
    const current = personMarketSelection(p);
    if (current === next) return;
    const brandRefs = p.refs.filter(
      (r): r is PersonRef & { market: BrandMarket } =>
        r.market === "FR" || r.market === "BENELUX"
    );
    if (brandRefs.length === 0) return;

    setSavingMarketKey(p.key);
    setFlash(null);
    try {
      const res = await fetch("/api/outreach/email-lookup/set-markets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          refs: brandRefs.map((r) => ({ id: r.id, market: r.market })),
          markets: marketsFromSelection(next),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");

      // Recharge la file pour refléter les refs FR/BE (création / suppression).
      await load({ silent: true });
      setMarqueMarketTab(next);
      const label = next === "BOTH" ? "FR + BE" : next === "BENELUX" ? "BE" : "FR";
      setFlash(
        data.message ||
          `${[p.prenom, p.nom].filter(Boolean).join(" ")} → ${label}`
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingMarketKey(null);
    }
  };

  const updateFwClientLanguage = async (clientId: string, language: ContactLang) => {
    if (savingFwLang || busy) return;
    const fromClients = fwClients.find((c) => c.id === clientId)?.language;
    const fromContacts = contacts.find(
      (c) => c.market === "FW" && c.marqueId === clientId
    )?.language;
    if (toLang(fromClients ?? fromContacts) === language) return;
    setSavingFwLang(true);
    setFlash(null);
    try {
      const res = await fetch(`/api/strategy/fw/clients/${clientId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ language }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Échec de la mise à jour");
      setFwClients((prev) =>
        prev.map((c) => (c.id === clientId ? { ...c, language } : c))
      );
      setContacts((prev) =>
        prev.map((c) =>
          c.market === "FW" && c.marqueId === clientId ? { ...c, language } : c
        )
      );
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSavingFwLang(false);
    }
  };

  const deleteGroup = async (b: BrandGroup) => {
    if (busy || deletingKey || deletingGroupKey) return;
    const label = b.company || "cette fiche";
    if (
      !window.confirm(
        `Supprimer tous les contacts de ${label} de l'enrichissement ?\nCette action est définitive.`
      )
    ) {
      return;
    }
    setDeletingGroupKey(b.key);
    setFlash(null);
    try {
      for (const p of b.people) {
        for (const ref of p.refs) {
          const res = await fetch(
            `/api/outreach/email-lookup/${ref.id}?market=${ref.market}`,
            { method: "DELETE" }
          );
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Échec de la suppression");
        }
      }
      const idsToDelete = new Set(
        b.people.flatMap((p) => p.refs.map((ref) => ref.id))
      );
      setContacts((prev) => prev.filter((c) => !idsToDelete.has(c.id)));
      setFlash(`${label} supprimé${isAgencyTab ? "e" : "e"} de l'enrichissement.`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeletingGroupKey(null);
    }
  };

  const markReady = async () => {
    if (!active || !allReady || busy) return;
    setBusy(true);
    setFlash(null);
    try {
      type ReadyRow = {
        id: string;
        email?: string;
        notFound?: boolean;
        bothMarkets?: boolean;
      };

      if (isFwTab) {
        const byClient = new Map<string, ReadyRow[]>();
        for (const p of active.people) {
          const isNf = Boolean(notFound[p.key]);
          const email = (drafts[p.key] || "").trim().toLowerCase();
          for (const ref of p.refs) {
            const list = byClient.get(ref.marqueId) || [];
            list.push(isNf ? { id: ref.id, notFound: true } : { id: ref.id, email });
            byClient.set(ref.marqueId, list);
          }
        }

        let totalSaved = 0;
        let totalEnrolled = 0;
        let totalNotFound = 0;
        for (const [clientId, contactsPayload] of byClient) {
          const res = await fetch("/api/outreach/email-lookup/ready", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              market: "FW",
              marqueId: clientId,
              contacts: contactsPayload,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Échec");
          totalSaved += data.saved || 0;
          totalEnrolled += data.enrolled || 0;
          totalNotFound += data.notFound || 0;
        }

        setFlash(
          totalEnrolled > 0
            ? `${active.company} — ${totalEnrolled} mail(s) notés, maison prête dans Fashion Week`
            : totalSaved > 0
              ? `${totalSaved} email(s) enregistrés.`
              : totalNotFound > 0
                ? `${totalNotFound} contact(s) marqués sans email.`
                : "Fiche validée."
        );
        setActiveKey(null);
        setDrafts({});
        setNotFound({});
        await load({ silent: true });
        return;
      }

      if (isAgencyTab) {
        const byPartner = new Map<string, ReadyRow[]>();
        for (const p of active.people) {
          const isNf = Boolean(notFound[p.key]);
          const email = (drafts[p.key] || "").trim().toLowerCase();
          for (const ref of p.refs) {
            const list = byPartner.get(ref.marqueId) || [];
            list.push(
              isNf
                ? { id: ref.id, notFound: true }
                : { id: ref.id, email }
            );
            byPartner.set(ref.marqueId, list);
          }
        }

        let totalSaved = 0;
        let totalEnrolled = 0;
        let totalNotFound = 0;
        for (const [partnerId, contactsPayload] of byPartner) {
          const res = await fetch("/api/outreach/email-lookup/ready", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              market: "AGENCY",
              marqueId: partnerId,
              contacts: contactsPayload,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok) throw new Error(data.error || "Échec");
          totalSaved += data.saved || 0;
          totalEnrolled += data.enrolled || 0;
          totalNotFound += data.notFound || 0;
        }

        setFlash(
          totalEnrolled > 0
            ? `${active.company} — ${totalEnrolled} contact(s) envoyés dans Prospection Agences 🎉`
            : totalSaved > 0
              ? `${totalSaved} email(s) enregistrés.`
              : totalNotFound > 0
                ? `${totalNotFound} contact(s) marqués sans email.`
                : "Fiche validée."
        );
        setActiveKey(null);
        setDrafts({});
        setNotFound({});
        await load({ silent: true });
        return;
      }

      const marketsByEmail = new Map<string, Set<"FR" | "BENELUX">>();
      for (const p of active.people) {
        if (notFound[p.key]) continue;
        const email = (drafts[p.key] || "").trim().toLowerCase();
        if (!email) continue;
        const set = marketsByEmail.get(email) ?? new Set<"FR" | "BENELUX">();
        for (const ref of p.refs) {
          if (ref.market === "FR" || ref.market === "BENELUX") set.add(ref.market);
        }
        marketsByEmail.set(email, set);
      }
      const isCrossMarket = (email: string): boolean => {
        const s = marketsByEmail.get(email);
        return Boolean(s && s.has("FR") && s.has("BENELUX"));
      };

      type Group = {
        market: "FR" | "BENELUX";
        marqueId: string;
        contacts: ReadyRow[];
      };
      const groups = new Map<string, Group>();
      for (const p of active.people) {
        const isNf = Boolean(notFound[p.key]);
        const email = (drafts[p.key] || "").trim().toLowerCase();
        const bothMarkets = !isNf && isCrossMarket(email);
        for (const ref of p.refs) {
          if (ref.market !== "FR" && ref.market !== "BENELUX") continue;
          const k = `${ref.market}:${ref.marqueId}`;
          let g = groups.get(k);
          if (!g) {
            g = { market: ref.market, marqueId: ref.marqueId, contacts: [] };
            groups.set(k, g);
          }
          g.contacts.push(
            isNf
              ? { id: ref.id, notFound: true }
              : { id: ref.id, email, bothMarkets }
          );
        }
      }

      let totalSaved = 0;
      let totalEnrolled = 0;
      let totalNotFound = 0;
      let touchedFr = false;
      let touchedBe = false;
      for (const g of groups.values()) {
        if (g.market === "FR") touchedFr = true;
        if (g.market === "BENELUX") touchedBe = true;
        const res = await fetch("/api/outreach/email-lookup/ready", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market: g.market,
            marqueId: g.marqueId,
            contacts: g.contacts,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Échec");
        totalSaved += data.saved || 0;
        totalEnrolled += data.enrolled || 0;
        totalNotFound += data.notFound || 0;
      }

      const destNote =
        touchedFr && touchedBe
          ? " FR + BE"
          : touchedBe
            ? " BENELUX"
            : "";

      setFlash(
        totalEnrolled > 0
          ? `${active.company} — ${totalEnrolled} contact(s) envoyés dans « À contacter »${destNote} 🎉`
          : totalSaved > 0
            ? `${totalSaved} email(s) enregistrés.`
            : totalNotFound > 0
              ? `${totalNotFound} contact(s) marqués sans email.`
              : "Fiche validée."
      );
      setActiveKey(null);
      setDrafts({});
      setNotFound({});
      await load({ silent: true });
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setBusy(false);
    }
  };

  if (
    status === "loading" ||
    (status === "authenticated" && allowed && loading && contacts.length === 0 && !flash)
  ) {
    return (
      <div className="flex items-center justify-center min-h-[50vh]">
        <Loader2 className="w-7 h-7 animate-spin" style={{ color: ROSE }} />
      </div>
    );
  }

  if (!allowed) {
    return <div className="p-10 text-center text-gray-500">Accès réservé.</div>;
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      {!active ? (
        <>
          <h1 className="text-2xl font-bold" style={{ color: INK }}>
            Enrichissement
          </h1>
          <p className="text-sm text-gray-500 mt-1 mb-4">
            {isAttenteTab
              ? "File terrain : marques signalées depuis le Pipeline Casting ou un projet — complète la fiche CRM, puis valide « Contacts prêts »."
              : isAgencyTab
                ? "Ouvre une agence · note les mails (ou « pas d'email ») · Prêt → Prospection Agences"
                : isFwTab
                  ? "Glisse une carto FW · ouvre une maison · note les mails (ou « pas d'email ») · Prêt → Fashion Week"
                  : marqueMarketTab === "BOTH"
                    ? "FR + BE · un mail saisi une fois · Prêt → Outreach Clients FR et BENELUX"
                    : marqueMarketTab === "BENELUX"
                      ? "Unique BE · Prêt → Outreach BENELUX uniquement"
                      : "Unique FR · Prêt → Outreach Clients FR uniquement"}
          </p>

          <div
            className="flex flex-wrap gap-1.5 p-1.5 rounded-2xl mb-5 border border-black/[0.04]"
            style={{ backgroundColor: CREAM }}
          >
            <button
              type="button"
              onClick={() => switchTab("marques")}
              className="flex-1 min-w-[7rem] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition"
              style={
                tab === "marques"
                  ? { backgroundColor: INK, color: "#fff", boxShadow: "0 8px 18px rgba(26,17,16,0.18)" }
                  : { color: "#6B7280" }
              }
            >
              Cartographies
              {marquesCount > 0 ? (
                <span className="ml-1.5 text-xs opacity-70">{marquesCount}</span>
              ) : null}
            </button>
            <button
              type="button"
              onClick={() => switchTab("attente")}
              className="flex-1 min-w-[9rem] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition text-left"
              style={
                tab === "attente"
                  ? {
                      backgroundColor: "#1e3a5f",
                      color: "#fff",
                      boxShadow: "0 8px 18px rgba(30,58,95,0.22)",
                    }
                  : { color: "#1e3a5f" }
              }
            >
              <span className="block leading-tight">Marques en attente</span>
              <span className="block text-[10px] font-medium opacity-70 leading-tight">
                d&apos;enrichissement
              </span>
              {awaitingItems.length > 0 ? (
                <span
                  className="ml-0 mt-1 inline-block rounded-full px-1.5 py-0.5 text-[10px] font-bold"
                  style={{
                    background:
                      tab === "attente" ? "rgba(255,255,255,0.18)" : "#dbeafe",
                  }}
                >
                  {awaitingItems.length}
                </span>
              ) : null}
            </button>
            {isAdmin && (
              <>
                <button
                  type="button"
                  onClick={() => switchTab("agences")}
                  className="flex-1 min-w-[7rem] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition"
                  style={
                    tab === "agences"
                      ? { backgroundColor: INK, color: "#fff", boxShadow: "0 8px 18px rgba(26,17,16,0.18)" }
                      : { color: "#6B7280" }
                  }
                >
                  Agences
                  {agencyCount > 0 ? (
                    <span className="ml-1.5 text-xs opacity-70">{agencyCount}</span>
                  ) : null}
                </button>
                <button
                  type="button"
                  onClick={() => switchTab("fw")}
                  className="flex-1 min-w-[7rem] px-3.5 py-2.5 rounded-xl text-sm font-semibold transition"
                  style={
                    tab === "fw"
                      ? { backgroundColor: INK, color: "#fff", boxShadow: "0 8px 18px rgba(26,17,16,0.18)" }
                      : { color: "#6B7280" }
                  }
                >
                  Fashion Week
                  {fwCount > 0 ? (
                    <span className="ml-1.5 text-xs opacity-70">{fwCount}</span>
                  ) : null}
                </button>
              </>
            )}
          </div>

          {isAttenteTab ? (
            <div className="space-y-4">
              <div className="flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold" style={{ color: INK }}>
                    Marques en attente d&apos;enrichissement
                  </h2>
                  <p className="text-sm text-gray-500 mt-0.5">
                    Pipeline Casting &amp; projets — hors parcours tant que les
                    contacts CRM ne sont pas prêts
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void loadAwaiting()}
                  disabled={awaitingLoading}
                  className="inline-flex items-center gap-1.5 rounded-full border border-gray-200 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 disabled:opacity-50"
                >
                  {awaitingLoading ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : null}
                  Rafraîchir
                </button>
              </div>
              {awaitingLoading && awaitingItems.length === 0 ? (
                <div className="flex items-center gap-2 py-14 text-sm text-gray-500 justify-center">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Chargement…
                </div>
              ) : awaitingItems.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-sky-200 bg-sky-50/50 px-5 py-12 text-center">
                  <Inbox className="mx-auto mb-3 h-7 w-7 text-sky-800/40" />
                  <p className="text-sm font-medium text-sky-950">
                    File vide pour le moment
                  </p>
                  <p className="mt-1 text-xs text-sky-900/60 max-w-sm mx-auto">
                    Les marques arrivent ici via « Enrichir » (pipeline) ou
                    « À compléter » (projet). Dès qu&apos;un email est ajouté sur
                    la fiche, pipeline et/ou projet se débloquent automatiquement.
                  </p>
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {awaitingItems.map((item) => (
                    <li
                      key={item.key}
                      className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                      style={{ borderLeft: "3px solid #0f172a" }}
                    >
                      <div className="flex flex-wrap items-start justify-between gap-3">
                        <div className="min-w-0 space-y-1.5">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="text-base font-semibold" style={{ color: INK }}>
                              {item.brandName}
                            </span>
                            <span
                              className="rounded-md px-2 py-0.5 text-[11px] font-semibold"
                              style={
                                item.both
                                  ? { background: "#0f172a", color: "#fff" }
                                  : item.sources.includes("pipeline")
                                    ? { background: "#f1f5f9", color: "#334155" }
                                    : { background: "#f8fafc", color: "#475569", border: "1px solid #e2e8f0" }
                              }
                            >
                              {item.both
                                ? "Pipeline + Projet"
                                : item.sourceLabel || "Demande enrichissement"}
                            </span>
                          </div>
                          <p className="text-xs text-gray-500">
                            Demandé depuis : {item.sourceLabel}
                            {item.emailableCount >= 2
                              ? ` · ${item.emailableCount} email(s) déjà en fiche (déblocage auto possible)`
                              : item.emailableCount === 1
                                ? " · 1 email en fiche (il en faut 2 pour débloquer auto)"
                                : " · aucun email en fiche"}
                          </p>
                          <ul className="space-y-0.5">
                            {item.contexts.map((ctx) => (
                              <li key={ctx.missionId} className="text-[11px] text-gray-500">
                                <Link href={ctx.path} className="font-medium text-slate-700 underline-offset-2 hover:underline">
                                  {ctx.label}
                                </Link>
                                {" · "}
                                {ctx.talentName || ctx.creatorName}
                                {ctx.requestedByName ? ` · par ${ctx.requestedByName}` : ""}
                              </li>
                            ))}
                          </ul>
                        </div>
                      </div>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {item.fichePath ? (
                          <Link
                            href={item.fichePath}
                            className="inline-flex items-center rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs font-semibold text-gray-800"
                          >
                            Ouvrir la fiche
                          </Link>
                        ) : null}
                        <button
                          type="button"
                          disabled={resolvingMissionId === item.key}
                          onClick={() => void resolveAwaiting(item)}
                          className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"
                          style={{ backgroundColor: "#0f172a" }}
                          title="Secours si le déblocage auto n'a pas tourné"
                        >
                          {resolvingMissionId === item.key ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Check className="h-3.5 w-3.5" />
                          )}
                          Contacts prêts
                        </button>
                      </div>
                      <p className="mt-2 text-[11px] text-gray-400">
                        Dès qu&apos;un email est ajouté sur la fiche, la demande se débloque
                        toute seule (pipeline et/ou projet).
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : !isAgencyTab && !isFwTab ? (
            <button
              type="button"
              onClick={() => {
                setDroppedFile(null);
                setShowCartoModal(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0] || null;
                setDroppedFile(file);
                setShowCartoModal(true);
              }}
              className="w-full rounded-xl border-2 border-dashed px-6 py-8 text-center transition mb-6"
              style={{
                borderColor: dragOver ? GREEN : "#E5E0DA",
                backgroundColor: dragOver ? "#F2FAF2" : "#FBF8F4",
              }}
            >
              <FileSpreadsheet
                className="w-7 h-7 mx-auto mb-2"
                style={{ color: dragOver ? GREEN : "#9CA3AF" }}
              />
              <div className="text-sm font-semibold" style={{ color: INK }}>
                Glisse une carto Excel ici
              </div>
              <div className="text-xs text-gray-400 mt-1">ou clique pour choisir</div>
            </button>
          ) : isFwTab ? (
            <button
              type="button"
              onClick={() => {
                setDroppedFile(null);
                setShowFwCartoModal(true);
              }}
              onDragEnter={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={(e) => {
                e.preventDefault();
                setDragOver(false);
              }}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                const file = e.dataTransfer.files?.[0] || null;
                setDroppedFile(file);
                setShowFwCartoModal(true);
              }}
              className="w-full rounded-xl border-2 border-dashed px-6 py-8 text-center transition mb-6"
              style={{
                borderColor: dragOver ? GREEN : "#E5E0DA",
                backgroundColor: dragOver ? "#F2FAF2" : "#FBF8F4",
              }}
            >
              <FileSpreadsheet
                className="w-7 h-7 mx-auto mb-2"
                style={{ color: dragOver ? GREEN : "#9CA3AF" }}
              />
              <div className="text-sm font-semibold" style={{ color: INK }}>
                Glisse une carto Fashion Week ici
              </div>
              <div className="text-xs text-gray-400 mt-1">
                Sans email → file ci-dessous · avec email → prêt à envoyer
              </div>
            </button>
          ) : (
            <div className="mb-6 space-y-3">
              <button
                type="button"
                onClick={() => setShowAgencyImport(true)}
                className="w-full rounded-xl border-2 border-dashed px-6 py-8 text-center transition"
                style={{
                  borderColor: "#E5E0DA",
                  backgroundColor: "#FBF8F4",
                }}
              >
                <FileSpreadsheet
                  className="w-7 h-7 mx-auto mb-2"
                  style={{ color: "#9CA3AF" }}
                />
                <div className="text-sm font-semibold" style={{ color: INK }}>
                  Importer des contacts d&apos;agence
                </div>
                <div className="text-xs text-gray-400 mt-1">
                  Excel / CSV — si un contact existe déjà, proposition de rattachement à la
                  fiche
                </div>
              </button>
              <div className="flex items-center gap-2 justify-center">
                <span className="text-xs text-gray-400">Marché import :</span>
                {(["FR", "BENELUX"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setAgencyMarket(m)}
                    className="text-[11px] font-bold px-2 py-0.5 rounded"
                    style={
                      agencyMarket === m
                        ? { backgroundColor: INK, color: "#fff" }
                        : { backgroundColor: CREAM, color: INK }
                    }
                  >
                    {m === "FR" ? "🇫🇷 FR" : "🇧🇪 BE"}
                  </button>
                ))}
              </div>
              <p className="text-xs text-center text-gray-400">
                Sans email → file ci-dessous · avec email →{" "}
                <a href="/agency-outreach" className="underline font-semibold text-gray-500">
                  Prospection Agences
                </a>
              </p>
            </div>
          )}

          {flash && (
            <p
              className="mb-4 text-sm px-3 py-2 rounded-lg"
              style={{ backgroundColor: CREAM, color: INK }}
            >
              {flash}
            </p>
          )}

          {!isAttenteTab && (
          <>
          {isMarquesTab && (
            <div className="flex flex-wrap gap-1.5 p-1 rounded-xl mb-4 bg-white ring-1 ring-black/[0.06]">
              {(
                [
                  {
                    id: "FR" as const,
                    label: "Unique FR",
                    hint: "→ Outreach FR",
                    count: marqueMarketCounts.FR,
                  },
                  {
                    id: "BENELUX" as const,
                    label: "Unique BE",
                    hint: "→ Outreach BE",
                    count: marqueMarketCounts.BENELUX,
                  },
                  {
                    id: "BOTH" as const,
                    label: "FR + BE",
                    hint: "→ les deux",
                    count: marqueMarketCounts.BOTH,
                  },
                ] as const
              ).map((t) => {
                const selected = marqueMarketTab === t.id;
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => setMarqueMarketTab(t.id)}
                    className="flex-1 min-w-[7.5rem] px-3 py-2 rounded-lg text-left transition"
                    style={
                      selected
                        ? {
                            backgroundColor: INK,
                            color: "#fff",
                            boxShadow: "0 6px 14px rgba(26,17,16,0.14)",
                          }
                        : { color: "#6B7280" }
                    }
                  >
                    <span className="block text-sm font-semibold leading-tight">
                      {t.label}
                      {t.count > 0 ? (
                        <span className="ml-1.5 text-xs opacity-70">{t.count}</span>
                      ) : null}
                    </span>
                    <span
                      className="block text-[10px] font-medium leading-tight mt-0.5"
                      style={{ opacity: selected ? 0.75 : 0.85 }}
                    >
                      {t.hint}
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              À traiter
            </h2>
            <span className="text-xs text-gray-400">{filteredBrands.length}</span>
          </div>

          {filteredBrands.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              {isMarquesTab
                ? marqueMarketTab === "BOTH"
                  ? "Aucune marque FR + BE en file."
                  : marqueMarketTab === "BENELUX"
                    ? "Aucune marque unique BE en file."
                    : "Aucune marque unique FR en file."
                : "Rien en file."}
            </p>
          ) : (
            <ul className="space-y-2">
              {filteredBrands.map((b, i) => (
                <li key={b.key}>
                  <div className="w-full flex items-center gap-2 px-4 py-3.5 rounded-xl bg-white ring-1 ring-black/[0.06] hover:ring-black/15 transition">
                    <button
                      type="button"
                      onClick={() => openBrand(b)}
                      className="min-w-0 flex-1 flex items-center gap-3 text-left"
                    >
                    <span
                      className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold shrink-0"
                      style={{ backgroundColor: CREAM, color: INK }}
                    >
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <div
                        className="font-semibold truncate flex items-center gap-2"
                        style={{ color: INK }}
                      >
                        <span className="truncate">{b.company}</span>
                        {!isAgencyTab && b.markets.includes("FR") && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: CREAM, color: INK }}
                          >
                            🇫🇷 FR
                          </span>
                        )}
                        {!isAgencyTab && b.markets.includes("BENELUX") && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: "#EEF2FF", color: INK }}
                          >
                            🇧🇪 BE
                          </span>
                        )}
                        {isFwTab && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: "#FCE7F3", color: INK }}
                          >
                            FW
                          </span>
                        )}
                        {isAgencyTab && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                            style={{ backgroundColor: "#EEF2FF", color: INK }}
                          >
                            Agence
                          </span>
                        )}
                      </div>
                      <div className="text-xs text-gray-500">
                        {b.people.length} contact{b.people.length > 1 ? "s" : ""}
                        {!isAgencyTab &&
                          (() => {
                            const ao = b.people.filter((p) => p.source === "AO").length;
                            return ao > 0 ? ` · dont ${ao} AO` : "";
                          })()}
                        {!isAgencyTab && b.markets.length > 1
                          ? " · FR + BE, mail saisi une fois"
                          : ""}
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-300" />
                    </button>
                    {(isAgencyTab || isFwTab) && (
                      <button
                        type="button"
                        onClick={() => void deleteGroup(b)}
                        disabled={deletingGroupKey === b.key}
                        className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                        title={
                          isFwTab
                            ? "Supprimer tous les contacts de cette maison"
                            : "Supprimer tous les contacts de cette agence"
                        }
                      >
                        {deletingGroupKey === b.key ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
          </>
          )}
        </>
      ) : (
        <>
          <div className="flex items-center justify-between gap-3 mb-4">
            <button
              type="button"
              onClick={() => {
                setFlash(null);
                setActiveKey(null);
                setDrafts({});
                setNotFound({});
                setEnrichResults({});
              }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              {isAgencyTab ? "Agences" : isFwTab ? "Fashion Week" : "Marques"}
            </button>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => void enrichAllPeople()}
                disabled={
                  enrichingAll ||
                  Boolean(enrichingKey) ||
                  busy ||
                  Boolean(savingPersonKey) ||
                  active.people.length === 0
                }
                title="Enrichir tous les contacts via Apollo + Lusha"
                className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition"
                style={{ backgroundColor: INK }}
              >
                {enrichingAll ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Zap className="w-3.5 h-3.5" style={{ color: ROSE }} />
                )}
                {enrichingAll && enrichAllProgress
                  ? `Enrichir… ${enrichAllProgress.done}/${enrichAllProgress.total}`
                  : `Enrichir tous (${active.people.length})`}
              </button>
              <div className="text-xs text-gray-400">
                {resolvedCount} / {active.people.length} traités
                {emailCount < resolvedCount
                  ? ` · ${emailCount} email${emailCount > 1 ? "s" : ""}`
                  : ""}
              </div>
            </div>
          </div>

          <div className="mb-5">
            <h1
              className="text-2xl font-bold flex items-center gap-2 flex-wrap"
              style={{ color: INK }}
            >
              {active.company}
              {!isAgencyTab && active.markets.includes("FR") && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: CREAM, color: INK }}
                >
                  🇫🇷 France
                </span>
              )}
              {!isAgencyTab && active.markets.includes("BENELUX") && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: "#EEF2FF", color: INK }}
                >
                  🇧🇪 BENELUX
                </span>
              )}
              {isAgencyTab && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: "#EEF2FF", color: INK }}
                >
                  Agence
                </span>
              )}
              {isFwTab && (
                <span
                  className="text-[11px] font-bold px-2 py-0.5 rounded"
                  style={{ backgroundColor: "#FCE7F3", color: INK }}
                >
                  Fashion Week
                </span>
              )}
            </h1>
            {!isAgencyTab && active.markets.length > 1 && (
              <p className="text-xs text-gray-500 mt-1">
                Marque sur les deux marchés — saisis le mail une seule fois, il part
                dans les fiches France et Benelux.
              </p>
            )}
            {isFwTab &&
              (() => {
                const clientId = active.people[0]?.refs[0]?.marqueId;
                if (!clientId) return null;
                const fromClients = fwClients.find((c) => c.id === clientId)?.language;
                const fromContacts = active.people[0]
                  ? contacts.find((c) =>
                      active.people[0].refs.some((r) => r.id === c.id)
                    )?.language
                  : null;
                const fwLang = toLang(fromClients ?? fromContacts);
                return (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <Globe className="w-3.5 h-3.5 text-gray-400" />
                    <span className="text-xs text-gray-500">Langue maison :</span>
                    <div className="flex gap-1">
                      {(["fr", "en"] as const).map((lang) => {
                        const selected = fwLang === lang;
                        return (
                          <button
                            key={lang}
                            type="button"
                            disabled={savingFwLang || busy}
                            onClick={() => void updateFwClientLanguage(clientId, lang)}
                            className="px-2.5 py-1 rounded-lg border text-xs font-medium transition disabled:opacity-40"
                            style={
                              selected
                                ? { backgroundColor: INK, color: "#fff", borderColor: INK }
                                : {
                                    backgroundColor: "#fff",
                                    color: "#4B5563",
                                    borderColor: "#E5E0DA",
                                  }
                            }
                          >
                            {lang === "fr" ? "Français" : "English"}
                          </button>
                        );
                      })}
                    </div>
                    {savingFwLang ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                    ) : null}
                  </div>
                );
              })()}
            {livePattern && (
              <div className="mt-1 flex flex-wrap items-center gap-2">
                <p className="text-xs text-gray-500 flex items-center gap-1">
                  <Sparkles className="w-3 h-3" style={{ color: ROSE }} />
                  Motif d&apos;après tes saisies : {livePattern.kind}@{livePattern.domain}
                </p>
                {remainingSuggestionCount > 0 && (
                  <button
                    type="button"
                    onClick={applyAgencySuggestionsToAll}
                    className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ring-1 ring-black/[0.08]"
                    style={{ color: INK, backgroundColor: "#FAFAF8" }}
                  >
                    <Sparkles className="w-3 h-3" style={{ color: ROSE }} />
                    Appliquer aux {remainingSuggestionCount} restants
                  </button>
                )}
              </div>
            )}
          </div>

          {flash && (
            <p
              className="mb-4 text-sm px-3 py-2 rounded-lg"
              style={{ backgroundColor: CREAM, color: INK }}
            >
              {flash}
            </p>
          )}

          <ul className="space-y-3 mb-6">
            {active.people.map((p) => {
              const value = drafts[p.key] || "";
              const isNf = Boolean(notFound[p.key]);
              const valid = !isNf && isValidEmail(value);
              const suggestions = suggestionFor(p);
              return (
                <li
                  key={p.key}
                  className="rounded-xl bg-white ring-1 ring-black/[0.06] p-4 space-y-3"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div
                        className="font-semibold flex items-center gap-2 flex-wrap"
                        style={{ color: INK }}
                      >
                        <span>{[p.prenom, p.nom].filter(Boolean).join(" ")}</span>
                        {!isAgencyTab && !isFwTab &&
                          (p.source === "AO" ? (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: "#FBE5D6", color: "#9A5B1E" }}
                              title="Contact issu de la feuille Achats / Appel d'offre"
                            >
                              AO · Achats
                            </span>
                          ) : (
                            <span
                              className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                              style={{ backgroundColor: CREAM, color: INK }}
                              title="Contact issu de la feuille Influence"
                            >
                              Influence
                            </span>
                          ))}
                        {!isAgencyTab && !isFwTab && (
                          <span
                            className="inline-flex rounded-md overflow-hidden border shrink-0"
                            style={{ borderColor: "#E5E0DA" }}
                            title="Corriger le marché : FR, BE, ou les deux"
                          >
                            {(["FR", "BENELUX", "BOTH"] as const).map((m) => {
                              const selected = personMarketSelection(p) === m;
                              return (
                                <button
                                  key={m}
                                  type="button"
                                  disabled={
                                    savingMarketKey === p.key ||
                                    busy ||
                                    deletingKey === p.key
                                  }
                                  onClick={() => void updatePersonMarkets(p, m)}
                                  className="px-1.5 py-0.5 text-[10px] font-bold uppercase transition disabled:opacity-40"
                                  style={
                                    selected
                                      ? { backgroundColor: INK, color: "#fff" }
                                      : { backgroundColor: "#fff", color: "#9CA3AF" }
                                  }
                                >
                                  {m === "FR"
                                    ? "🇫🇷 FR"
                                    : m === "BENELUX"
                                      ? "🇧🇪 BE"
                                      : "FR+BE"}
                                </button>
                              );
                            })}
                          </span>
                        )}
                        {savingMarketKey === p.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                        ) : null}
                        {p.priorite ? (
                          <span className="text-[10px] font-bold text-gray-400">
                            {p.priorite}
                          </span>
                        ) : null}
                      </div>
                      <div className="text-xs text-gray-500 mt-0.5">
                        {[p.poste, p.perimetre, p.localisation].filter(Boolean).join(" · ") ||
                          "—"}
                      </div>
                      {!isFwTab && (
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <Globe className="w-3.5 h-3.5 text-gray-400" />
                          <span className="text-xs text-gray-500">Langue :</span>
                          <div className="flex gap-1">
                            {(["fr", "en"] as const).map((lang) => {
                              const selected = p.language === lang;
                              return (
                                <button
                                  key={lang}
                                  type="button"
                                  disabled={savingLangKey === p.key || busy}
                                  onClick={() => void updatePersonLanguage(p, lang)}
                                  className="px-2.5 py-1 rounded-lg border text-xs font-medium transition disabled:opacity-40"
                                  style={
                                    selected
                                      ? {
                                          backgroundColor: INK,
                                          color: "#fff",
                                          borderColor: INK,
                                        }
                                      : {
                                          backgroundColor: "#fff",
                                          color: "#4B5563",
                                          borderColor: "#E5E0DA",
                                        }
                                  }
                                >
                                  {lang === "fr" ? "Français" : "English"}
                                </button>
                              );
                            })}
                          </div>
                          {savingLangKey === p.key ? (
                            <Loader2 className="w-3.5 h-3.5 animate-spin text-gray-400" />
                          ) : null}
                        </div>
                      )}
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => void enrichPerson(p, active.company)}
                        disabled={
                          enrichingKey === p.key ||
                          enrichingAll ||
                          busy ||
                          savingPersonKey === p.key ||
                          deletingKey === p.key
                        }
                        title="Enrichir via Apollo + Lusha et comparer"
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white disabled:opacity-40 transition"
                        style={{ backgroundColor: INK }}
                      >
                        {enrichingKey === p.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Zap className="w-3.5 h-3.5" style={{ color: ROSE }} />
                        )}
                        Enrichir
                      </button>
                      {p.linkedinUrl ? (
                        <a
                          href={p.linkedinUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold text-white"
                          style={{ backgroundColor: "#0A66C2" }}
                        >
                          <Linkedin className="w-3.5 h-3.5" />
                          LinkedIn
                        </a>
                      ) : null}
                      <button
                        type="button"
                        onClick={() => void deletePerson(p)}
                        disabled={
                          deletingKey === p.key ||
                          busy ||
                          savingPersonKey === p.key ||
                          enrichingKey === p.key ||
                          enrichingAll
                        }
                        title="Supprimer ce contact (mauvais poste, doublon…)"
                        className="inline-flex items-center justify-center p-2 rounded-lg text-gray-400 hover:text-red-600 hover:bg-red-50 transition disabled:opacity-40"
                      >
                        {deletingKey === p.key ? (
                          <Loader2 className="w-4 h-4 animate-spin" />
                        ) : (
                          <Trash2 className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                  </div>

                  {enrichResults[p.key] ? (
                    <div className="space-y-2">
                      {enrichResults[p.key].agreement.length > 0 ? (
                        <p className="text-[11px] font-medium" style={{ color: GREEN }}>
                          Accord Apollo ∩ Lusha :{" "}
                          {enrichResults[p.key].agreement.join(", ")}
                        </p>
                      ) : null}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                        <ProviderCard
                          label="Apollo"
                          result={enrichResults[p.key].apollo}
                          agreement={enrichResults[p.key].agreement}
                          onPick={(email) => {
                            setNotFound((prev) => ({ ...prev, [p.key]: false }));
                            setDrafts((prev) => ({ ...prev, [p.key]: email }));
                          }}
                          onVerify={(email) => void verifyEmail(email)}
                          verifyingEmail={verifyingEmail}
                          verifyByEmail={verifyByEmail}
                        />
                        <ProviderCard
                          label="Lusha"
                          result={enrichResults[p.key].lusha}
                          agreement={enrichResults[p.key].agreement}
                          onPick={(email) => {
                            setNotFound((prev) => ({ ...prev, [p.key]: false }));
                            setDrafts((prev) => ({ ...prev, [p.key]: email }));
                          }}
                          onVerify={(email) => void verifyEmail(email)}
                          verifyingEmail={verifyingEmail}
                          verifyByEmail={verifyByEmail}
                        />
                      </div>
                    </div>
                  ) : null}

                  {!isNf && suggestions.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {suggestions.map((s) => (
                        <button
                          key={s.email}
                          type="button"
                          onClick={() => {
                            setNotFound((prev) => ({ ...prev, [p.key]: false }));
                            setDrafts((prev) => ({ ...prev, [p.key]: s.email }));
                          }}
                          className="inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded-md ring-1 ring-black/[0.08]"
                          style={{ color: INK, backgroundColor: "#FAFAF8" }}
                        >
                          <Sparkles className="w-3 h-3" style={{ color: ROSE }} />
                          {s.email}
                        </button>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <input
                      type="email"
                      value={isNf ? "" : value}
                      disabled={isNf || savingPersonKey === p.key}
                      onChange={(e) => {
                        setNotFound((prev) => ({ ...prev, [p.key]: false }));
                        setDrafts((prev) => ({ ...prev, [p.key]: e.target.value }));
                      }}
                      placeholder={
                        isNf
                          ? "Pas d'email trouvé"
                          : isAgencyTab
                            ? "email@agence.com"
                            : isFwTab
                              ? "email@maison.com"
                              : "email@marque.fr"
                      }
                      className="min-w-0 flex-1 px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed"
                      style={{
                        borderColor: isNf ? "#D4D0CB" : valid ? GREEN : "#E5E0DA",
                        backgroundColor: isNf ? "#F5F3F0" : valid ? "#F8FCEF" : "#fff",
                      }}
                      autoComplete="off"
                    />
                    {valid && !isNf && (
                      <button
                        type="button"
                        onClick={() => void verifyEmail(value)}
                        disabled={
                          Boolean(verifyingEmail) ||
                          busy ||
                          savingPersonKey === p.key
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold border shrink-0 disabled:opacity-40"
                        style={{ color: INK, borderColor: "#E5E0DA", backgroundColor: "#fff" }}
                        title="Tester l'email saisi (MX + SMTP)"
                      >
                        {verifyingEmail === value.trim().toLowerCase() ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <ShieldCheck className="w-3.5 h-3.5" />
                        )}
                        Tester
                      </button>
                    )}
                    {(valid || isNf) && (
                      <button
                        type="button"
                        onClick={() => void savePerson(p)}
                        disabled={
                          busy ||
                          savingPersonKey === p.key ||
                          deletingKey === p.key
                        }
                        className="inline-flex items-center gap-1.5 px-3 py-2.5 rounded-lg text-xs font-semibold text-white shrink-0 disabled:opacity-40 transition"
                        style={{ backgroundColor: GREEN }}
                        title="Enregistrer ce contact maintenant (conservé si tu quittes la fiche)"
                      >
                        {savingPersonKey === p.key ? (
                          <Loader2 className="w-3.5 h-3.5 animate-spin" />
                        ) : (
                          <Check className="w-3.5 h-3.5" />
                        )}
                        Enregistrer
                      </button>
                    )}
                  </div>
                  {!isNf &&
                    valid &&
                    verifyByEmail[value.trim().toLowerCase()] && (
                      <p
                        className="text-[11px] leading-snug"
                        style={{
                          color: verifyStatusColor(
                            verifyByEmail[value.trim().toLowerCase()].status
                          ),
                        }}
                      >
                        {verifyByEmail[value.trim().toLowerCase()].label}
                        {verifyByEmail[value.trim().toLowerCase()].detail
                          ? ` — ${verifyByEmail[value.trim().toLowerCase()].detail}`
                          : ""}
                      </p>
                    )}

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isNf}
                      disabled={savingPersonKey === p.key || busy}
                      onChange={(e) => {
                        const checked = e.target.checked;
                        setNotFound((prev) => ({ ...prev, [p.key]: checked }));
                        if (checked) {
                          setDrafts((prev) => ({ ...prev, [p.key]: "" }));
                        }
                      }}
                      className="rounded border-gray-300"
                      style={{ accentColor: ROSE }}
                    />
                    <span className="text-xs text-gray-600">Pas d&apos;email trouvé</span>
                  </label>
                </li>
              );
            })}
          </ul>

          <button
            type="button"
            onClick={() => void markReady()}
            disabled={!allReady || busy || Boolean(savingPersonKey)}
            className="flex items-center justify-center gap-2 w-full py-3.5 rounded-xl text-base font-semibold text-white disabled:opacity-40 sticky bottom-4"
            style={{ backgroundColor: allReady ? GREEN : INK }}
          >
            {busy ? <Loader2 className="w-5 h-5 animate-spin" /> : <Check className="w-5 h-5" />}
            {allReady
              ? emailCount === 0
                ? "Prêt — valider sans outreach"
                : isAgencyTab
                  ? `Prêt — envoyer ${emailCount} dans Prospection Agences`
                  : isFwTab
                    ? `Prêt — noter ${emailCount} dans Fashion Week`
                    : `Prêt — envoyer ${emailCount} dans « À contacter »`
              : `Prêt (${resolvedCount}/${active.people.length})`}
          </button>
        </>
      )}

      {showCartoModal && (
        <ImportCartoModal
          initialFile={droppedFile}
          allowSkipOutreach
          onClose={() => {
            setShowCartoModal(false);
            setDroppedFile(null);
          }}
          onImported={handleImported}
          onError={(m) => {
            setShowCartoModal(false);
            setDroppedFile(null);
            setFlash(m);
          }}
        />
      )}

      {showFwCartoModal && (
        <FwImportCartoModal
          initialFile={droppedFile}
          clients={fwClients}
          onClose={() => {
            setShowFwCartoModal(false);
            setDroppedFile(null);
          }}
          onImported={(r) => {
            const parts = [
              `${r.created} importé${r.created > 1 ? "s" : ""}`,
              r.queued > 0 ? `${r.queued} sans mail` : null,
              r.withEmail > 0 ? `${r.withEmail} avec mail` : null,
              r.skipped > 0 ? `${r.skipped} déjà là` : null,
            ].filter(Boolean);
            setFlash(`${r.company} : ${parts.join(" · ")}.`);
            setShowFwCartoModal(false);
            setDroppedFile(null);
            void load({ silent: true });
            if (r.queued > 0 && r.company) {
              setActiveKey(norm(r.company));
              setDrafts({});
              setNotFound({});
            }
          }}
          onError={(m) => {
            setShowFwCartoModal(false);
            setDroppedFile(null);
            setFlash(m);
          }}
        />
      )}
      {showAgencyImport && (
        <ImportAgencyModal
          partners={agencyPartners}
          market={agencyMarket}
          onClose={() => setShowAgencyImport(false)}
          onError={(m) => {
            setShowAgencyImport(false);
            setFlash(m);
          }}
          onImported={(r: AgencyImportResult) => {
            const parts = [
              r.linked > 0 ? `${r.linked} rattaché(s) à la fiche` : null,
              `${r.created} créé(s)`,
              r.addedToCycle > 0 ? `${r.addedToCycle} au cycle` : null,
              r.queued > 0 ? `${r.queued} en file` : null,
              r.skipped > 0 ? `${r.skipped} ignoré(s)` : null,
            ].filter(Boolean);
            setFlash(`${r.company} : ${parts.join(", ")}.`);
            setShowAgencyImport(false);
            void load({ silent: true });
          }}
        />
      )}
    </div>
  );
}
