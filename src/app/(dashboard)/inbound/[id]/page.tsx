"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSession } from "next-auth/react";
import { Loader2, Plus } from "lucide-react";
import Image from "next/image";
import { useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TiptapUnderline from "@tiptap/extension-underline";
import TiptapLink from "@tiptap/extension-link";
import EmailComposer, {
  type BrandResearch,
  type Talent,
} from "@/app/(dashboard)/casting-outreach/EmailComposer";
import { getInstagramProfileUrl } from "@/lib/social-links";
import { inboundCategoryLabel } from "@/lib/inbound-categories";
import { resolveTalentPlaceholders, talentToTiptapNode } from "@/lib/talent-email-links";
import QuickMarqueModal from "@/components/QuickMarqueModal";

type InboundStatus = "NEW" | "READY" | "IN_REVIEW" | "CONVERTED" | "ARCHIVED";

type RecentSendEntry = {
  id: string;
  sentAt: string;
  subject: string;
  senderEmail: string;
  senderName: string | null;
  senderDomain: string;
  extractedBrand: string | null;
  talentName: string;
};

type PresskitTalent = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  instagram?: string | null;
  igFollowers: number;
  igEngagement: number;
  ttFollowers: number;
  ttEngagement: number;
};

type Opportunity = {
  id: string;
  talentName: string;
  talentEmail: string;
  talentId?: string | null;
  senderEmail: string;
  senderName?: string | null;
  senderDomain: string;
  subject: string;
  bodyExcerpt: string;
  category: string;
  confidence: number;
  priority: string;
  status: InboundStatus;
  receivedAt: string;
  extractedBrand?: string | null;
  extractedBudget?: string | null;
  extractedDeadline?: string | null;
  extractedDeliverables?: string | null;
  briefSummary?: string | null;
  draftEmailSubject?: string | null;
  draftEmailBody?: string | null;
  convertedAt?: string | null;
  convertedBy?: { prenom: string; nom: string } | null;
  archivedAt?: string | null;
  archivedReason?: string | null;
  convertedToProspectionId?: string | null;
  outreachBridgedAt?: string | null;
  outreachTargetRef?: string | null;
  marqueId?: string | null;
  contactKind?: string | null;
  contactAgence?: string | null;
  contactLanguage?: string | null;
  contactMarket?: string | null;
};

// "agency:xyz" → "Prospection Agences", "client:xyz" → "Outreach Clients"…
function outreachBridgeLabel(ref: string | null | undefined): string | null {
  if (!ref || ref.startsWith("skipped:")) return null;
  if (ref.startsWith("agency:")) return "Prospection Agences";
  if (ref.startsWith("benelux:")) return "Prospection Benelux";
  if (ref.startsWith("client:")) return "Outreach Clients";
  return null;
}

const ALLOWED = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"];

export default function InboundDetailPage() {
  const { data: session, status } = useSession();
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const [opportunity, setOpportunity] = useState<Opportunity | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [composerOpen, setComposerOpen] = useState(false);
  const [composerSubject, setComposerSubject] = useState("");
  const [sendingFromLeyna, setSendingFromLeyna] = useState(false);
  const [sendingTest, setSendingTest] = useState(false);
  const [toast, setToast] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [talents, setTalents] = useState<PresskitTalent[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(false);
  const [talentsError, setTalentsError] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [brandResearch, setBrandResearch] = useState<BrandResearch | null>(null);
  const [isResearching, setIsResearching] = useState(false);
  const [isGenerating, setIsGenerating] = useState(false);
  const [emailLanguage, setEmailLanguage] = useState<"fr" | "en">("fr");
  // Qualification locale : validée uniquement via le bouton Enregistrer
  // (crée la fiche contact agence/marque tout de suite).
  const [qualifKind, setQualifKind] = useState<"" | "MARQUE" | "AGENCE">("");
  const [qualifAgence, setQualifAgence] = useState("");
  const [qualifLanguage, setQualifLanguage] = useState<"fr" | "en">("fr");
  const [qualifSaving, setQualifSaving] = useState(false);
  const [qualifFiche, setQualifFiche] = useState<{
    kind: "AGENCE" | "MARQUE";
    label: string;
    href: string;
  } | null>(null);
  // Snapshot de la dernière qualification commitée (pour détecter un brouillon local).
  const [committedQualif, setCommittedQualif] = useState<{
    kind: "" | "MARQUE" | "AGENCE";
    agence: string;
    language: "fr" | "en";
    marqueId: string;
    crmKey: string;
    market: "BENELUX" | "BOTH";
  }>({ kind: "", agence: "", language: "fr", marqueId: "", crmKey: "", market: "BOTH" });
  // Agences existantes : suggérées dans le champ « Nom de l'agence » pour
  // réutiliser la fiche (pas de doublon) ; un nom inconnu crée l'agence.
  const [agencyOptions, setAgencyOptions] = useState<{ id: string; name: string }[]>([]);
  // Marques CRM FR + entreprises BENELUX (deux CRM).
  type CrmPick = {
    source: "FR" | "BENELUX";
    id: string;
    nom: string;
    linkedMarqueId?: string | null;
    raisonSociale?: string | null;
  };
  const [crmMarques, setCrmMarques] = useState<CrmPick[]>([]);
  const [crmBeCompanies, setCrmBeCompanies] = useState<CrmPick[]>([]);
  const [qualifMarket, setQualifMarket] = useState<"BENELUX" | "BOTH">("BOTH");
  const [selectedCrm, setSelectedCrm] = useState<CrmPick | null>(null);
  const [marqueSearch, setMarqueSearch] = useState("");
  const [createMarqueOpen, setCreateMarqueOpen] = useState(false);

  useEffect(() => {
    fetch("/api/partners/options", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { partners: [] }))
      .then((d) => setAgencyOptions(Array.isArray(d.partners) ? d.partners : []))
      .catch(() => setAgencyOptions([]));
    fetch("/api/marques/options", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { marques: [] }))
      .then((d) =>
        setCrmMarques(
          Array.isArray(d.marques)
            ? d.marques.map(
                (m: { id: string; nom: string; raisonSociale?: string | null }) => ({
                  source: "FR" as const,
                  id: m.id,
                  nom: m.nom,
                  raisonSociale: m.raisonSociale ?? null,
                })
              )
            : []
        )
      )
      .catch(() => setCrmMarques([]));
    fetch("/api/benelux-outreach/companies", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : { companies: [] }))
      .then((d) =>
        setCrmBeCompanies(
          Array.isArray(d.companies)
            ? d.companies.map(
                (c: {
                  id: string;
                  nom: string;
                  linkedMarqueId?: string | null;
                }) => ({
                  source: "BENELUX" as const,
                  id: c.id,
                  nom: c.nom,
                  linkedMarqueId: c.linkedMarqueId ?? null,
                })
              )
            : []
        )
      )
      .catch(() => setCrmBeCompanies([]));
  }, []);

  // Lien « ouvrir fiche agence » une fois les options partenaires chargées.
  useEffect(() => {
    if (committedQualif.kind !== "AGENCE" || !committedQualif.agence.trim()) return;
    const match = agencyOptions.find(
      (a) => a.name.trim().toLowerCase() === committedQualif.agence.trim().toLowerCase()
    );
    if (!match) return;
    setQualifFiche((prev) =>
      prev && prev.kind === "AGENCE"
        ? { ...prev, label: match.name, href: `/partners/manage/${match.id}` }
        : {
            kind: "AGENCE",
            label: match.name,
            href: `/partners/manage/${match.id}`,
          }
    );
  }, [agencyOptions, committedQualif.kind, committedQualif.agence]);

  // Affiche le vrai nom CRM une fois les options chargées.
  useEffect(() => {
    if (!selectedCrm) return;
    if (selectedCrm.source === "FR") {
      const match = crmMarques.find((m) => m.id === selectedCrm.id);
      if (match && match.nom !== selectedCrm.nom) {
        setSelectedCrm(match);
        setMarqueSearch(match.nom);
      }
    } else {
      const match = crmBeCompanies.find((m) => m.id === selectedCrm.id);
      if (match && match.nom !== selectedCrm.nom) {
        setSelectedCrm(match);
        setMarqueSearch(match.nom);
      }
    }
  }, [crmMarques, crmBeCompanies, selectedCrm]);

  const [recentSends, setRecentSends] = useState<{
    windowDays: number;
    sameEmail: RecentSendEntry[];
    sameDomain: RecentSendEntry[];
  } | null>(null);

  const role = (session?.user as { role?: string } | undefined)?.role || "";
  const forbidden = status !== "loading" && !ALLOWED.includes(role);

  useEffect(() => {
    if (forbidden || !params?.id || status === "loading") return;
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(`/api/inbound/opportunities/${params.id}`, {
          cache: "no-store",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur");
        const opp: Opportunity | null = data.opportunity || null;
        setOpportunity(opp);
        const kind: "" | "MARQUE" | "AGENCE" =
          opp?.contactKind === "AGENCE" ? "AGENCE" : opp?.contactKind === "MARQUE" ? "MARQUE" : "";
        const agence = opp?.contactAgence || "";
        const language: "fr" | "en" = opp?.contactLanguage === "en" ? "en" : "fr";
        const marqueId = (opp?.marqueId || "").trim();
        const marketRaw = String(opp?.contactMarket || "BOTH")
          .trim()
          .toUpperCase();
        const market: "BENELUX" | "BOTH" =
          marketRaw === "BENELUX" || marketRaw === "BE" ? "BENELUX" : "BOTH";
        setQualifKind(kind);
        setQualifAgence(agence);
        setQualifLanguage(language);
        setQualifMarket(market);
        setCommittedQualif({
          kind,
          agence,
          language,
          marqueId,
          crmKey: kind === "MARQUE" && marqueId ? `FR:${marqueId}` : "",
          market,
        });
        if (kind === "MARQUE" && marqueId) {
          setSelectedCrm({
            source: "FR",
            id: marqueId,
            nom: opp?.extractedBrand || "Marque",
          });
          setMarqueSearch(opp?.extractedBrand || "");
        } else if (kind === "MARQUE") {
          setSelectedCrm(null);
          setMarqueSearch(opp?.extractedBrand || "");
        } else {
          setSelectedCrm(null);
          setMarqueSearch("");
        }
        if (kind === "AGENCE" && agence) {
          setQualifFiche({ kind: "AGENCE", label: agence, href: "" });
        } else if (kind === "MARQUE" && marqueId) {
          setQualifFiche({
            kind: "MARQUE",
            label: opp?.extractedBrand || "Marque",
            href:
              market === "BENELUX"
                ? ""
                : `/marques/${marqueId}`,
          });
        } else {
          setQualifFiche(null);
        }

        // Si déjà qualifié (ex. ancienne sauvegarde), on s'assure que la fiche
        // contact existe bien côté CRM.
        if (
          (kind === "MARQUE" && marqueId) ||
          (kind === "AGENCE" && agence)
        ) {
          void fetch(`/api/inbound/opportunities/${opp!.id}/qualify`, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              contactKind: kind,
              contactAgence: kind === "AGENCE" ? agence : null,
              contactLanguage: language,
              marqueId: kind === "MARQUE" ? marqueId : null,
              contactMarket: kind === "MARQUE" ? market : undefined,
            }),
          })
            .then(async (r) => {
              if (!r.ok) return;
              const d = await r.json().catch(() => ({}));
              const fiche = d.fiche as
                | {
                    ok: true;
                    kind: "AGENCE" | "MARQUE";
                    partnerName?: string;
                    marqueName?: string;
                    href: string;
                  }
                | undefined;
              if (fiche?.ok) {
                setQualifFiche({
                  kind: fiche.kind,
                  label:
                    fiche.kind === "AGENCE"
                      ? fiche.partnerName || agence
                      : fiche.marqueName || opp?.extractedBrand || "Marque",
                  href: fiche.href,
                });
                if (fiche.kind === "MARQUE" && fiche.marqueName) {
                  setMarqueSearch(fiche.marqueName);
                  setSelectedCrm((prev) =>
                    prev
                      ? { ...prev, nom: fiche.marqueName || prev.nom }
                      : prev
                  );
                }
              }
              if (d.opportunity) {
                setOpportunity((current) =>
                  current ? { ...current, ...d.opportunity } : d.opportunity
                );
              }
            })
            .catch(() => undefined);
        }
      } catch {
        setOpportunity(null);
      } finally {
        setLoading(false);
      }
    })();
  }, [params?.id, forbidden, status]);

  useEffect(() => {
    if (forbidden || !params?.id || status === "loading") return;
    (async () => {
      try {
        const res = await fetch(
          `/api/inbound/opportunities/${params.id}/recent-sends?days=20`,
          { cache: "no-store", credentials: "include" }
        );
        if (!res.ok) {
          setRecentSends(null);
          return;
        }
        const data = await res.json();
        setRecentSends({
          windowDays: data.windowDays || 20,
          sameEmail: Array.isArray(data.sameEmail) ? data.sameEmail : [],
          sameDomain: Array.isArray(data.sameDomain) ? data.sameDomain : [],
        });
      } catch {
        setRecentSends(null);
      }
    })();
  }, [params?.id, forbidden, status]);

  const daysSince = (iso: string): number => {
    const ms = Date.now() - new Date(iso).getTime();
    return Math.max(1, Math.round(ms / (24 * 60 * 60 * 1000)));
  };

  const normalizeMarque = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim();

  const marqueSuggestions = useMemo(() => {
    if (selectedCrm) return [];
    const q = normalizeMarque(marqueSearch);
    if (q.length < 2) return [];
    const pool: CrmPick[] = [];
    if (qualifMarket === "BOTH") {
      pool.push(...crmMarques);
    }
    if (qualifMarket === "BENELUX" || qualifMarket === "BOTH") {
      pool.push(...crmBeCompanies);
    }
    return pool
      .filter(
        (m) =>
          normalizeMarque(m.nom).includes(q) ||
          normalizeMarque(m.raisonSociale || "").includes(q)
      )
      .slice(0, 10);
  }, [crmMarques, crmBeCompanies, marqueSearch, selectedCrm, qualifMarket]);

  const pickCrmMarque = (m: CrmPick) => {
    setSelectedCrm(m);
    setMarqueSearch(m.nom);
  };

  const clearCrmMarque = () => {
    setSelectedCrm(null);
  };

  const selectedCrmKey = selectedCrm ? `${selectedCrm.source}:${selectedCrm.id}` : "";

  const qualifDirty =
    qualifKind !== committedQualif.kind ||
    qualifAgence.trim() !== committedQualif.agence.trim() ||
    qualifLanguage !== committedQualif.language ||
    qualifMarket !== committedQualif.market ||
    selectedCrmKey !== committedQualif.crmKey;

  const qualificationReady =
    ((committedQualif.kind === "MARQUE" && Boolean(committedQualif.marqueId)) ||
      (committedQualif.kind === "AGENCE" && Boolean(committedQualif.agence.trim()))) &&
    !qualifDirty;

  /** Bouton Enregistrer : écrit la qualification + crée la fiche contact. */
  const commitQualification = async () => {
    if (!opportunity) return;
    if (qualifKind !== "MARQUE" && qualifKind !== "AGENCE") {
      showToast("Choisis Agence ou Marque en direct.", "error");
      return;
    }
    if (qualifKind === "AGENCE" && !qualifAgence.trim()) {
      showToast("Indique le nom de l'agence.", "error");
      return;
    }
    if (qualifKind === "MARQUE" && !selectedCrm) {
      showToast(
        "Sélectionne une marque du CRM, ou crée-la si elle n'existe pas.",
        "error"
      );
      return;
    }

    setQualifSaving(true);
    try {
      const res = await fetch(`/api/inbound/opportunities/${opportunity.id}/qualify`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          contactKind: qualifKind,
          contactAgence: qualifKind === "AGENCE" ? qualifAgence.trim() : null,
          contactLanguage: qualifLanguage,
          contactMarket: qualifKind === "MARQUE" ? qualifMarket : undefined,
          marqueId:
            qualifKind === "MARQUE"
              ? selectedCrm?.source === "FR"
                ? selectedCrm.id
                : selectedCrm?.linkedMarqueId || null
              : null,
          beneluxCompanyId:
            qualifKind === "MARQUE" && selectedCrm?.source === "BENELUX"
              ? selectedCrm.id
              : null,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur d'enregistrement");

      const opp = (data.opportunity || {}) as Opportunity;
      setOpportunity((current) => ({ ...(current || opportunity), ...opp }));
      const kind: "MARQUE" | "AGENCE" = qualifKind;
      const agence = kind === "AGENCE" ? qualifAgence.trim() : "";
      const marqueId =
        kind === "MARQUE"
          ? String(opp.marqueId || selectedCrm?.id || "")
          : "";
      setCommittedQualif({
        kind,
        agence,
        language: qualifLanguage,
        marqueId,
        crmKey: selectedCrm ? `${selectedCrm.source}:${selectedCrm.id}` : "",
        market: kind === "MARQUE" ? qualifMarket : "BOTH",
      });
      setQualifAgence(agence);

      const fiche = data.fiche as
        | {
            ok: true;
            kind: "AGENCE" | "MARQUE";
            partnerName?: string;
            marqueName?: string;
            href: string;
            created: boolean;
            outreachAction?: string;
            outreachPipeline?: string;
            linkedMarqueId?: string | null;
            linkedMarqueName?: string | null;
          }
        | undefined;
      if (fiche?.ok) {
        const label =
          fiche.kind === "AGENCE"
            ? fiche.partnerName || agence
            : fiche.marqueName || selectedCrm?.nom || opp.extractedBrand || "Marque";
        setQualifFiche({ kind: fiche.kind, label, href: fiche.href });
        if (fiche.kind === "MARQUE" && fiche.marqueName) {
          setMarqueSearch(fiche.marqueName);
          setSelectedCrm((prev) =>
            prev ? { ...prev, nom: fiche.marqueName || prev.nom } : prev
          );
        }
        const outreachMsg =
          fiche.outreachAction === "created" && fiche.kind === "AGENCE"
            ? " — ajoutée en Prospection Agences (à contacter)"
            : fiche.outreachAction === "deferred" && fiche.kind === "MARQUE"
              ? " — Outreach (WAITING J+30) après l'envoi de ta réponse"
              : fiche.outreachAction === "already-tracked"
                ? " — déjà dans un cycle outreach"
                : "";
        const marqueLinkMsg =
          fiche.kind === "AGENCE" && fiche.linkedMarqueName
            ? ` — aussi liée sur la fiche ${fiche.linkedMarqueName}`
            : "";
        showToast(
          (fiche.created
            ? `Fiche ${fiche.kind === "AGENCE" ? "agence" : "marque"} créée : ${label}`
            : `Contact enregistré sur ${label}`) +
            outreachMsg +
            marqueLinkMsg,
          "success"
        );
      } else {
        showToast("Qualification enregistrée", "success");
      }
    } catch (error) {
      showToast(
        error instanceof Error ? error.message : "Erreur d'enregistrement",
        "error"
      );
    } finally {
      setQualifSaving(false);
    }
  };
  const bodyText = useMemo(() => {
    if (!opportunity) return "";
    if (showAll) return opportunity.bodyExcerpt;
    return opportunity.bodyExcerpt.slice(0, 800);
  }, [opportunity, showAll]);

  const composerEditor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit.configure({ link: false }),
      TiptapUnderline,
      TiptapLink.configure({
        openOnClick: false,
        autolink: false,
        HTMLAttributes: {
          target: "_blank",
          rel: "noopener noreferrer",
        },
      }),
    ],
    content: "<p></p>",
    editorProps: {
      attributes: {
        class:
          "min-h-[220px] max-h-[50vh] overflow-y-auto rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm focus:outline-none",
      },
    },
  });

  useEffect(() => {
    if (!composerOpen || !opportunity) return;
    setComposerSubject(opportunity.draftEmailSubject || opportunity.subject || "");
    composerEditor?.commands.setContent(opportunity.draftEmailBody || "<p></p>");
    setSelectedIds(new Set());
    setBrandResearch(null);
  }, [composerOpen, opportunity, composerEditor]);

  useEffect(() => {
    if (!composerOpen) return;
    let cancelled = false;
    setLoadingTalents(true);
    setTalentsError(null);
    fetch("/api/talents?presskit=true", { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(typeof j.message === "string" ? j.message : "Chargement des talents impossible.");
        }
        return res.json();
      })
      .then((data: { talents?: PresskitTalent[] }) => {
        if (!cancelled) {
          setTalents(Array.isArray(data.talents) ? data.talents : []);
        }
      })
      .catch((e: unknown) => {
        if (!cancelled) setTalentsError(e instanceof Error ? e.message : "Erreur réseau.");
      })
      .finally(() => {
        if (!cancelled) setLoadingTalents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [composerOpen]);

  const showToast = (message: string, type: "success" | "error") => {
    setToast({ message, type });
    window.setTimeout(() => setToast(null), 3200);
  };

  const selectedTalentsRaw = useMemo(
    () => talents.filter((t) => selectedIds.has(t.id)),
    [talents, selectedIds]
  );

  const selectedTalents: Talent[] = useMemo(
    () =>
      selectedTalentsRaw.map((t) => ({
        id: t.id,
        prenom: t.prenom,
        nom: t.nom,
        niches: t.niches,
      })),
    [selectedTalentsRaw]
  );

  const toggleTalent = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const insertTalentInMail = useCallback(
    (talent: PresskitTalent) => {
      if (!composerEditor) return;
      composerEditor
        .chain()
        .focus()
        .insertContent([talentToTiptapNode(talent), { type: "text", text: " " }])
        .run();
    },
    [composerEditor]
  );

  const insertSelectedTalentsInMail = useCallback(() => {
    if (!composerEditor || selectedTalentsRaw.length === 0) return;
    for (const talent of selectedTalentsRaw) {
      composerEditor
        .chain()
        .focus()
        .insertContent([talentToTiptapNode(talent), { type: "hardBreak" }])
        .run();
    }
  }, [composerEditor, selectedTalentsRaw]);

  const runBrandResearch = useCallback(async () => {
    if (!opportunity) return;
    const brandName = (opportunity.extractedBrand || opportunity.senderDomain || "").trim();
    if (!brandName) {
      showToast("Nom de marque manquant pour la recherche.", "error");
      return;
    }
    setIsResearching(true);
    try {
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brandName }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Recherche impossible.");
      }
      setBrandResearch(data as BrandResearch);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur réseau.", "error");
    } finally {
      setIsResearching(false);
    }
  }, [opportunity]);

  const runGenerateEmail = useCallback(async () => {
    if (!opportunity || !brandResearch) return;
    if (selectedTalentsRaw.length === 0) {
      showToast("Sélectionne au moins un talent.", "error");
      return;
    }
    setIsGenerating(true);
    try {
      const senderFirstName = (opportunity.senderName || "")
        .trim()
        .split(/\s+/)[0]
        ?.trim();
      const res = await fetch("/api/casting/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          language: emailLanguage,
          brandName: opportunity.extractedBrand || opportunity.senderDomain,
          brandResearch,
          recipient: {
            firstName: senderFirstName || undefined,
            brandName: opportunity.extractedBrand || opportunity.senderDomain,
          },
          talents: selectedTalentsRaw.map((t) => {
            const followers = Math.max(t.igFollowers || 0, t.ttFollowers || 0);
            const eng = t.igEngagement > 0 ? t.igEngagement : t.ttEngagement > 0 ? t.ttEngagement : undefined;
            return {
              talentId: t.id,
              name: `${t.prenom} ${t.nom}`.trim(),
              niche: (t.niches || []).join(", ") || "—",
              followers,
              igFollowers: t.igFollowers || 0,
              ttFollowers: t.ttFollowers || 0,
              instagram: t.instagram ?? null,
              ...(typeof eng === "number" ? { engagementRate: eng } : {}),
            };
          }),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(typeof data.error === "string" ? data.error : "Génération impossible.");
      }
      const nextSubject = typeof data.subject === "string" ? data.subject : "";
      const nextBody = typeof data.body === "string" ? data.body : "";
      setComposerSubject(nextSubject);
      composerEditor?.commands.setContent(nextBody.startsWith("<") ? nextBody : `<p>${nextBody.replace(/\n/g, "<br/>")}</p>`);
      showToast("Brouillon généré", "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur réseau.", "error");
    } finally {
      setIsGenerating(false);
    }
  }, [opportunity, brandResearch, selectedTalentsRaw, emailLanguage, composerEditor]);

  if (status === "loading" || loading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-[#C08B8B]" />
      </div>
    );
  }
  if (forbidden) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">Acces refuse.</div>;
  if (!opportunity) return <div className="rounded-xl border border-slate-200 bg-white p-6 text-sm">Opportunite introuvable.</div>;

  // Champ agence libre : la liste ne sert qu'à réutiliser une fiche existante.
  const matchedAgency = agencyOptions.find(
    (a) => a.name.trim().toLowerCase() === qualifAgence.trim().toLowerCase()
  );

  const canAct = opportunity.status === "NEW" || opportunity.status === "IN_REVIEW";
  const canCompose = canAct && qualificationReady;
  const canDelete = opportunity.status !== "CONVERTED";

  const removeOpportunity = async () => {
    if (!window.confirm("Supprimer definitivement cette opportunite inbound ?")) return;
    if (!window.confirm("Cette action est irreversible. Confirmer la suppression ?")) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/inbound/opportunities/${opportunity.id}`, {
        method: "DELETE",
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Erreur suppression");
      router.push("/inbound");
    } catch (e: any) {
      window.alert(e?.message || "Erreur suppression");
    } finally {
      setSubmitting(false);
    }
  };

  const saveDraft = async (draft?: { subject: string; bodyHtml: string }) => {
    const res = await fetch(`/api/inbound/opportunities/${opportunity.id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        draftEmailSubject: draft?.subject ?? "",
        draftEmailBody: draft?.bodyHtml ?? "",
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "Erreur sauvegarde brouillon");
    if (data?.opportunity) setOpportunity(data.opportunity as Opportunity);
  };

  const recentSendBlocked = (recentSends?.sameEmail?.length || 0) > 0;
  const recentSendBlockedMessage = recentSendBlocked && recentSends
    ? `Un mail a déjà été envoyé à ${recentSends.sameEmail[0].senderEmail} il y a ${daysSince(recentSends.sameEmail[0].sentAt)} jour(s). Renvoi bloqué pendant ${recentSends.windowDays} jours.`
    : "";

  const sendFromLeyna = async () => {
    if (!opportunity) return;
    if (recentSendBlocked) {
      showToast(recentSendBlockedMessage, "error");
      return;
    }
    const subject = composerSubject.trim();
    const rawHtml = composerEditor?.getHTML() || "";
    if (!subject) {
      showToast("Objet obligatoire.", "error");
      return;
    }
    if (!rawHtml.trim()) {
      showToast("Corps du mail obligatoire.", "error");
      return;
    }
    const bodyHtml = resolveTalentPlaceholders(rawHtml, selectedTalentsRaw);
    if (/\{\{\s*talent_\d+\s*\}\}/i.test(bodyHtml)) {
      showToast(
        "Des jetons {{talent_N}} n'ont pas pu être remplacés. Vérifie la sélection des talents (ordre = n° du jeton).",
        "error"
      );
      return;
    }
    if (/\{\{\s*(?:contact|owner)\./i.test(bodyHtml) || /\{\{\s*(?:contact|owner)\./i.test(subject)) {
      showToast(
        "Des jetons HubSpot ({{ contact.* }} ou {{ owner.* }}) sont restés dans l'email. Remplace-les par les vraies valeurs avant l'envoi.",
        "error"
      );
      return;
    }

    setSendingFromLeyna(true);
    try {
      // La qualification + fiche contact doivent être enregistrées avant l'envoi
      // (routage outreach à la clôture).
      if (!qualificationReady) {
        showToast(
          "Qualifie le contact (Agence ou Marque) et clique sur Enregistrer avant d'envoyer.",
          "error"
        );
        return;
      }
      await saveDraft({ subject, bodyHtml });

      const sendRes = await fetch(`/api/inbound/opportunities/${opportunity.id}/send`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ subject, htmlBody: bodyHtml }),
      });
      const sendJson = await sendRes.json().catch(() => ({}));
      if (!sendRes.ok) {
        if (sendJson.error === "gmail_not_connected") {
          throw new Error(
            "La boite Gmail de Leyna n'est pas connectée. Demandez à l'admin de la connecter dans Settings → Gmail"
          );
        }
        if (sendJson.error === "recent_send_blocked") {
          throw new Error(
            typeof sendJson.message === "string"
              ? sendJson.message
              : "Un mail a déjà été envoyé à cette adresse récemment."
          );
        }
        if (sendJson.error === "gmail_send_failed") {
          throw new Error(
            typeof sendJson.message === "string"
              ? sendJson.message
              : "Gmail a refusé l'envoi."
          );
        }
        throw new Error(typeof sendJson.error === "string" ? sendJson.error : "Envoi Gmail impossible.");
      }

      showToast("✅ Envoyé depuis leyna@glowupagence.fr", "success");
      setComposerOpen(false);
      setOpportunity((prev) => (prev ? { ...prev, status: "READY" } : prev));
      window.setTimeout(() => {
        router.push("/inbound");
      }, 700);
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur envoi.", "error");
    } finally {
      setSendingFromLeyna(false);
    }
  };

  const sendTestToSelf = async () => {
    if (!opportunity) return;
    const subject = composerSubject.trim();
    const rawHtml = composerEditor?.getHTML() || "";
    if (!subject) {
      showToast("Objet obligatoire.", "error");
      return;
    }
    if (!rawHtml.trim()) {
      showToast("Corps du mail obligatoire.", "error");
      return;
    }
    const bodyHtml = resolveTalentPlaceholders(rawHtml, selectedTalentsRaw);
    if (/\{\{\s*talent_\d+\s*\}\}/i.test(bodyHtml)) {
      showToast(
        "Des jetons {{talent_N}} n'ont pas pu être remplacés. Vérifie la sélection des talents.",
        "error"
      );
      return;
    }
    if (/\{\{\s*(?:contact|owner)\./i.test(bodyHtml) || /\{\{\s*(?:contact|owner)\./i.test(subject)) {
      showToast(
        "Des jetons HubSpot ({{ contact.* }} ou {{ owner.* }}) sont restés dans l'email. Remplace-les par les vraies valeurs avant l'envoi.",
        "error"
      );
      return;
    }

    setSendingTest(true);
    try {
      const res = await fetch(
        `/api/inbound/opportunities/${opportunity.id}/test-send`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ subject, htmlBody: bodyHtml }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        if (data.error === "gmail_not_connected") {
          throw new Error(
            "La boite Gmail de Leyna n'est pas connectée. Demandez à l'admin de la connecter."
          );
        }
        throw new Error(typeof data.error === "string" ? data.error : "Envoi test impossible.");
      }
      showToast(`✅ Test envoyé à ${data.to || "ton email"}`, "success");
    } catch (e: unknown) {
      showToast(e instanceof Error ? e.message : "Erreur envoi test.", "error");
    } finally {
      setSendingTest(false);
    }
  };

  return (
    <div className="space-y-4">
      {toast && (
        <div
          className="fixed bottom-6 right-6 z-[220] rounded-xl border px-4 py-3 text-sm shadow-lg"
          style={{
            backgroundColor: toast.type === "success" ? "#C8F285" : "#FEE2E2",
            borderColor: toast.type === "success" ? "#1A1110" : "#FCA5A5",
            color: "#1A1110",
          }}
        >
          {toast.message}
        </div>
      )}
      <Link href="/inbound" className="text-sm text-slate-500 hover:text-slate-800">← Retour aux opportunites inbound</Link>

      {opportunity.status === "CONVERTED" && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-800">
          Convertie en prospection le {opportunity.convertedAt ? new Date(opportunity.convertedAt).toLocaleString("fr-FR") : "—"}
          {opportunity.convertedBy ? ` par ${opportunity.convertedBy.prenom} ${opportunity.convertedBy.nom}` : ""}.
        </div>
      )}
      {opportunity.status === "ARCHIVED" && (
        <div className="rounded-lg border border-slate-300 bg-slate-100 p-3 text-sm text-slate-700">
          Archivee le {opportunity.archivedAt ? new Date(opportunity.archivedAt).toLocaleString("fr-FR") : "—"}.
          {opportunity.archivedReason ? ` Raison: ${opportunity.archivedReason}` : ""}
        </div>
      )}
      {opportunity.outreachBridgedAt && outreachBridgeLabel(opportunity.outreachTargetRef) && (
        <div className="rounded-lg border border-sky-200 bg-sky-50 p-3 text-sm text-sky-800">
          Ajoutee au cycle {outreachBridgeLabel(opportunity.outreachTargetRef)} le{" "}
          {new Date(opportunity.outreachBridgedAt).toLocaleDateString("fr-FR")} : le contact
          est en attente de recontact automatique 45 jours apres ce dernier echange.
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-5">
        <section className="xl:col-span-3 rounded-xl border border-slate-200 bg-white p-4">
          <div className="space-y-1 text-sm text-slate-600">
            <div><strong>From:</strong> {opportunity.senderName || "—"} &lt;{opportunity.senderEmail}&gt;</div>
            <div><strong>To:</strong> {opportunity.talentName} ({opportunity.talentEmail})</div>
            <div><strong>Date:</strong> {new Date(opportunity.receivedAt).toLocaleString("fr-FR")}</div>
          </div>
          <h1 className="mt-3 text-xl font-semibold text-slate-900">{opportunity.subject}</h1>
          <div className="mt-3 rounded-lg bg-slate-50 p-3 text-sm leading-6 text-slate-700 whitespace-pre-wrap">
            {bodyText}
          </div>
          {opportunity.bodyExcerpt.length > 800 && (
            <button type="button" className="mt-2 text-xs text-slate-600 underline" onClick={() => setShowAll((v) => !v)}>
              {showAll ? "Voir moins" : "Voir plus"}
            </button>
          )}
          <p className="mt-3 text-xs text-slate-500">
            Mail original consultable dans la boite de {opportunity.talentName}.
          </p>
        </section>

        <aside className="xl:col-span-2 space-y-3">
          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Classification</h2>
            <p className="mt-2 text-sm text-slate-700">Categorie: <strong>{inboundCategoryLabel(opportunity.category)}</strong></p>
            <p className="text-sm text-slate-700">Priorite: <strong>{opportunity.priority}</strong></p>
            <div className="mt-2">
              <div className="mb-1 text-xs text-slate-500">Confiance ({Math.round(opportunity.confidence * 100)}%)</div>
              <div className="h-2 rounded bg-slate-100">
                <div className="h-2 rounded bg-[#C08B8B]" style={{ width: `${Math.round(opportunity.confidence * 100)}%` }} />
              </div>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Donnees extraites</h2>
            <div className="mt-2 space-y-1 text-sm text-slate-700">
              <p><strong>Marque:</strong> {opportunity.extractedBrand || opportunity.senderDomain}</p>
              {opportunity.briefSummary ? <p><strong>Brief:</strong> {opportunity.briefSummary}</p> : null}
              {opportunity.extractedBudget ? <p><strong>Budget:</strong> {opportunity.extractedBudget}</p> : null}
              {opportunity.extractedDeadline ? <p><strong>Deadline:</strong> {opportunity.extractedDeadline}</p> : null}
              {opportunity.extractedDeliverables ? <p><strong>Deliverables:</strong> {opportunity.extractedDeliverables}</p> : null}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Qualification du contact</h2>
            <p className="mt-1 text-xs text-slate-500">
              Choisis Agence ou Marque, puis Enregistrer.
              Pour une marque en direct : sélectionne la fiche CRM (ou crée-la)
              pour éviter les doublons. Agence absente du cycle → Prospection
              Agences. Obligatoire avant de rédiger.
            </p>
            <div className="mt-3 space-y-2">
              <div>
                <label className="mb-1 block text-xs text-slate-500">Type de contact</label>
                <select
                  value={qualifKind}
                  onChange={(e) => {
                    const kind = e.target.value as "" | "MARQUE" | "AGENCE";
                    setQualifKind(kind);
                    if (kind !== "AGENCE") setQualifAgence("");
                    if (kind !== "MARQUE") {
                      setSelectedCrm(null);
                      setMarqueSearch("");
                    } else if (!selectedCrm) {
                      setMarqueSearch(opportunity.extractedBrand || "");
                    }
                  }}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="">Non qualifié</option>
                  <option value="MARQUE">Marque en direct</option>
                  <option value="AGENCE">Agence</option>
                </select>
              </div>
              {qualifKind === "AGENCE" && (
                <div>
                  <label className="mb-1 block text-xs text-slate-500">
                    Nom de l&apos;agence *
                  </label>
                  <input
                    type="text"
                    list="agency-options"
                    value={qualifAgence}
                    onChange={(e) => setQualifAgence(e.target.value)}
                    placeholder="Écris le nom ou choisis dans la liste (ex: WOO, Heaven…)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                  />
                  <datalist id="agency-options">
                    {agencyOptions.map((a) => (
                      <option key={a.id} value={a.name} />
                    ))}
                  </datalist>
                  {!qualifAgence.trim() ? (
                    <p className="mt-1 text-xs text-amber-600">
                      Le nom de l&apos;agence est obligatoire pour enregistrer.
                    </p>
                  ) : matchedAgency ? (
                    <p className="mt-1 text-xs text-emerald-700">
                      Agence connue : la fiche {matchedAgency.name} sera réutilisée.
                    </p>
                  ) : (
                    <p className="mt-1 text-xs text-slate-500">
                      Nouvelle agence : la fiche « {qualifAgence.trim()} » sera créée.
                    </p>
                  )}
                </div>
              )}
              {qualifKind === "MARQUE" && (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      Marché CRM *
                    </label>
                    <div className="flex flex-wrap gap-1.5">
                      {(
                        [
                          { id: "BOTH", label: "FR + BE" },
                          { id: "BENELUX", label: "🇧🇪 BE uniquement" },
                        ] as const
                      ).map((opt) => {
                        const active = qualifMarket === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setQualifMarket(opt.id);
                              setSelectedCrm(null);
                            }}
                            className={`rounded-lg border px-2.5 py-1.5 text-xs font-medium transition-colors ${
                              active
                                ? "border-slate-900 bg-slate-900 text-white"
                                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                    <p className="mt-1 text-[11px] text-slate-500">
                      Par défaut FR+BE (les deux CRM). Choisis BE uniquement si
                      la marque est clairement belgo/néerlandaise.
                    </p>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-slate-500">
                      Marque CRM *
                    </label>
                    {selectedCrm ? (
                      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2">
                        <span className="min-w-0 flex-1 text-sm font-medium text-emerald-900">
                          {selectedCrm.nom}
                          <span className="ml-1 text-[10px] font-semibold uppercase opacity-70">
                            {selectedCrm.source === "BENELUX" ? "BE" : "FR"}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={clearCrmMarque}
                          className="text-xs font-medium text-emerald-800 underline hover:text-emerald-950"
                        >
                          Changer
                        </button>
                      </div>
                    ) : (
                      <div className="relative">
                        <input
                          type="text"
                          value={marqueSearch}
                          onChange={(e) => {
                            setMarqueSearch(e.target.value);
                            if (selectedCrm) clearCrmMarque();
                          }}
                          placeholder={
                            opportunity.extractedBrand
                              ? `Cherche « ${opportunity.extractedBrand} » dans le CRM…`
                              : "Cherche une marque dans le CRM…"
                          }
                          className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                        />
                        {marqueSuggestions.length > 0 && (
                          <ul className="absolute z-20 left-0 right-0 top-full mt-1 max-h-56 overflow-y-auto rounded-lg border border-slate-200 bg-white shadow-lg">
                            {marqueSuggestions.map((m) => (
                              <li key={`${m.source}-${m.id}`}>
                                <button
                                  type="button"
                                  onClick={() => pickCrmMarque(m)}
                                  className="w-full px-3 py-2 text-left text-sm hover:bg-slate-50"
                                >
                                  <span className="font-medium text-slate-900">
                                    {m.nom}
                                  </span>
                                  <span className="ml-1 text-[10px] font-semibold uppercase text-slate-400">
                                    {m.source === "BENELUX" ? "BE" : "FR"}
                                  </span>
                                  {m.raisonSociale ? (
                                    <span className="mt-0.5 block text-xs text-slate-500">
                                      {m.raisonSociale}
                                    </span>
                                  ) : null}
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                      </div>
                    )}
                    {!selectedCrm ? (
                      <div className="mt-2 flex flex-wrap items-center gap-2">
                        <p className="text-xs text-amber-600">
                          Sélectionne une fiche existante — obligatoire pour enregistrer.
                        </p>
                        <button
                          type="button"
                          onClick={() => setCreateMarqueOpen(true)}
                          className="inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Plus className="h-3 w-3" />
                          Créer
                          {qualifMarket === "BENELUX" ? " (BE)" : " (FR+BE)"}
                          {opportunity.extractedBrand
                            ? ` « ${opportunity.extractedBrand} »`
                            : ""}
                        </button>
                      </div>
                    ) : (
                      <p className="mt-1 text-xs text-emerald-700">
                        Fiche CRM sélectionnée — pas de doublon.
                      </p>
                    )}
                  </div>
                </div>
              )}
              <div>
                <label className="mb-1 block text-xs text-slate-500">Langue du contact</label>
                <select
                  value={qualifLanguage}
                  onChange={(e) => setQualifLanguage(e.target.value === "en" ? "en" : "fr")}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm"
                >
                  <option value="fr">Français</option>
                  <option value="en">Anglais</option>
                </select>
              </div>
              <button
                type="button"
                disabled={
                  qualifSaving ||
                  (qualifKind !== "MARQUE" && qualifKind !== "AGENCE") ||
                  (qualifKind === "AGENCE" && !qualifAgence.trim()) ||
                  (qualifKind === "MARQUE" && !selectedCrm) ||
                  (!qualifDirty && qualificationReady)
                }
                onClick={() => void commitQualification()}
                className="w-full rounded-lg bg-[#C8F285] px-3 py-2 text-sm font-semibold text-[#1A1110] disabled:opacity-50"
              >
                {qualifSaving
                  ? "Enregistrement…"
                  : !qualifDirty && qualificationReady
                    ? "Enregistré"
                    : "Enregistrer"}
              </button>
              {qualificationReady && qualifFiche ? (
                <p className="text-xs text-emerald-700">
                  Contact sur la fiche {qualifFiche.kind === "AGENCE" ? "agence" : "marque"}{" "}
                  <strong>{qualifFiche.label}</strong>
                  {qualifFiche.href ? (
                    <>
                      {" "}
                      —{" "}
                      <Link href={qualifFiche.href} className="underline hover:text-emerald-900">
                        ouvrir
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : (
                <p className="text-xs text-amber-700">
                  Qualifie et enregistre le contact pour pouvoir rédiger un mail.
                </p>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <h2 className="font-semibold text-slate-900">Talent contacte</h2>
            <p className="mt-2 text-sm text-slate-700">{opportunity.talentName}</p>
            {opportunity.talentId ? (
              <Link href={`/talents/${opportunity.talentId}`} className="text-xs text-slate-500 underline">Voir la fiche talent</Link>
            ) : null}
          </div>

          {recentSends && (recentSends.sameEmail.length > 0 || recentSends.sameDomain.length > 0) && (
            <div className="space-y-2">
              {recentSends.sameEmail.length > 0 && (
                <div className="rounded-xl border border-red-300 bg-red-50 p-4 text-sm">
                  <p className="font-semibold text-red-800">
                    ⚠️ Déjà contacté il y a {daysSince(recentSends.sameEmail[0].sentAt)} jours
                  </p>
                  <p className="mt-1 text-red-700">
                    Tu as déjà envoyé un mail à <strong>{recentSends.sameEmail[0].senderEmail}</strong> dans les {recentSends.windowDays} derniers jours.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-red-700">
                    {recentSends.sameEmail.slice(0, 3).map((s) => (
                      <li key={s.id}>
                        <Link href={`/inbound/${s.id}`} className="underline hover:text-red-900">
                          {new Date(s.sentAt).toLocaleDateString("fr-FR")} — {s.subject || "(sans objet)"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {recentSends.sameDomain.length > 0 && (
                <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm">
                  <p className="font-semibold text-amber-800">
                    ℹ️ Marque déjà contactée il y a {daysSince(recentSends.sameDomain[0].sentAt)} jours
                  </p>
                  <p className="mt-1 text-amber-700">
                    Un mail a déjà été envoyé à un autre contact du domaine <strong>@{recentSends.sameDomain[0].senderDomain}</strong>.
                  </p>
                  <ul className="mt-2 space-y-1 text-xs text-amber-700">
                    {recentSends.sameDomain.slice(0, 3).map((s) => (
                      <li key={s.id}>
                        <Link href={`/inbound/${s.id}`} className="underline hover:text-amber-900">
                          {new Date(s.sentAt).toLocaleDateString("fr-FR")} — {s.senderEmail} — {s.subject || "(sans objet)"}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {(canAct || canDelete) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              {canAct && (
                <>
                  <button
                    disabled={submitting || !canCompose}
                    onClick={() => setComposerOpen(true)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700 disabled:opacity-60"
                  >
                    Rediger un mail
                  </button>
                  {!canCompose ? (
                    <p className="mt-2 text-xs text-amber-700">
                      Enregistre d&apos;abord la qualification du contact (bouton Enregistrer).
                    </p>
                  ) : null}
                </>
              )}
              {canDelete && (
                <button
                  disabled={submitting}
                  onClick={removeOpportunity}
                  className={`${canAct ? "mt-2" : ""} w-full rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-sm font-medium text-red-700 disabled:opacity-60`}
                >
                  Supprimer definitivement
                </button>
              )}
            </div>
          )}
        </aside>
      </div>

      {composerOpen && (
        <div className="fixed inset-0 z-[160] flex items-center justify-center bg-black/45 p-4">
          <div className="w-full max-w-6xl max-h-[90vh] overflow-y-auto rounded-xl border border-slate-200 bg-white p-4 shadow-xl">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-semibold text-slate-900">Rédiger un mail</h3>
              <button
                type="button"
                onClick={() => setComposerOpen(false)}
                className="rounded-md border border-slate-300 px-3 py-1 text-sm text-slate-700"
              >
                Fermer
              </button>
            </div>
            {recentSends && (recentSends.sameEmail.length > 0 || recentSends.sameDomain.length > 0) && (
              <div className="mb-3 space-y-2">
                {recentSends.sameEmail.length > 0 && (
                  <div className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-xs text-red-800">
                    <strong>⚠️ Attention :</strong> tu as déjà envoyé un mail à{" "}
                    <strong>{recentSends.sameEmail[0].senderEmail}</strong> il y a{" "}
                    {daysSince(recentSends.sameEmail[0].sentAt)} jours
                    {recentSends.sameEmail.length > 1
                      ? ` (${recentSends.sameEmail.length} fois au total dans les ${recentSends.windowDays} derniers jours)`
                      : ""}
                    .
                  </div>
                )}
                {recentSends.sameDomain.length > 0 && recentSends.sameEmail.length === 0 && (
                  <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                    <strong>ℹ️ Info :</strong> un mail a déjà été envoyé à un autre contact de{" "}
                    <strong>@{recentSends.sameDomain[0].senderDomain}</strong> il y a{" "}
                    {daysSince(recentSends.sameDomain[0].sentAt)} jours.
                  </div>
                )}
              </div>
            )}
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
              <div className="space-y-2 lg:col-span-1">
                <h4 className="text-sm font-semibold text-slate-800">Talents</h4>
                {talentsError && <p className="text-xs text-red-600">{talentsError}</p>}
                <div className="max-h-[62vh] space-y-2 overflow-y-auto pr-1">
                  {loadingTalents ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement...
                    </div>
                  ) : (
                    talents.map((t) => {
                      const selected = selectedIds.has(t.id);
                      return (
                        <button
                          key={t.id}
                          type="button"
                          onClick={() => toggleTalent(t.id)}
                          className="w-full rounded-xl border p-2 text-left"
                          style={{ borderColor: selected ? "#C8F285" : "#E2E8F0", backgroundColor: selected ? "#F7FEE7" : "#fff" }}
                        >
                          <div className="flex items-start gap-2">
                            <div className="relative h-12 w-12 overflow-hidden rounded-lg bg-slate-200">
                              {t.photo ? <Image src={t.photo} alt="" fill className="object-cover" sizes="48px" /> : null}
                            </div>
                            <div className="min-w-0 flex-1">
                              <p className="truncate text-sm font-semibold text-slate-900">{t.prenom} {t.nom}</p>
                              <p className="truncate text-xs text-slate-500">{(t.niches || []).join(", ") || "—"}</p>
                              <p className="text-[11px] text-slate-600">IG {t.igFollowers || 0} · TT {t.ttFollowers || 0}</p>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  insertTalentInMail(t);
                                }}
                                className="mt-1 text-[11px] text-slate-700 underline"
                              >
                                Insérer dans le mail
                              </button>
                              {t.instagram ? (
                                <a
                                  href={getInstagramProfileUrl(t.instagram) || "#"}
                                  target="_blank"
                                  rel="noreferrer"
                                  onClick={(e) => e.stopPropagation()}
                                  className="text-[11px] text-blue-600 underline"
                                >
                                  Instagram
                                </a>
                              ) : null}
                            </div>
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
              <div className="lg:col-span-2">
                <div className="mb-3 flex justify-end">
                  <button
                    type="button"
                    onClick={insertSelectedTalentsInMail}
                    disabled={selectedTalentsRaw.length === 0}
                    className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-700 disabled:opacity-50"
                  >
                    Insérer tous les talents sélectionnés
                  </button>
                </div>
                <EmailComposer
                  subject={composerSubject}
                  onSubjectChange={setComposerSubject}
                  language={emailLanguage}
                  onLanguageChange={setEmailLanguage}
                  brandName={opportunity.extractedBrand || opportunity.senderDomain}
                  brandResearch={brandResearch}
                  onBrandResearch={() => {
                    void runBrandResearch();
                  }}
                  isResearching={isResearching}
                  talentsSelected={selectedTalents}
                  isGenerating={isGenerating}
                  onGenerate={() => {
                    void runGenerateEmail();
                  }}
                  editor={composerEditor}
                  talentInsertMode="instagram"
                />
              </div>
            </div>

            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  void saveDraft({
                    subject: composerSubject,
                    bodyHtml: composerEditor?.getHTML() || "",
                  }).catch((e: unknown) => {
                    const msg = e instanceof Error ? e.message : "Erreur sauvegarde brouillon";
                    showToast(msg, "error");
                  });
                }}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
                disabled={sendingFromLeyna || sendingTest}
              >
                Enregistrer brouillon
              </button>
              <button
                type="button"
                onClick={() => void sendTestToSelf()}
                disabled={sendingFromLeyna || sendingTest}
                className="rounded-lg border border-[#C08B8B] bg-white px-3 py-2 text-sm font-medium text-[#1A1110] disabled:opacity-60"
                title="Envoie le mail de test à ton adresse, sans changer le statut de l'opportunité"
              >
                {sendingTest ? "Envoi test..." : "✉️ M'envoyer un test"}
              </button>
              <button
                type="button"
                onClick={() => void sendFromLeyna()}
                disabled={sendingFromLeyna || sendingTest || recentSendBlocked}
                className="rounded-lg bg-[#C8F285] px-3 py-2 text-sm font-semibold text-[#1A1110] disabled:opacity-60"
                title={recentSendBlocked ? recentSendBlockedMessage : undefined}
              >
                {recentSendBlocked
                  ? "⛔ Envoi bloqué (déjà contacté)"
                  : sendingFromLeyna
                    ? "Envoi en cours..."
                    : "🚀 Envoyer depuis Leyna"}
              </button>
            </div>
          </div>
        </div>
      )}
      <QuickMarqueModal
        isOpen={createMarqueOpen}
        onClose={() => setCreateMarqueOpen(false)}
        defaultNom={marqueSearch.trim() || opportunity?.extractedBrand || ""}
        market={qualifMarket}
        onCreated={(marque) => {
          if (marque.market === "BENELUX") {
            const pick: CrmPick = {
              source: "BENELUX",
              id: marque.id,
              nom: marque.nom,
              linkedMarqueId: marque.linkedMarqueId ?? null,
            };
            setCrmBeCompanies((prev) =>
              prev.some((m) => m.id === pick.id)
                ? prev
                : [...prev, pick].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
            );
            pickCrmMarque(pick);
          } else {
            const pick: CrmPick = {
              source: "FR",
              id: marque.id,
              nom: marque.nom,
            };
            setCrmMarques((prev) =>
              prev.some((m) => m.id === pick.id)
                ? prev
                : [...prev, pick].sort((a, b) => a.nom.localeCompare(b.nom, "fr"))
            );
            pickCrmMarque(pick);
          }
          setCreateMarqueOpen(false);
        }}
      />
    </div>
  );
}
