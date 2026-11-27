"use client";

/**
 * Carto Cannes Partenaires — même UX que /lab/carto-pipeline2,
 * prompt CANNES_CARTO + APIs /api/cannes-partenaires/carto/*.
 * Ne modifie PAS le lab carto-pipeline2.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";
import type { CartoChatMarket } from "@/lib/carto-chat-vps/chat-prompt";
import { isCannesCartoChatVpsJob } from "@/lib/carto-chat-vps/job-kind";
import type { CartoChatVpsPreviewResult } from "@/lib/carto-chat-vps/types";
import { BrandEnrichPanel } from "@/components/enrichissement/BrandEnrichPanel";
import { portfolioDisplayName } from "@/lib/marque-portfolio";
import { buildCannesCartoResearchPrompt } from "@/lib/cannes-partenaires/carto-prompt";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";

type ContactCouche = "marque" | "agence" | "autre";
type FicheMarket = "FR" | "BENELUX" | "BOTH";
/** FR : fiche France uniquement. FR+BE : mirroir. BE seul : pas d’assign FR. */
type PipelinePhase =
  | "carto_fr"
  | "enrich_fr"
  | "carto_be"
  | "enrich_be"
  | "assign";

type CommitResult = {
  marqueId: string;
  company: string;
  market?: FicheMarket;
  fichePath?: string;
  marqueIdBe?: string;
  fichePathBe?: string;
  created: number;
  skipped: number;
  emailsAuto: number;
  queued: number;
  enrolled: number;
  cannesOpportunite?: {
    opportuniteId: string;
    created: boolean;
    nomMarque: string;
    contactsCopied: number;
  };
};

type PortfolioOwner = {
  id: string;
  prenom: string;
  nom: string;
  email: string;
  role: string;
};

export default function CannesPartenairesCartoPage() {
  const { data: session, status } = useSession();
  const allowed = canAccessCannesPartenaires(session?.user?.role);

  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  /** Cannes Partenaires : France uniquement (pas de sélecteur FR/BE). */
  // Objet + cast : sinon TS narrow `"FR"` et casse les branches BENELUX/BOTH mortes.
  const ficheMarket: FicheMarket = (
    { market: "FR" } as { market: FicheMarket }
  ).market;
  const [ficheQuery, setFicheQuery] = useState("");
  const [marqueId, setMarqueId] = useState<string | null>(null);
  const [marqueNom, setMarqueNom] = useState<string | null>(null);
  const [creatingFiche, setCreatingFiche] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingHint, setLoadingHint] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  /** Runs VPS parallèles (bandeau) */
  const [vpsRuns, setVpsRuns] = useState<
    {
      endMarker: string;
      companyHint: string;
      state: string;
      answerChars: number;
      error?: string | null;
    }[]
  >([]);
  /** Santé ChatGPT VPS — visible (connecté / déconnecté). */
  const [chatStatus, setChatStatus] = useState<{
    configured: boolean;
    ok: boolean;
    loggedIn: boolean;
    reason?: string | null;
    error?: string | null;
    checkedAt: number;
  } | null>(null);
  /** Dernier jeton lancé via Analyse — pour « Analyser l’écran » ciblé. */
  const [lastEndMarker, setLastEndMarker] = useState<string | null>(null);
  const [preview, setPreview] = useState<CartoChatVpsPreviewResult | null>(
    null
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  /** Commit Benelux (étape 3) — séparé pour garder les ids FR du premier commit. */
  const [beCommitResult, setBeCommitResult] = useState<CommitResult | null>(
    null
  );
  const [pipelinePhase, setPipelinePhase] =
    useState<PipelinePhase>("carto_fr");
  const [portfolioOwners, setPortfolioOwners] = useState<PortfolioOwner[]>(
    []
  );
  const [assignPick, setAssignPick] = useState<string>("");
  const [assigning, setAssigning] = useState(false);
  const [assignedLabel, setAssignedLabel] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/marques/portfolio-owners");
        const data = await res.json().catch(() => ({}));
        if (!res.ok || cancelled) return;
        const owners = Array.isArray(data.owners)
          ? (data.owners as PortfolioOwner[])
          : [];
        if (!cancelled) setPortfolioOwners(owners);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    try {
      const fromUrl = new URLSearchParams(window.location.search)
        .get("company")
        ?.trim();
      if (fromUrl) setCompany(fromUrl);
    } catch {
      /* ignore */
    }
  }, []);

  // Pas de recherche fiche CRM / Benelux sur Cannes — destination = nom analysé.

  const rows = preview?.contacts || [];
  const primaryAgency =
    preview?.agencies?.find((a) => a.primary)?.name ||
    preview?.agencies?.[0]?.name ||
    null;

  function contactCouche(c: CartoAiContactCandidate): ContactCouche {
    const p = (c.perimetre || "").toLowerCase();
    const autre = p.match(/autre\s*agence\s*(.*)/i);
    if (autre) {
      const name = (autre[1] || "").trim();
      // Une seule agence citée / = primary → colonne Agence, pas "Autres"
      if (
        !primaryAgency ||
        !name ||
        name.includes(primaryAgency.toLowerCase().slice(0, 4)) ||
        primaryAgency.toLowerCase().includes(name.slice(0, 4))
      ) {
        return "agence";
      }
      return "autre";
    }
    if (primaryAgency && p.includes(primaryAgency.toLowerCase())) {
      return "agence";
    }
    if (/^agence\b|\bagence\b/.test(p)) return "agence";
    return "marque";
  }

  /** P1 → P4 (puis sans prio) — pour le classement dans chaque colonne. */
  function priorityRank(p: string | null | undefined): number {
    const s = String(p || "").toUpperCase();
    if (s.includes("P1")) return 0;
    if (s.includes("P2")) return 1;
    if (s.includes("P3")) return 2;
    if (s.includes("P4")) return 3;
    return 4;
  }

  const grouped = useMemo(() => {
    const map: Record<
      ContactCouche,
      Array<{ c: CartoAiContactCandidate; i: number }>
    > = { marque: [], agence: [], autre: [] };
    rows.forEach((c, i) => {
      map[contactCouche(c)].push({ c, i });
    });
    for (const key of Object.keys(map) as ContactCouche[]) {
      map[key].sort((a, b) => {
        const d = priorityRank(a.c.priorite) - priorityRank(b.c.priorite);
        if (d !== 0) return d;
        return a.i - b.i;
      });
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, primaryAgency]);

  const selectedRows = useMemo(
    () => rows.filter((_, i) => selected[String(i)]),
    [rows, selected]
  );

  function rowKey(c: CartoAiContactCandidate, i: number): string {
    return `${i}:${c.marche}:${c.prenom || ""}:${c.nom}:${c.linkedinUrl || ""}`;
  }

  function applyPreview(result: CartoChatVpsPreviewResult) {
    setPreview(result);
    const next: Record<string, boolean> = {};
    result.contacts.forEach((_, i) => {
      next[String(i)] = true;
    });
    setSelected(next);
    // Cannes isolé : pas de fiche CRM — destination = pipeline Cannes (création / rattachement par nom).
    const nom = (result.company || company).trim();
    if (nom) {
      setMarqueId(null);
      setMarqueNom(nom);
      setFicheQuery(nom);
      setCreatingFiche(true);
    }
  }

  async function refreshChatStatus() {
    try {
      const hRes = await fetch("/api/cannes-partenaires/carto/health", {
        cache: "no-store",
      });
      const h = (await hRes.json().catch(() => ({}))) as {
        configured?: boolean;
        ok?: boolean;
        loggedIn?: boolean;
        needsLogin?: boolean;
        blocked?: { reason?: string } | null;
        error?: string;
      };
      setChatStatus({
        configured: h.configured !== false,
        ok: Boolean(h.ok),
        loggedIn: Boolean(h.loggedIn),
        reason:
          h.blocked?.reason ||
          (h.needsLogin || h.loggedIn === false ? "login-wall" : null),
        error: h.error || null,
        checkedAt: Date.now(),
      });
      return h;
    } catch (e) {
      setChatStatus({
        configured: true,
        ok: false,
        loggedIn: false,
        reason: "unreachable",
        error: e instanceof Error ? e.message : "VPS injoignable",
        checkedAt: Date.now(),
      });
      return null;
    }
  }

  useEffect(() => {
    if (!allowed) return;
    void refreshChatStatus();
    const t = window.setInterval(() => void refreshChatStatus(), 20_000);
    return () => window.clearInterval(t);
  }, [allowed]);

  async function runPreview() {
    /** Suite FR→BE : on garde commitResult / fiche BE. Sinon reset. */
    const continuingFromFr =
      pipelinePhase === "carto_be" && Boolean(commitResult?.marqueIdBe);
    const market: CartoChatMarket =
      continuingFromFr || ficheMarket === "BENELUX" ? "BENELUX" : "FR";

    setError(null);

    const health = await refreshChatStatus();
    if (health && health.loggedIn === false) {
      setError(
        "ChatGPT déconnecté sur le VPS Contabo — reconnecte la session Chrome CDP, puis relance."
      );
      return;
    }

    setLoading(true);
    setLoadingHint(
      market === "BENELUX" ? "Analyse Benelux en cours" : "Analyse en cours"
    );
    setPreview(null);
    setSelected({});
    if (continuingFromFr) {
      setPipelinePhase("carto_be");
    } else {
      setCommitResult(null);
      setBeCommitResult(null);
      setMarqueId(null);
      setMarqueNom(null);
      setFicheQuery("");
      setCreatingFiche(false);
      setPipelinePhase(market === "BENELUX" ? "carto_be" : "carto_fr");
    }
    try {
      const chatPrompt = buildCannesCartoResearchPrompt({
        marque: company.trim(),
        market,
      });

      // 1) Lance Chat en async (réponse HTTP immédiate — plus de cutoff navigateur)
      const startRes = await fetch("/api/cannes-partenaires/carto/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          domain: domain.trim() || undefined,
          language,
          mode: "vps_start",
          chatPrompt,
        }),
      });
      const startData = (await startRes.json().catch(() => ({}))) as {
        error?: string;
        startedAt?: number;
        promptPreview?: string;
        company?: string;
        endMarker?: string;
      };
      if (!startRes.ok && startRes.status !== 202) {
        throw new Error(startData.error || "Impossible de lancer Chat");
      }

      // 2) Poll jusqu’au jeton Chat (pas de timeout tant que le job tourne)
      let idleDeadline = Date.now() + 30 * 60_000;
      const ourStartedAt = Number(startData.startedAt || Date.now());
      /** Jeton unique de CE lancement (même marque → nouvel id à chaque Analyse). */
      const ourEndMarker = String(startData.endMarker || "").trim();
      if (!ourEndMarker) {
        throw new Error(
          "Marker de fin manquant au lancement — impossible de distinguer l’ancien fil"
        );
      }
      setLastEndMarker(ourEndMarker);
      let sawRunning = false;
      let lastChars = 0;
      let peakChars = 0;
      let lastStructureErr = "";
      /** Chars à l’écran au lancement — pour ignorer l’ancien GLOWUP_CART_DONE. */
      let baselineChars = -1;
      let sawFreshAnswer = false;

      const tryStructure = async (): Promise<boolean> => {
        setLoadingHint("Classement des contacts");
        const rescue = await fetch("/api/cannes-partenaires/carto/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: company.trim(),
            domain: domain.trim() || undefined,
            language,
            market,
            mode: "read_screen",
            // Toujours LE jeton de CE run (jamais un ancien)
            endMarker: ourEndMarker || undefined,
          }),
        });
        const data = await rescue.json().catch(() => ({}));
        if (!rescue.ok) {
          const err = (data as { error?: string }).error || "";
          lastStructureErr = err;
          setLoadingHint("Analyse en cours");
          // Ancien fil / mauvaise marque / mauvais jeton → on continue d'attendre
          if (
            /autre marque|ne mentionne pas|relance|marker manquant|encore ancienne/i.test(
              err
            )
          ) {
            return false;
          }
          // Crédits OpenAI / clé → stop tout de suite (sinon timeout trompeur)
          if (/credit|quota|billing|openai|api key|OPENAI/i.test(err)) {
            throw new Error(err);
          }
          throw new Error(err || "Échec analyse");
        }
        const result = data as CartoChatVpsPreviewResult;
        if (!result.contacts?.length) {
          lastStructureErr = "Réponse lue mais 0 contact extrait (API / parse)";
          setLoadingHint("Analyse en cours");
          return false;
        }
        applyPreview(result);
        return true;
      };

      while (Date.now() < idleDeadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const hRes = await fetch("/api/cannes-partenaires/carto/health", {
          cache: "no-store",
        });
        const h = (await hRes.json().catch(() => ({}))) as {
          busy?: boolean;
          lastAnswerChars?: number;
          hasEndMarker?: boolean;
          endMarker?: string | null;
          slots?: { total?: number; free?: number; busy?: number };
          job?: {
            state?: string;
            error?: string | null;
            answerChars?: number;
            startedAt?: number;
            promptPreview?: string;
            endMarker?: string;
            hasCertifiedAnswer?: boolean;
            companyHint?: string;
          };
          jobs?: {
            state?: string;
            error?: string | null;
            answerChars?: number;
            startedAt?: number;
            promptPreview?: string;
            endMarker?: string;
            hasCertifiedAnswer?: boolean;
            companyHint?: string;
            kind?: string;
          }[];
          error?: string;
        };

        // Bandeau : jobs carto seulement (pas Fil outreach mail / roster)
        if (Array.isArray(h.jobs)) {
          setVpsRuns(
            h.jobs
              .filter(
                (j) =>
                  ["queued", "running", "done", "error"].includes(
                    String(j.state || "")
                  ) &&
                  isCannesCartoChatVpsJob({
                    promptPreview: j.promptPreview,
                    companyHint: j.companyHint,
                    kind: j.kind,
                  })
              )
              .slice(0, 8)
              .map((j) => ({
                endMarker: String(j.endMarker || ""),
                companyHint: String(
                  j.companyHint || j.promptPreview || ""
                ).slice(0, 40),
                state: String(j.state || ""),
                answerChars: Number(j.answerChars || 0),
                error: j.error,
              }))
          );
        }

        // ★ Job de CE run (parallèle) — pas seulement le « primary »
        const ourJob =
          (h.jobs || []).find((j) => j.endMarker === ourEndMarker) ||
          (h.job?.endMarker === ourEndMarker ? h.job : undefined);

        const jobState =
          ourJob?.state ||
          (h.job?.endMarker === ourEndMarker ? h.job.state : undefined) ||
          "idle";
        const markerMatches = Boolean(ourJob);
        const jobIsOurs = markerMatches;

        if (
          (jobState === "running" || jobState === "queued") &&
          jobIsOurs
        ) {
          sawRunning = true;
          // Tant que Chat tourne : pas de timeout lab (suit le VPS jusqu’au jeton)
          idleDeadline = Date.now() + 30 * 60_000;
        }

        const screenChars = Number(h.lastAnswerChars || 0);
        const jobChars = Number(ourJob?.answerChars || 0);
        const chars = Math.max(jobChars, jobIsOurs ? jobChars : 0);

        if (jobState === "error" && jobIsOurs) {
          const certified =
            Boolean(ourJob?.hasCertifiedAnswer) ||
            (h.hasEndMarker && h.endMarker === ourEndMarker);
          // Ancrages trop stricts / faux rejet : si le texte est long, classer quand même
          const recoverable =
            certified ||
            (Number(ourJob?.answerChars || 0) >= 8000 &&
              /ancrages livrable/i.test(String(ourJob?.error || "")));
          if (recoverable && (await tryStructure())) return;
          throw new Error(ourJob?.error || "Erreur Chat VPS");
        }
        if (baselineChars < 0) {
          baselineChars = screenChars;
          peakChars = jobChars || screenChars;
          lastChars = jobChars || screenChars;
        }
        // Nouveau fil : job qui génère vraiment (parallèle = ne pas se fier à l'écran global)
        if (
          (jobIsOurs && jobState === "running" && jobChars >= 200) ||
          (jobIsOurs && jobState === "done") ||
          (jobIsOurs && jobState === "queued")
        ) {
          sawFreshAnswer = true;
        }
        if (chars > peakChars + 60) {
          peakChars = chars;
        }
        lastChars = chars;

        if (jobIsOurs && (jobState === "running" || jobState === "queued")) {
          setLoadingHint(
            jobState === "queued"
              ? `En file — ${company.trim()}`
              : `Analyse Cannes · ${company.trim()}`
          );
        }

        const ourCertified = Boolean(ourJob?.hasCertifiedAnswer);

        // Fin de CE run
        if (
          jobIsOurs &&
          sawFreshAnswer &&
          (ourCertified ||
            (jobState === "done" &&
              !ourJob?.error &&
              (ourCertified ||
                (h.hasEndMarker && h.endMarker === ourEndMarker) ||
                jobChars >= 1200)))
        ) {
          if (await tryStructure()) return;
        }

        void ourStartedAt;
        void lastChars;
      }

      if (await tryStructure()) return;
      throw new Error(
        lastStructureErr
          ? `Timeout: ${lastStructureErr}`
          : "Timeout: pas de contacts — réessaie Analyse (ou Analyser l’écran si Chat a fini)"
      );
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Erreur";
      setError(
        /failed to fetch|networkerror|load failed/i.test(msg)
          ? "Connexion coupée (Failed to fetch) — souvent 3 lancés d’un coup ou sync VPS en cours. Relance la marque."
          : msg
      );
    } finally {
      setLoading(false);
      setLoadingHint(null);
    }
  }

  /** Structure la réponse déjà affichée dans Chrome VPS (sans renvoyer). */
  async function runReadScreen() {
    setError(null);
    setLoading(true);
    setLoadingHint("Analyse en cours");
    try {
      const companyKey = company.trim().toLowerCase();
      const hintMatch = (hintRaw: string) => {
        const hint = hintRaw.toLowerCase().replace(/\*+/g, "").trim();
        if (!hint || !companyKey) return false;
        return hint.includes(companyKey) || companyKey.includes(hint);
      };

      // Santé VPS : retrouver le jeton done de CETTE marque (après reload / parallèle)
      let endMarker = lastEndMarker || undefined;
      if (!endMarker) {
        const hRes = await fetch("/api/cannes-partenaires/carto/health", {
          cache: "no-store",
        });
        const h = (await hRes.json().catch(() => ({}))) as {
          jobs?: {
            endMarker?: string;
            companyHint?: string;
            promptPreview?: string;
            kind?: string;
            state?: string;
            hasCertifiedAnswer?: boolean;
            finishedAt?: number;
            startedAt?: number;
          }[];
        };
        const candidates = (h.jobs || [])
          .filter(
            (j) =>
              j.state === "done" &&
              j.endMarker &&
              isCannesCartoChatVpsJob({
                promptPreview: j.promptPreview,
                companyHint: j.companyHint,
                kind: j.kind,
              }) &&
              hintMatch(String(j.companyHint || ""))
          )
          .sort(
            (a, b) =>
              Number(b.finishedAt || b.startedAt || 0) -
              Number(a.finishedAt || a.startedAt || 0)
          );
        endMarker = candidates[0]?.endMarker || undefined;
      }
      if (!endMarker) {
        const fromRuns = vpsRuns.find(
          (r) => r.state === "done" && r.endMarker && hintMatch(r.companyHint)
        );
        endMarker = fromRuns?.endMarker;
      }
      if (!endMarker) {
        throw new Error(
          "Aucun jeton pour cette marque — relance Analyse (évite de lire une autre marque en parallèle)"
        );
      }
      setLastEndMarker(endMarker);

      const readMarket: CartoChatMarket =
        pipelinePhase === "carto_be" || ficheMarket === "BENELUX"
          ? "BENELUX"
          : "FR";
      const res = await fetch("/api/cannes-partenaires/carto/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          domain: domain.trim() || undefined,
          language,
          market: readMarket,
          mode: "read_screen",
          endMarker,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec lecture écran");
      applyPreview(data as CartoChatVpsPreviewResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
      setLoadingHint(null);
    }
  }

  async function runCommit() {
    if (!preview || selectedRows.length === 0) return;
    const frBeContinuation =
      pipelinePhase === "carto_be" &&
      Boolean(commitResult?.marqueIdBe);
    const targetName = (
      marqueNom ||
      ficheQuery.trim() ||
      preview.company ||
      company
    ).trim();

    const beId = commitResult?.marqueIdBe || null;
    // Cannes isolé : jamais d’id CRM Marques — find-or-create / enroll par nom.
    const commitMarqueId = frBeContinuation ? beId : null;

    if (!targetName) {
      setError(
        frBeContinuation
          ? "Étape 3 : fiche Benelux manquante — reviens à l’enrichissement FR"
          : "Nom de marque requis pour le pipeline Cannes"
      );
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      // FR = France uniquement (plus de coquille BE liée en douce).
      // BOTH = mirroir contacts FR+BE. BENELUX = fiche BE.
      const commitMarket: FicheMarket = frBeContinuation
        ? "BENELUX"
        : ficheMarket === "BENELUX" ||
            (pipelinePhase === "carto_be" && !commitResult?.marqueIdBe)
          ? "BENELUX"
          : ficheMarket === "BOTH"
            ? "BOTH"
            : "FR";

      const res = await fetch("/api/cannes-partenaires/carto/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: targetName,
          // Cannes : pas d’id CRM — sauf continuation Benelux liée.
          marqueId: commitMarqueId || undefined,
          domain: preview.domain || domain.trim() || undefined,
          language,
          market: commitMarket,
          selectedRows,
          skipAutoEnrich: true,
          // Mirroir contacts uniquement si l’utilisateur a choisi FR+BE.
          mirrorBeContacts: commitMarket === "BOTH" ? true : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec enregistrement");
      const result = data as CommitResult;
      if (frBeContinuation || commitMarket === "BENELUX") {
        if (frBeContinuation || commitResult) {
          // Garde les ids FR du premier commit
          setBeCommitResult(result);
          if (!commitResult) setCommitResult(result);
        } else {
          setCommitResult(result);
          setBeCommitResult(result);
        }
        setPipelinePhase("enrich_be");
      } else if (commitMarket === "BOTH" && result.marqueIdBe) {
        // FR+BE : contacts déjà sur les 2 fiches — pas de 2ᵉ carto Benelux
        setCommitResult(result);
        setBeCommitResult({
          ...result,
          marqueId: result.marqueIdBe,
          fichePath: result.fichePathBe || result.fichePath,
          market: "BENELUX",
        });
        setPipelinePhase("enrich_fr");
      } else {
        setCommitResult(result);
        setBeCommitResult(null);
        setPipelinePhase("enrich_fr");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCommitting(false);
    }
  }

  function continueToBeneluxCarto() {
    if (!commitResult?.marqueIdBe) {
      setError("Fiche Benelux non créée — impossible de continuer");
      return;
    }
    setError(null);
    setPreview(null);
    setSelected({});
    setBeCommitResult(null);
    setMarqueId(commitResult.marqueIdBe);
    setMarqueNom(commitResult.company);
    setFicheQuery(commitResult.company);
    setCreatingFiche(false);
    setPipelinePhase("carto_be");
  }

  /** Id marque FR à attribuer (portefeuille = CRM France uniquement). */
  function frMarqueIdForAssign(): string | null {
    if (!commitResult) return null;
    if (ficheMarket === "BENELUX" && !commitResult.marqueIdBe) {
      // Commit BE seul → pas d’assign portefeuille FR
      return null;
    }
    // BOTH / FR : marqueId = FR. Après commit BE, commitResult FR est conservé.
    return commitResult.marqueId || null;
  }

  function goToAssign() {
    const id = frMarqueIdForAssign();
    if (!id) {
      setError(
        "Attribution portefeuille disponible uniquement sur une fiche France"
      );
      return;
    }
    // FR+BE mirroir : pas de 2ᵉ carto. FR seul : pas de passage BE auto.
    // (Ancien parcours « FR → coquille BE » retiré — FR reste sur la fiche France.)
    setError(null);
    setAssignPick("");
    setAssignedLabel(null);
    setPipelinePhase("assign");
  }

  async function runAssign() {
    const id = frMarqueIdForAssign();
    if (!id) {
      setError("Fiche France manquante");
      return;
    }
    if (!assignPick) {
      setError("Choisis Leyna ou Joey");
      return;
    }
    setError(null);
    setAssigning(true);
    try {
      const res = await fetch(`/api/marques/${id}/assign`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          assignedToId: assignPick,
          marqueIdBe: commitResult?.marqueIdBe || undefined,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Attribution impossible");
      }
      const owner = data.assignedTo as PortfolioOwner | undefined;
      const name = owner ? portfolioDisplayName(owner) : "Attribué";
      const onBoth =
        ficheMarket === "BOTH" ||
        data.appliedToBenelux === true ||
        Boolean(commitResult?.marqueIdBe);
      setAssignedLabel(
        onBoth ? `${name} · FR + Benelux (lié)` : name
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAssigning(false);
    }
  }

  function resetPipeline() {
    setPipelinePhase("carto_fr");
    setCommitResult(null);
    setBeCommitResult(null);
    setPreview(null);
    setSelected({});
    setAssignPick("");
    setAssignedLabel(null);
    setError(null);
    clearMarque();
  }

  function clearMarque() {
    setMarqueId(null);
    setMarqueNom(null);
    setCreatingFiche(false);
    setFicheQuery("");
  }

  function ficheMarketLabel(m: FicheMarket = ficheMarket) {
    if (m === "BOTH") return "FR + Benelux";
    if (m === "BENELUX") return "Benelux";
    // fallthrough FR
    return "France";
  }

  if (status === "loading") {
    return <div className="p-8 text-sm text-gray-500">Chargement…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-lg text-red-600">Accès refusé</p>
        <p className="mt-2 text-sm text-gray-500">
          Réservé ADMIN / STRATEGY_PLANNER.
        </p>
      </div>
    );
  }

  if (pipelinePhase === "assign" && commitResult) {
    const frId = frMarqueIdForAssign();
    const dualFiche = Boolean(commitResult.marqueIdBe);
    const beStillTodo = dualFiche && !beCommitResult;
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Cannes Partenaires · carto ·{" "}
            {beStillTodo
              ? "trop tôt — Benelux pas fait"
              : dualFiche
                ? "étape 5 · attribution"
                : "fin · attribution"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Attribuer · {commitResult.company}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {beStillTodo
              ? "L’attribution vient après l’enrichissement Benelux. Reprends l’analyse BE d’abord."
              : dualFiche
                ? "Leyna ou Joey — attribution sur la fiche FR et la fiche Benelux liée."
                : "Portefeuille Leyna ou Joey — les mails sales partiront depuis sa boîte."}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {beStillTodo ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="flex-1 text-sm text-amber-950">
              Ordre : enrich FR → analyse BE (3) → enrich BE (4) → attribution
              (5).
            </p>
            <button
              type="button"
              onClick={continueToBeneluxCarto}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Aller à l’étape 3 · analyse Benelux
            </button>
          </div>
        ) : assignedLabel ? (
          <div className="space-y-4 rounded-xl border border-emerald-200 bg-emerald-50 p-5">
            <p className="text-sm font-medium text-emerald-900">
              Attribué à {assignedLabel}
            </p>
            <div className="flex flex-wrap gap-3">
              {commitResult.fichePath ? (
                <Link
                  href={commitResult.fichePath}
                  className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
                >
                  Ouvrir fiche CRM Cannes
                </Link>
              ) : null}
              {commitResult.fichePathBe ? (
                <Link
                  href={commitResult.fichePathBe}
                  className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800"
                >
                  Ouvrir fiche Benelux
                </Link>
              ) : null}
              <button
                type="button"
                onClick={resetPipeline}
                className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800"
              >
                Nouvelle marque
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-5">
            {!frId ? (
              <p className="text-sm text-gray-600">
                Pas de fiche France à attribuer (parcours Benelux seul).
              </p>
            ) : portfolioOwners.length === 0 ? (
              <p className="text-sm text-gray-600">
                Aucun owner portefeuille trouvé (Leyna / Joey).
              </p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {portfolioOwners.map((o) => {
                  const label = portfolioDisplayName(o);
                  const selected = assignPick === o.id;
                  return (
                    <button
                      key={o.id}
                      type="button"
                      onClick={() => setAssignPick(o.id)}
                      className={`rounded-lg px-4 py-2.5 text-sm font-medium ${
                        selected
                          ? "bg-gray-900 text-white"
                          : "border border-gray-300 text-gray-800 hover:bg-gray-50"
                      }`}
                    >
                      {label}
                    </button>
                  );
                })}
              </div>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={() => void runAssign()}
                disabled={assigning || !assignPick || !frId}
                className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
              >
                {assigning
                  ? "Attribution…"
                  : dualFiche
                    ? "Confirmer · FR + Benelux"
                    : "Confirmer l’attribution"}
              </button>
              <button
                type="button"
                onClick={() =>
                  setPipelinePhase(
                    dualFiche || ficheMarket === "BENELUX"
                      ? "enrich_be"
                      : "enrich_fr"
                  )
                }
                className="text-sm text-gray-600 underline"
              >
                Retour enrichissement
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  const enrichActive =
    (pipelinePhase === "enrich_fr" || pipelinePhase === "enrich_be") &&
    (commitResult || beCommitResult);
  const enrichIsBe = pipelinePhase === "enrich_be";
  const enrichSource = enrichIsBe
    ? beCommitResult ||
      (commitResult?.marqueIdBe
        ? {
            ...commitResult,
            marqueId: commitResult.marqueIdBe,
            fichePath: commitResult.fichePathBe || commitResult.fichePath,
            market: "BENELUX" as FicheMarket,
          }
        : null)
    : commitResult;

  if (enrichActive && enrichSource) {
    // FR → puis BE : après enrich FR, enchaîner analyse BE.
    // FR+BE : contacts déjà mirroirés — on peut attribuer après enrich FR.
    const showContinueBe =
      pipelinePhase === "enrich_fr" &&
      Boolean(commitResult?.marqueIdBe) &&
      ficheMarket !== "BOTH" &&
      !beCommitResult;
    const canAssignFr = Boolean(frMarqueIdForAssign());
    const showFinishAssign =
      canAssignFr &&
      Boolean(beCommitResult) &&
      (pipelinePhase === "enrich_be" ||
        (pipelinePhase === "enrich_fr" && ficheMarket === "BOTH"));

    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Cannes Partenaires · carto · étape {enrichIsBe ? "4" : "2"}
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Enrichissement {enrichIsBe ? "Benelux" : "France"} ·{" "}
            {enrichSource.company}
          </h1>
          {enrichSource.cannesOpportunite ? (
            <p className="mt-1 text-sm text-emerald-700">
              {enrichSource.cannesOpportunite.created
                ? "Ajoutée au pipeline Cannes Partenaires"
                : "Déjà dans le pipeline Cannes Partenaires"}
              {" · "}
              <Link
                href="/cannes-partenaires"
                className="underline hover:text-emerald-900"
              >
                ouvrir le board
              </Link>
            </p>
          ) : null}
          <p className="mt-1 text-sm text-gray-500">
            {enrichSource.created} ajouté(s) · {enrichSource.skipped} déjà
            présents · fiche{" "}
            {enrichIsBe
              ? "Benelux"
              : ficheMarketLabel(enrichSource.market || ficheMarket)}
            {enrichSource.fichePath ? (
              <>
                {" · "}
                <Link
                  href={enrichSource.fichePath}
                  className="underline hover:text-gray-800"
                >
                  {enrichIsBe ||
                  (enrichSource.market || ficheMarket) === "BENELUX"
                    ? "ouvrir Benelux"
                    : "ouvrir CRM Cannes"}
                </Link>
              </>
            ) : null}
            {!enrichIsBe && commitResult?.fichePathBe ? (
              <>
                {" · "}
                <Link
                  href={commitResult.fichePathBe}
                  className="underline hover:text-gray-800"
                >
                  ouvrir Benelux
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        {showContinueBe ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3">
            <p className="flex-1 text-sm text-amber-950">
              Enrichissement FR terminé. Suite : analyse Benelux → enrich BE →
              attribution (FR + BE).
            </p>
            <button
              type="button"
              onClick={continueToBeneluxCarto}
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Continuer · analyse Benelux (étape 3)
            </button>
          </div>
        ) : showFinishAssign ? (
          <div className="flex flex-wrap items-center gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3">
            <p className="flex-1 text-sm text-emerald-950">
              {ficheMarket === "BOTH"
                ? "Contacts déjà sur FR + Benelux — attribue Leyna ou Joey."
                : "Enrichissement Benelux terminé — attribue Leyna ou Joey (FR + Benelux lié)."}
            </p>
            <Link
              href="/cannes-partenaires"
              className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white"
            >
              Terminé → pipeline Cannes
            </Link>
          </div>
        ) : null}

        <BrandEnrichPanel
          marqueId={enrichSource.marqueId}
          market="FR"
          company={enrichSource.company}
          fichePath={enrichSource.fichePath}
          destination="cannes"
          opportuniteId={
            enrichSource.cannesOpportunite?.opportuniteId ||
            (enrichSource.fichePath?.match(/\/crm\/([^/?#]+)/)?.[1] ?? null)
          }
          onBack={() => setPipelinePhase("carto_fr")}
          onCannesComplete={() => {
            const path =
              enrichSource.fichePath?.startsWith("/cannes-partenaires/crm/")
                ? enrichSource.fichePath
                : enrichSource.cannesOpportunite?.opportuniteId
                  ? `/cannes-partenaires/crm/${enrichSource.cannesOpportunite.opportuniteId}`
                  : "/cannes-partenaires?tab=crm";
            window.location.href = path;
          }}
        />
        <div className="pt-2">
          <Link
            href="/cannes-partenaires"
            className="rounded-lg border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-950 hover:bg-amber-100"
          >
            Terminer → pipeline Cannes Partenaires
          </Link>
        </div>
      </div>
    );
  }

  /** Étape 3 : fiche BE déjà créée au commit FR (FR ou FR+BE). */
  const isFrBeBeneluxPass =
    pipelinePhase === "carto_be" && Boolean(commitResult?.marqueIdBe);

  const cartoStepLabel = isFrBeBeneluxPass
    ? "étape 3 · analyse Benelux"
    : ficheMarket === "BOTH"
      ? "étape 1 · analyse France"
      : ficheMarket === "BENELUX"
        ? "étape 1 · analyse Benelux"
        : "étape 1 · analyse France";

  const chatBanner =
    chatStatus == null ? null : !chatStatus.configured ? (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
        ChatGPT VPS non configuré (`CARTO_CHAT_VPS_URL` manquant).
      </div>
    ) : chatStatus.loggedIn ? (
      <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-sm text-emerald-900">
        ChatGPT · connecté
        {chatStatus.checkedAt
          ? ` · vérifié ${new Date(chatStatus.checkedAt).toLocaleTimeString("fr-FR")}`
          : ""}
      </div>
    ) : (
      <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
        <p className="font-medium">ChatGPT · déconnecté</p>
        <p className="mt-0.5 text-red-700/90">
          {chatStatus.error ||
            (chatStatus.reason === "login-wall"
              ? "Session expirée sur le Contabo — reconnecte Chrome CDP."
              : chatStatus.reason === "evaluate-failed" ||
                  chatStatus.reason === "unreachable"
                ? "Chrome/CDP down sur le VPS."
                : `État: ${chatStatus.reason || "inconnu"}`)}
        </p>
      </div>
    );

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      {chatBanner}
      <div>
        <p className="text-xs uppercase tracking-wide text-amber-700">
          Cannes Partenaires · carto · {cartoStepLabel}
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          {isFrBeBeneluxPass
            ? "Benelux → contacts Cannes"
            : "Marque → contacts partenaires Cannes"}
        </h1>
        <p className="mt-1 text-sm text-gray-500">
          <Link href="/cannes-partenaires" className="underline hover:text-gray-800">
            ← Pipeline Cannes Partenaires
          </Link>
        </p>
        {isFrBeBeneluxPass ? (
          <p className="mt-1 text-sm text-gray-500">
            Fiche Benelux liée · {commitResult?.company}
            {commitResult?.fichePathBe ? (
              <>
                {" · "}
                <Link
                  href={commitResult.fichePathBe}
                  className="underline hover:text-gray-800"
                >
                  ouvrir
                </Link>
              </>
            ) : null}
          </p>
        ) : null}
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-gray-700">Marque</span>
            <input
              value={company}
              onChange={(e) => {
                setCompany(e.target.value);
                if (domain.trim()) setDomain("");
              }}
              placeholder="NYX"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-gray-700">Domaine (optionnel)</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="nyxcosmetics.fr"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">Langue</span>
            <select
              value={language}
              onChange={(e) =>
                setLanguage(e.target.value === "en" ? "en" : "fr")
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={!company.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            title="Tu peux lancer une autre marque pendant qu’une analyse tourne (max 5)"
          >
            {loading ? loadingHint || "Analyse en cours" : "Analyse"}
          </button>
          <button
            type="button"
            onClick={runReadScreen}
            disabled={!company.trim()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
            title="Si la réponse est déjà à l’écran sur le VPS"
          >
            Analyser l’écran
          </button>
        </div>
        {vpsRuns.some((r) =>
          ["queued", "running"].includes(r.state)
        ) && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-950">
            <div className="font-medium">Runs carto en cours (max 5)</div>
            <ul className="mt-1 space-y-0.5">
              {vpsRuns
                .filter((r) =>
                  ["queued", "running", "done", "error"].includes(r.state)
                )
                .slice(0, 5)
                .map((r) => (
                  <li key={r.endMarker || r.companyHint}>
                    <span className="font-medium">
                      {r.companyHint || r.endMarker.slice(-8) || "—"}
                    </span>
                    {" · "}
                    {r.state}
                    {r.error ? ` · ${r.error.slice(0, 60)}` : ""}
                  </li>
                ))}
            </ul>
          </div>
        )}
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          {(
            [
              {
                key: "marque" as const,
                title: "1 · Marque (direct)",
                sub: "Contacts internes / groupe",
              },
              {
                key: "agence" as const,
                title: primaryAgency
                  ? `2 · Agence · ${primaryAgency}`
                  : "2 · Agence",
                sub: "Mandat influence / RP",
              },
              {
                key: "autre" as const,
                title: "3 · Autres partenaires",
                sub: "One-shot / mandat annexe",
              },
            ] as const
          ).map(({ key, title, sub }) => {
            const items = grouped[key];
            return (
              <div
                key={key}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {title}
                    </p>
                    <p className="text-xs text-gray-500">{sub}</p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 &&
                        items.every(({ i }) => selected[String(i)])
                      }
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = { ...prev };
                          items.forEach(({ i }) => {
                            next[String(i)] = e.target.checked;
                          });
                          return next;
                        });
                      }}
                      disabled={items.length === 0}
                    />
                    Tout ({items.length})
                  </label>
                </div>

                {items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">
                    Aucun contact dans cette catégorie
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b bg-white text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2" />
                          <th className="px-3 py-2">Prio</th>
                          <th className="px-3 py-2">Prénom</th>
                          <th className="px-3 py-2">Nom</th>
                          <th className="px-3 py-2">Ce qu&apos;ils font</th>
                          <th className="px-3 py-2">LinkedIn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(({ c, i }) => (
                          <tr
                            key={rowKey(c, i)}
                            className="border-b last:border-0"
                          >
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={Boolean(selected[String(i)])}
                                onChange={(e) =>
                                  setSelected((prev) => ({
                                    ...prev,
                                    [String(i)]: e.target.checked,
                                  }))
                                }
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {c.priorite || "—"}
                            </td>
                            <td className="px-3 py-2">{c.prenom || "—"}</td>
                            <td className="px-3 py-2 font-medium">{c.nom}</td>
                            <td className="px-3 py-2">
                              <div>{c.poste || "—"}</div>
                              {c.perimetre && (
                                <div className="mt-0.5 text-xs text-gray-500">
                                  {c.perimetre}
                                </div>
                              )}
                              {c.note && (
                                <div className="mt-0.5 line-clamp-2 text-xs text-gray-400">
                                  {c.note}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {c.linkedinUrl ? (
                                <a
                                  href={c.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  Profil
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="space-y-3 border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {isFrBeBeneluxPass
                    ? "Étape 3 · Fiche Benelux"
                    : "Étape 1 · Destination Cannes"}
                </p>
                <p className="mt-0.5 text-sm text-gray-900">
                  {isFrBeBeneluxPass
                    ? `Enregistre ${selectedRows.length} contact${selectedRows.length > 1 ? "s" : ""} sur la fiche Benelux`
                    : `${selectedRows.length} contact${selectedRows.length > 1 ? "s" : ""} → pipeline Cannes (hors CRM Marques)`}
                </p>
              </div>
              {isFrBeBeneluxPass ? (
                <p className="text-sm text-emerald-800">
                  Fiche Benelux · {marqueNom || commitResult?.company || company}
                  {commitResult?.fichePathBe ? (
                    <>
                      {" · "}
                      <Link
                        href={commitResult.fichePathBe}
                        className="underline"
                      >
                        ouvrir
                      </Link>
                    </>
                  ) : null}
                </p>
              ) : (
                <div className="max-w-md rounded-lg border border-amber-200 bg-amber-50 px-3 py-3 text-sm">
                  <p className="font-medium text-amber-950">
                    Pipeline Cannes ·{" "}
                    {marqueNom ||
                      ficheQuery.trim() ||
                      preview.company ||
                      company ||
                      "—"}
                  </p>
                  <p className="mt-1 text-xs text-amber-900/80">
                    Aucune fiche CRM Marques ici. Les contacts vont dans Cannes
                    Partenaires uniquement.
                  </p>
                </div>
              )}
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {isFrBeBeneluxPass
                    ? "Étape 4 · Enrichissement Benelux"
                    : "Étape 2 · Enrichissement"}
                </p>
                <p className="mt-0.5 text-sm text-gray-900">
                  {isFrBeBeneluxPass
                    ? "Enregistre sur la fiche Benelux puis enrichis (emails, langue)"
                    : ficheMarket === "BOTH"
                      ? "Enregistre les contacts sur FR + Benelux, puis enrichis / attribue"
                      : "Enregistre sur la/les fiche(s) puis enrichis ici (emails, FR/BE, langue FR/EN par contact)"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runCommit}
                  disabled={
                    committing ||
                    selectedRows.length === 0 ||
                    !(
                      marqueNom ||
                      ficheQuery.trim() ||
                      preview.company ||
                      company.trim() ||
                      (isFrBeBeneluxPass && commitResult?.marqueIdBe)
                    )
                  }
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {committing
                    ? "Enregistrement…"
                    : isFrBeBeneluxPass
                      ? `Passer à l'enrichissement Benelux (${selectedRows.length})`
                      : `Passer à l'enrichissement Cannes (${selectedRows.length})`}
                </button>
                <span className="text-xs text-gray-500">
                  →{" "}
                  {marqueNom ||
                    preview.company ||
                    company ||
                    "pipeline Cannes"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
