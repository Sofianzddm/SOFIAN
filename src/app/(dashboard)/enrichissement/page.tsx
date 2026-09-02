"use client";

/**
 * Enrichissement — /enrichissement
 *
 * Onglet Marques : drop carto → liste → fiche → mails (ou « pas d'email ») → Prêt → outreach.
 * Onglet Agences (ADMIN) : file des contacts partners sans email → Prêt →
 * agency-outreach. Seuls les contacts avec email partent en outreach.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
type Tab = "marques" | "agences" | "fw";

type LookupContact = {
  id: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
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
  source: "CARTO" | "AO" | null;
  refs: PersonRef[];
};

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
          source: c.source,
          refs: [],
        };
        b.people.set(personId, p);
      }
      if (!p.linkedinUrl && c.linkedinUrl) p.linkedinUrl = c.linkedinUrl;
      if (!p.poste && c.poste) p.poste = c.poste;
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

  const active = brands.find((b) => b.key === activeKey) || null;
  const isAgencyTab = tab === "agences";
  const isFwTab = tab === "fw";

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
          } automatiquement.`
        );
      }
      return next;
    });
  };

  /** Une fois le motif clair (≥ 2 mails), pré-remplir les champs encore vides. */
  const autoFilledStampRef = useRef("");
  useEffect(() => {
    if (!active || !livePattern || livePattern.matches < 2) return;
    const stamp = `${active.key}:${livePattern.kind}@${livePattern.domain}`;
    if (autoFilledStampRef.current === stamp) return;
    autoFilledStampRef.current = stamp;
    applyAgencySuggestionsToAll();
    // livePattern.kind / domain : on ne re-remplit pas si l'utilisateur vide un champ.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeKey, livePattern?.kind, livePattern?.domain, livePattern?.matches]);

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
    autoFilledStampRef.current = "";
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
    autoFilledStampRef.current = "";
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
    if (busy || deletingKey) return;
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
      setFlash(`${name} supprimé.`);
    } catch (e) {
      setFlash(e instanceof Error ? e.message : "Erreur");
    } finally {
      setDeletingKey(null);
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
        if (!res.ok) throw new Error(data.error || "Échec");
        totalSaved += data.saved || 0;
        totalEnrolled += data.enrolled || 0;
        totalNotFound += data.notFound || 0;
      }

      setFlash(
        totalEnrolled > 0
          ? `${active.company} — ${totalEnrolled} contact(s) envoyés dans « À contacter » 🎉`
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
            {isAgencyTab
              ? "Ouvre une agence · note les mails (ou « pas d'email ») · Prêt → Prospection Agences"
              : isFwTab
                ? "Glisse une carto FW · ouvre une maison · note les mails (ou « pas d'email ») · Prêt → Fashion Week"
                : "Glisse une carto · ouvre une marque · note les mails (ou « pas d'email ») · Prêt"}
          </p>

          {isAdmin && (
            <div
              className="flex gap-1 p-1 rounded-xl mb-5"
              style={{ backgroundColor: CREAM }}
            >
              <button
                type="button"
                onClick={() => switchTab("marques")}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition"
                style={
                  tab === "marques"
                    ? { backgroundColor: "#fff", color: INK }
                    : { color: "#6B7280" }
                }
              >
                Marques
                {marquesCount > 0 ? (
                  <span className="ml-1.5 text-xs opacity-60">{marquesCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => switchTab("agences")}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition"
                style={
                  tab === "agences"
                    ? { backgroundColor: "#fff", color: INK }
                    : { color: "#6B7280" }
                }
              >
                Agences
                {agencyCount > 0 ? (
                  <span className="ml-1.5 text-xs opacity-60">{agencyCount}</span>
                ) : null}
              </button>
              <button
                type="button"
                onClick={() => switchTab("fw")}
                className="flex-1 px-3 py-2 rounded-lg text-sm font-semibold transition"
                style={
                  tab === "fw"
                    ? { backgroundColor: "#fff", color: INK }
                    : { color: "#6B7280" }
                }
              >
                Fashion Week
                {fwCount > 0 ? (
                  <span className="ml-1.5 text-xs opacity-60">{fwCount}</span>
                ) : null}
              </button>
            </div>
          )}

          {!isAgencyTab && !isFwTab ? (
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

          <div className="flex items-center justify-between mb-3">
            <h2 className="text-xs font-semibold text-gray-400 uppercase tracking-wide">
              À traiter
            </h2>
            <span className="text-xs text-gray-400">{brands.length}</span>
          </div>

          {brands.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">Rien en file.</p>
          ) : (
            <ul className="space-y-2">
              {brands.map((b, i) => (
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
              }}
              className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800"
            >
              <ArrowLeft className="w-4 h-4" />
              {isAgencyTab ? "Agences" : isFwTab ? "Fashion Week" : "Marques"}
            </button>
            <div className="text-xs text-gray-400">
              {resolvedCount} / {active.people.length} traités
              {emailCount < resolvedCount
                ? ` · ${emailCount} email${emailCount > 1 ? "s" : ""}`
                : ""}
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
                        {!isAgencyTab && p.refs.length > 1 && (
                          <span
                            className="text-[10px] font-bold px-1.5 py-0.5 rounded"
                            style={{ backgroundColor: "#EEF2FF", color: INK }}
                            title="Ce contact est sur les deux marchés — un seul mail suffit"
                          >
                            FR + BE
                          </span>
                        )}
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
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
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
                        disabled={deletingKey === p.key || busy}
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

                  <input
                    type="email"
                    value={isNf ? "" : value}
                    disabled={isNf}
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
                    className="w-full px-3 py-2.5 rounded-lg border text-sm focus:outline-none focus:ring-2 disabled:opacity-60 disabled:cursor-not-allowed"
                    style={{
                      borderColor: isNf ? "#D4D0CB" : valid ? GREEN : "#E5E0DA",
                      backgroundColor: isNf ? "#F5F3F0" : valid ? "#F8FCEF" : "#fff",
                    }}
                    autoComplete="off"
                  />

                  <label className="flex items-center gap-2 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={isNf}
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
            disabled={!allReady || busy}
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
