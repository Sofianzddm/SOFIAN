"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cacheIndivBrandResearch,
  cacheIndivLeynaExchange,
  cacheIndivTalentResearch,
  loadIndivBrandResearchCache,
  loadIndivLeynaExchangeCache,
  loadIndivTalentResearchCache,
} from "@/lib/indiv-talent-batch-cache";

type MissionLite = {
  id: string;
  talentId?: string | null;
  creatorName: string;
  targetBrand: string;
  marqueNom?: string | null;
  strategyReason: string;
  recommendedAngle: string | null;
  objective: string | null;
  dos: string | null;
  donts: string | null;
  stage: string;
  status?: string;
  draftEmailSubject?: string | null;
  draftEmailBody?: string | null;
  draftLanguage?: "fr" | "en" | null;
  clientLanguage?: "FR" | "EN" | null;
  clientContacts?: Array<{
    firstname?: string;
    lastname?: string;
    email?: string;
    role?: string;
  }> | null;
  sentAt?: string | null;
  awaitingContactsCompletion?: boolean;
};

type TalentLite = {
  id: string;
  name: string;
  instagram?: string | null;
};

type CachedBrandResearch = {
  recentCampaigns: string;
  newProducts: string;
  availabilityFrEu?: string;
  brandPositioning: string;
  influenceStrategy: string;
};

type CachedTalentResearchItem = {
  talentId: string;
  name: string;
  whoTheyAre: string;
  whatTheyDo?: string;
  profileAnalysis?: string;
  contentThemes: string;
  whyRelevant: string;
  proofPoints: string;
  sourcesUsed?: string;
};

type CachedLeynaExchange = {
  hasExchange: boolean;
  tone?: "tu" | "vous" | null;
  bannerLabel?: string | null;
  alerts?: string[];
  contacts?: Array<{
    email: string;
    subject?: string | null;
    tone?: "tu" | "vous" | null;
    notes?: string;
    alerts?: string[];
    lastExchangeAt?: string | null;
    clientSnippet?: string | null;
    status?: "exchange" | "sent_no_reply";
    messageCount?: number;
  }>;
};

function brandResearchKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function brandResearchKeys(name: string): string[] {
  const trimmed = String(name || "").trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const noSpace = lower.replace(/\s+/g, "");
  const normalized = brandResearchKey(trimmed);
  return Array.from(new Set([normalized, lower, noSpace].filter(Boolean)));
}

function lookupBrandCache<T>(
  cache: Record<string, T>,
  ...names: Array<string | null | undefined>
): T | null {
  for (const n of names) {
    for (const key of brandResearchKeys(String(n || ""))) {
      if (key && cache[key] != null) return cache[key];
    }
  }
  return null;
}

function hasBrandCacheEntry(
  cache: Record<string, unknown>,
  ...names: Array<string | null | undefined>
): boolean {
  return lookupBrandCache(cache, ...names) != null;
}

function brandLabel(m: MissionLite): string {
  return (m.marqueNom || m.targetBrand || "").trim();
}

type ResolvedContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  language: "fr" | "en";
};

function contactFromRaw(
  c: {
    id?: string;
    firstname?: string;
    lastname?: string;
    email?: string;
    role?: string;
    language?: string;
  },
  fallbackId: string
): ResolvedContact | null {
  const email = String(c.email || "").trim();
  if (!email.includes("@")) return null;
  const lang = String(c.language || "").toLowerCase() === "en" ? "en" : "fr";
  return {
    id: String(c.id || "").trim() || fallbackId,
    firstname: String(c.firstname || "").trim(),
    lastname: String(c.lastname || "").trim(),
    email,
    role: String(c.role || "").trim(),
    language: lang,
  };
}

/**
 * Contacts pour Leyna / rédaction :
 * 1) snapshot mission enregistré
 * 2) formulaire ouvert non encore « Enregistrer »
 * 3) CRM marque
 * Sans email, le scan Leyna ne peut pas confirmer un vrai échange.
 */
async function resolveContactsForMission(
  m: MissionLite,
  opts?: {
    signal?: AbortSignal;
    draftContacts?: DraftContact[];
  }
): Promise<ResolvedContact[]> {
  const byEmail = new Map<string, ResolvedContact>();
  const push = (c: ResolvedContact | null) => {
    if (!c) return;
    const key = c.email.toLowerCase();
    const prev = byEmail.get(key);
    // Préférer une fiche plus complète (prénom / rôle).
    if (!prev) {
      byEmail.set(key, c);
      return;
    }
    byEmail.set(key, {
      ...prev,
      firstname: c.firstname || prev.firstname,
      lastname: c.lastname || prev.lastname,
      role: c.role || prev.role,
      language: c.language || prev.language,
      id: prev.id || c.id,
    });
  };

  const saved = Array.isArray(m.clientContacts) ? m.clientContacts : [];
  saved.forEach((c, i) => push(contactFromRaw(c, `${m.id}-saved-${i}`)));

  const drafts = Array.isArray(opts?.draftContacts) ? opts.draftContacts : [];
  drafts.forEach((c, i) => push(contactFromRaw(c, `${m.id}-draft-${i}`)));

  const brand = brandLabel(m);
  if (brand.length >= 2) {
    try {
      const res = await fetch(
        `/api/marques/contacts?brand=${encodeURIComponent(brand)}`,
        { credentials: "include", signal: opts?.signal }
      );
      const data = await res.json().catch(() => ({}));
      if (res.ok && Array.isArray(data.contacts)) {
        (
          data.contacts as Array<{
            id?: string;
            firstname?: string;
            lastname?: string;
            email?: string;
            role?: string;
            language?: string;
          }>
        ).forEach((c, i) => push(contactFromRaw(c, `${m.id}-crm-${i}`)));
      }
    } catch {
      // snapshot + draft
    }
  }
  return Array.from(byEmail.values());
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    { length: Math.min(Math.max(1, concurrency), Math.max(1, items.length)) },
    async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
}

type BatchRunOpts = { quiet?: boolean };

type DraftContact = {
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

type Props = {
  talent: TalentLite;
  missions: MissionLite[];
  /** Contacts saisis dans le formulaire mais pas encore « Enregistrer ». */
  draftContactsByMissionId?: Record<string, DraftContact[]>;
  canRun: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
};

/**
 * Même flux que projets-outreach : marque → talent → Leyna → rédaction,
 * limité aux marques du talent sélectionné (prospection individuelle).
 */
export function TalentIndivBatchAnalyzeBar({
  talent,
  missions,
  draftContactsByMissionId,
  canRun,
  onChanged,
  setError,
  setSuccess,
}: Props) {
  const [brandResearchCache, setBrandResearchCache] = useState<
    Record<string, CachedBrandResearch>
  >(() => loadIndivBrandResearchCache(talent.id));
  const [talentResearchCache, setTalentResearchCache] = useState<
    Record<string, CachedTalentResearchItem[]>
  >(() => loadIndivTalentResearchCache(talent.id));
  const [leynaExchangeCache, setLeynaExchangeCache] = useState<
    Record<string, CachedLeynaExchange>
  >(() => loadIndivLeynaExchangeCache(talent.id));

  const [batchResearch, setBatchResearch] = useState<{
    running: boolean;
    phase: "marques" | "talents";
    done: number;
    total: number;
    phaseDone: number;
    phaseTotal: number;
    current: string;
    failed: number;
  } | null>(null);
  const [batchLeyna, setBatchLeyna] = useState<{
    running: boolean;
    done: number;
    total: number;
    current: string;
    failed: number;
  } | null>(null);
  const [batchDraft, setBatchDraft] = useState<{
    running: boolean;
    done: number;
    total: number;
    current: string;
    failed: number;
  } | null>(null);
  const [batchPipeline, setBatchPipeline] = useState<{
    running: boolean;
    step: number;
    label: string;
  } | null>(null);

  const batchAbortRef = useRef<AbortController | null>(null);
  const batchLeynaAbortRef = useRef<AbortController | null>(null);
  const batchDraftAbortRef = useRef<AbortController | null>(null);
  const batchPipelineActiveRef = useRef(false);

  useEffect(() => {
    setBrandResearchCache(loadIndivBrandResearchCache(talent.id));
    setTalentResearchCache(loadIndivTalentResearchCache(talent.id));
    setLeynaExchangeCache(loadIndivLeynaExchangeCache(talent.id));
  }, [talent.id]);

  /** Relire storage (composer + barre partagent le même cache lib). */
  function readLiveCaches() {
    const brands = {
      ...brandResearchCache,
      ...loadIndivBrandResearchCache(talent.id),
    };
    const talents = {
      ...talentResearchCache,
      ...loadIndivTalentResearchCache(talent.id),
    };
    const leyna = {
      ...leynaExchangeCache,
      ...loadIndivLeynaExchangeCache(talent.id),
    };
    setBrandResearchCache(brands);
    setTalentResearchCache(talents);
    setLeynaExchangeCache(leyna);
    return { brands, talents, leyna };
  }

  const cacheBrandResearch = useCallback(
    (brandName: string, data: CachedBrandResearch) => {
      cacheIndivBrandResearch(talent.id, brandName, data);
      const key = brandResearchKey(brandName);
      if (!key) return;
      setBrandResearchCache((prev) => ({ ...prev, [key]: data }));
    },
    [talent.id]
  );

  const cacheTalentResearch = useCallback(
    (brandName: string, list: CachedTalentResearchItem[]) => {
      cacheIndivTalentResearch(talent.id, brandName, list);
      const key = brandResearchKey(brandName);
      if (!key) return;
      setTalentResearchCache((prev) => ({ ...prev, [key]: list }));
    },
    [talent.id]
  );

  const cacheLeynaExchange = useCallback(
    (brandName: string, data: CachedLeynaExchange) => {
      cacheIndivLeynaExchange(talent.id, brandName, data);
      const key = brandResearchKey(brandName);
      if (!key) return;
      setLeynaExchangeCache((prev) => ({ ...prev, [key]: data }));
    },
    [talent.id]
  );

  /** Déjà rédigé / prêt → hors batch (ne pas réanalyser). */
  function missionAlreadyDrafted(m: MissionLite): boolean {
    const hasDraft =
      Boolean(String(m.draftEmailSubject || "").trim()) &&
      Boolean(String(m.draftEmailBody || "").trim());
    if (!hasDraft) return false;
    return (
      m.stage === "DRAFTED_FOR_VALIDATION" ||
      m.stage === "TO_SEND" ||
      m.status === "EMAIL_DRAFTED"
    );
  }

  /** Marques du talent encore à traiter (pas les « Prêt à envoyer » déjà rédigés). */
  const brandsToBatchResearch = useMemo(() => {
    const byKey = new Map<string, MissionLite>();
    for (const m of missions) {
      if (m.talentId && m.talentId !== talent.id) continue;
      if (m.sentAt || m.stage === "SENT") continue;
      if (missionAlreadyDrafted(m)) continue;
      if (
        m.stage !== "TO_DRAFT" &&
        m.stage !== "DRAFTED_FOR_VALIDATION" &&
        m.stage !== "STRATEGY_DEFINED" &&
        m.stage !== "TO_SEND"
      ) {
        continue;
      }
      const name = brandLabel(m);
      if (!name) continue;
      const key = brandResearchKey(name);
      if (!byKey.has(key)) byKey.set(key, m);
    }
    return Array.from(byKey.values());
  }, [missions, talent.id]);

  const brandCacheCount = useMemo(
    () =>
      brandsToBatchResearch.filter((m) =>
        hasBrandCacheEntry(brandResearchCache, m.marqueNom, m.targetBrand)
      ).length,
    [brandsToBatchResearch, brandResearchCache]
  );
  const talentCacheCount = useMemo(
    () =>
      brandsToBatchResearch.filter((m) => {
        const hit = lookupBrandCache(
          talentResearchCache,
          m.marqueNom,
          m.targetBrand
        );
        return Array.isArray(hit) && hit.length > 0;
      }).length,
    [brandsToBatchResearch, talentResearchCache]
  );

  function talentProjectPayload(m: MissionLite, brandName: string) {
    return {
      projectBrief: {
        talentId: talent.id,
        projectTitle: null,
        projectDescription: null,
        creatorName: talent.name || m.creatorName,
        targetBrand: brandName,
        strategyReason: m.strategyReason,
        recommendedAngle: m.recommendedAngle,
        objective: m.objective,
        deliverables: null,
        angles: null,
        timeline: null,
        budgetRange: null,
        dos: m.dos,
        donts: m.donts,
      },
    };
  }

  async function patchMissionDraft(
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
    if (!res.ok) throw new Error(data.error || "Sauvegarde brouillon impossible.");
  }

  function draftsFor(m: MissionLite): DraftContact[] {
    return Array.isArray(draftContactsByMissionId?.[m.id])
      ? draftContactsByMissionId![m.id]
      : [];
  }

  /** Persiste les contacts utilisés (formulaire inclus) pour ne pas les perdre. */
  async function persistContactsIfNeeded(
    m: MissionLite,
    contacts: ResolvedContact[]
  ) {
    if (contacts.length === 0) return;
    const existing = new Set(
      (Array.isArray(m.clientContacts) ? m.clientContacts : [])
        .map((c) => String(c?.email || "").trim().toLowerCase())
        .filter(Boolean)
    );
    const missing = contacts.filter(
      (c) => !existing.has(c.email.toLowerCase())
    );
    if (missing.length === 0) return;
    const byEmail = new Map<string, DraftContact>();
    for (const c of Array.isArray(m.clientContacts) ? m.clientContacts : []) {
      const email = String(c?.email || "").trim().toLowerCase();
      if (email) byEmail.set(email, c);
    }
    for (const c of contacts) {
      byEmail.set(c.email.toLowerCase(), {
        firstname: c.firstname,
        lastname: c.lastname,
        email: c.email,
        role: c.role,
      });
    }
    await patchMissionDraft(m.id, {
      clientContacts: Array.from(byEmail.values()),
    });
  }

  function stopBatchResearch() {
    batchAbortRef.current?.abort();
    batchAbortRef.current = null;
    setBatchResearch(null);
  }
  function stopBatchLeyna() {
    batchLeynaAbortRef.current?.abort();
    batchLeynaAbortRef.current = null;
    setBatchLeyna(null);
  }
  function stopBatchDraft() {
    batchDraftAbortRef.current?.abort();
    batchDraftAbortRef.current = null;
    setBatchDraft(null);
  }
  function stopBatchPipeline() {
    batchPipelineActiveRef.current = false;
    stopBatchResearch();
    stopBatchLeyna();
    stopBatchDraft();
    setBatchPipeline(null);
  }

  async function runBatchBrandResearch(opts?: BatchRunOpts): Promise<boolean> {
    if (batchResearch?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à analyser pour ce talent.");
      return true;
    }
    const { brands: brandCacheNow } = readLiveCaches();
    const targets = brandsToBatchResearch.filter(
      (m) =>
        !hasBrandCacheEntry(
          brandCacheNow,
          m.marqueNom,
          m.targetBrand,
          brandLabel(m)
        )
    );
    if (targets.length === 0) {
      const already = brandsToBatchResearch.filter((m) =>
        hasBrandCacheEntry(
          brandCacheNow,
          m.marqueNom,
          m.targetBrand,
          brandLabel(m)
        )
      ).length;
      if (!opts?.quiet) {
        setSuccess(
          `Toutes les marques de ${talent.name} sont déjà analysées (${already}).`
        );
      }
      return true;
    }

    batchAbortRef.current?.abort();
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const analyzeOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          brandName,
          availabilityFocus: "FR",
          ...talentProjectPayload(m, brandName),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Analyse marque impossible"
        );
      }
      cacheBrandResearch(brandName, data as CachedBrandResearch);
    };

    const runWave = async (wave: MissionLite[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: MissionLite[] = [];
      setBatchResearch({
        running: true,
        phase: "marques",
        done: 0,
        total: wave.length,
        phaseDone: 0,
        phaseTotal: wave.length,
        current: brandLabel(wave[0]!) || "",
        failed: 0,
      });
      await mapPool(wave, 2, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = brandLabel(m);
        setBatchResearch({
          running: true,
          phase: "marques",
          done,
          total: wave.length,
          phaseDone: done,
          phaseTotal: wave.length,
          current: brandName,
          failed,
        });
        try {
          await analyzeOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Indiv batch brand-research ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            setBatchResearch({
              running: true,
              phase: "marques",
              done,
              total: wave.length,
              phaseDone: done,
              phaseTotal: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      let result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} marque(s) en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(brandLabel);
        const ok = targets.length - stillFailed.length;
        setBatchResearch(null);
        if (stillFailed.length > 0) {
          setError(
            `Marques OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}.`
          );
        } else if (!opts?.quiet) {
          setSuccess(
            `Marques OK (${targets.length}). Ensuite : analyser le talent.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      if (!opts?.quiet) {
        setSuccess(`Marques OK (${result.done}) pour ${talent.name}.`);
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      setError(e instanceof Error ? e.message : "Batch marques impossible.");
      return false;
    }
  }

  async function runBatchTalentResearch(opts?: BatchRunOpts): Promise<boolean> {
    if (batchResearch?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à analyser pour ce talent.");
      return true;
    }

    const { brands: brandCacheNow, talents: talentCacheNow } = readLiveCaches();
    const withBrand = brandsToBatchResearch.filter((m) =>
      hasBrandCacheEntry(
        brandCacheNow,
        m.marqueNom,
        m.targetBrand,
        brandLabel(m)
      )
    );
    if (withBrand.length === 0) {
      if (!opts?.quiet) {
        setError("Analyse d’abord les marques.");
      }
      return false;
    }
    const targets = withBrand.filter((m) => {
      const hit = lookupBrandCache(talentCacheNow, m.marqueNom, m.targetBrand);
      return !(Array.isArray(hit) && hit.length > 0);
    });
    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(`Talent déjà analysé pour toutes les marques (${talentCacheCount}).`);
      }
      return true;
    }

    batchAbortRef.current?.abort();
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const analyzeOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const res = await fetch("/api/casting/talent-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          brandName,
          talentIds: [talent.id],
          strategyReason: m.strategyReason || "",
          recommendedAngle: m.recommendedAngle || "",
          ...talentProjectPayload(m, brandName),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Analyse talent impossible"
        );
      }
      const list = Array.isArray(data.talents)
        ? (data.talents as CachedTalentResearchItem[])
        : [];
      if (list.length === 0) throw new Error("Réponse talent vide");
      cacheTalentResearch(brandName, list);
    };

    const runWave = async (wave: MissionLite[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: MissionLite[] = [];
      setBatchResearch({
        running: true,
        phase: "talents",
        done: 0,
        total: wave.length,
        phaseDone: 0,
        phaseTotal: wave.length,
        current: brandLabel(wave[0]!) || "",
        failed: 0,
      });
      await mapPool(wave, 2, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = brandLabel(m);
        setBatchResearch({
          running: true,
          phase: "talents",
          done,
          total: wave.length,
          phaseDone: done,
          phaseTotal: wave.length,
          current: brandName,
          failed,
        });
        try {
          await analyzeOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Indiv batch talent-research ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            setBatchResearch({
              running: true,
              phase: "talents",
              done,
              total: wave.length,
              phaseDone: done,
              phaseTotal: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      const result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} analyse(s) talent en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(brandLabel);
        const ok = targets.length - stillFailed.length;
        setBatchResearch(null);
        if (stillFailed.length > 0) {
          setError(
            `Talent OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}.`
          );
        } else if (!opts?.quiet) {
          setSuccess(`Talent OK (${targets.length}) pour ${talent.name}.`);
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      if (!opts?.quiet) setSuccess(`Talent OK (${result.done}) pour ${talent.name}.`);
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      setError(e instanceof Error ? e.message : "Batch talent impossible.");
      return false;
    }
  }

  async function runBatchLeynaExchange(opts?: BatchRunOpts): Promise<boolean> {
    if (batchLeyna?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à analyser pour ce talent.");
      return true;
    }
    const { brands: brandCacheNow, leyna: leynaCacheNow } = readLiveCaches();
    const withBrand = brandsToBatchResearch.filter((m) =>
      hasBrandCacheEntry(
        brandCacheNow,
        m.marqueNom,
        m.targetBrand,
        brandLabel(m)
      )
    );
    if (withBrand.length === 0) {
      if (!opts?.quiet) setError("Analyse d’abord les marques.");
      return false;
    }

    const targets = withBrand.filter(
      (m) =>
        !hasBrandCacheEntry(
          leynaCacheNow,
          m.marqueNom,
          m.targetBrand,
          brandLabel(m)
        )
    );
    if (targets.length === 0) {
      if (!opts?.quiet) setSuccess("Boîte mail déjà scannée pour ces marques.");
      return true;
    }

    batchLeynaAbortRef.current?.abort();
    const ac = new AbortController();
    batchLeynaAbortRef.current = ac;

    const skippedNoEmail: string[] = [];

    const analyzeOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const contacts = await resolveContactsForMission(m, {
        signal: ac.signal,
        draftContacts: draftsFor(m),
      });
      const emails = contacts.map((c) => c.email);
      // Sans email, on ne cache PAS « aucun échange » (faux négatif) :
      // il faut d’abord renseigner les contacts CRM / mission / formulaire.
      if (emails.length === 0) {
        skippedNoEmail.push(brandName || m.id);
        return;
      }
      // Formulaire non enregistré → on persiste au passage pour Leyna.
      await persistContactsIfNeeded(m, contacts).catch(() => {});
      const res = await fetch("/api/casting/leyna-exchange-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          recipientEmails: emails,
          brandName,
          talentNames: [talent.name].filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Scan boîte mail impossible"
        );
      }
      const ctx = (data?.context || { hasExchange: false }) as CachedLeynaExchange;
      cacheLeynaExchange(brandName, {
        hasExchange: Boolean(ctx.hasExchange),
        tone: ctx.tone ?? null,
        bannerLabel: ctx.bannerLabel ?? null,
        alerts: Array.isArray(ctx.alerts) ? ctx.alerts : [],
        contacts: Array.isArray(ctx.contacts)
          ? ctx.contacts.map((c) => ({
              email: String(c.email || "").trim(),
              subject: c.subject ?? null,
              tone: c.tone ?? null,
              notes: c.notes,
              alerts: Array.isArray(c.alerts) ? c.alerts : [],
              lastExchangeAt: c.lastExchangeAt ?? null,
              clientSnippet: c.clientSnippet ?? null,
              status: c.status === "sent_no_reply" ? "sent_no_reply" : "exchange",
              messageCount:
                typeof c.messageCount === "number" ? c.messageCount : undefined,
            }))
          : [],
      });
    };

    const runWave = async (wave: MissionLite[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: MissionLite[] = [];
      setBatchLeyna({
        running: true,
        done: 0,
        total: wave.length,
        current: brandLabel(wave[0]!) || "",
        failed: 0,
      });
      await mapPool(wave, 2, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = brandLabel(m);
        setBatchLeyna({
          running: true,
          done,
          total: wave.length,
          current: brandName,
          failed,
        });
        try {
          await analyzeOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Indiv batch leyna ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            setBatchLeyna({
              running: true,
              done,
              total: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    const noEmailNote = () => {
      const unique = Array.from(new Set(skippedNoEmail.filter(Boolean)));
      if (unique.length === 0) return "";
      const preview = unique.slice(0, 5).join(", ");
      const more = unique.length > 5 ? ` (+${unique.length - 5})` : "";
      return ` ${unique.length} marque${unique.length > 1 ? "s" : ""} sans email (CRM/mission) — renseigne les contacts puis relance Boîte mail : ${preview}${more}.`;
    };

    try {
      const result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} scan(s) Leyna en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(brandLabel);
        const ok = targets.length - stillFailed.length;
        setBatchLeyna(null);
        if (stillFailed.length > 0) {
          setError(
            `Boîte mail OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}.${noEmailNote()}`
          );
        } else if (!opts?.quiet) {
          setSuccess(`Boîte mail OK (${targets.length}).${noEmailNote()}`);
        } else if (skippedNoEmail.length > 0) {
          setSuccess(noEmailNote().trim());
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchLeyna(null);
      if (!opts?.quiet) {
        setSuccess(`Boîte mail OK (${result.done}).${noEmailNote()}`);
      } else if (skippedNoEmail.length > 0) {
        setSuccess(noEmailNote().trim());
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchLeyna(null);
      setError(e instanceof Error ? e.message : "Batch boîte mail impossible.");
      return false;
    }
  }

  async function runBatchDraftEmails(opts?: BatchRunOpts): Promise<boolean> {
    if (batchDraft?.running) return false;
    if (brandsToBatchResearch.length === 0) {
      if (!opts?.quiet) setSuccess("Aucune marque à rédiger pour ce talent.");
      return true;
    }

    const { brands: brandCacheNow, talents: talentCacheNow } = readLiveCaches();

    const targets = brandsToBatchResearch.filter((m) => {
      if (m.awaitingContactsCompletion) return false;
      if (m.sentAt || m.stage === "SENT") return false;
      if (
        m.stage === "DRAFTED_FOR_VALIDATION" &&
        String(m.draftEmailSubject || "").trim() &&
        String(m.draftEmailBody || "").trim()
      ) {
        return false;
      }
      if (!hasBrandCacheEntry(brandCacheNow, m.marqueNom, m.targetBrand)) {
        return false;
      }
      const talentHit = lookupBrandCache(
        talentCacheNow,
        m.marqueNom,
        m.targetBrand
      );
      return Array.isArray(talentHit) && talentHit.length > 0;
    });

    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          "Rien à rédiger (déjà à valider, analyses manquantes, ou enrichissement contacts)."
        );
      }
      return true;
    }

    batchDraftAbortRef.current?.abort();
    const ac = new AbortController();
    batchDraftAbortRef.current = ac;

    const draftOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const brandResearch = lookupBrandCache(
        brandCacheNow,
        m.marqueNom,
        m.targetBrand,
        brandName
      );
      const talentResearchAll =
        lookupBrandCache(
          talentCacheNow,
          m.marqueNom,
          m.targetBrand,
          brandName
        ) || [];
      if (!brandResearch) throw new Error("Analyse marque manquante");
      if (talentResearchAll.length === 0) {
        throw new Error("Analyse talent manquante");
      }

      const contacts = await resolveContactsForMission(m, {
        signal: ac.signal,
        draftContacts: draftsFor(m),
      });
      if (contacts.length === 0) throw new Error("Aucun contact email");
      await persistContactsIfNeeded(m, contacts).catch(() => {});

      const talentsPayload = [
        {
          talentId: talent.id,
          name: talent.name,
          niche: "—",
          followers: 0,
          igFollowers: 0,
          ttFollowers: 0,
          instagram: talent.instagram ?? null,
        },
      ];

      const talentResearch = talentResearchAll.map((r) => ({
        talentId: r.talentId,
        name: r.name,
        whoTheyAre: r.whoTheyAre,
        whatTheyDo: r.whatTheyDo,
        profileAnalysis: r.profileAnalysis,
        contentThemes: r.contentThemes,
        whyRelevant: r.whyRelevant,
        proofPoints: r.proofPoints,
        sourcesUsed: r.sourcesUsed,
      }));

      const enCount = contacts.filter((c) => c.language === "en").length;
      const genLanguage =
        m.clientLanguage === "EN" || enCount >= contacts.length / 2 ? "en" : "fr";
      const recipientEmails = contacts.map((c) => c.email);

      const res = await fetch("/api/casting/generate-email", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          language: genLanguage,
          market: "FR",
          availabilityFocus: "FR",
          brandName,
          brandResearch,
          talents: talentsPayload,
          recipientEmails,
          talentResearch,
          ...talentProjectPayload(m, brandName),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Rédaction impossible"
        );
      }
      const subject = String(data.subject || "").trim();
      const body = String(data.body || "").trim();
      if (!subject || !body) throw new Error("Brouillon vide");

      await patchMissionDraft(m.id, {
        stage: "DRAFTED_FOR_VALIDATION",
        status: "EMAIL_DRAFTED",
        draftEmailSubject: subject,
        draftEmailBody: body,
        draftLanguage: genLanguage,
        clientContacts: contacts.map((c) => ({
          firstname: c.firstname || "",
          lastname: c.lastname || "",
          email: c.email,
          role: c.role || "",
        })),
      });
    };

    const runWave = async (wave: MissionLite[]) => {
      let done = 0;
      let failed = 0;
      const failedMissions: MissionLite[] = [];
      setBatchDraft({
        running: true,
        done: 0,
        total: wave.length,
        current: brandLabel(wave[0]!) || "",
        failed: 0,
      });
      await mapPool(wave, 1, async (m) => {
        if (ac.signal.aborted) return;
        const brandName = brandLabel(m);
        setBatchDraft({
          running: true,
          done,
          total: wave.length,
          current: brandName,
          failed,
        });
        try {
          await draftOne(m);
        } catch (e) {
          if (ac.signal.aborted) return;
          failed += 1;
          failedMissions.push(m);
          console.error(`Indiv batch draft ${brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            done += 1;
            setBatchDraft({
              running: true,
              done,
              total: wave.length,
              current: brandName,
              failed,
            });
          }
        }
      });
      return { done, failed, failedMissions };
    };

    try {
      const result = await runWave(targets);
      if (!ac.signal.aborted && result.failedMissions.length > 0) {
        setSuccess(
          `Relance auto de ${result.failedMissions.length} rédaction(s) en échec…`
        );
        const retry = await runWave(result.failedMissions);
        const stillFailed = retry.failedMissions.map(brandLabel);
        const ok = targets.length - stillFailed.length;
        setBatchDraft(null);
        await onChanged();
        if (stillFailed.length > 0) {
          setError(
            `Rédaction OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}.`
          );
        } else if (!opts?.quiet) {
          setSuccess(
            `Mails rédigés (${targets.length}) pour ${talent.name} — à valider.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchDraft(null);
      await onChanged();
      if (!opts?.quiet) {
        setSuccess(
          `Mails rédigés (${result.done}) pour ${talent.name} — à valider.`
        );
      }
      return true;
    } catch (e) {
      if (ac.signal.aborted) return false;
      setBatchDraft(null);
      setError(e instanceof Error ? e.message : "Batch rédaction impossible.");
      return false;
    }
  }

  async function runBatchFullPipeline() {
    if (
      batchResearch?.running ||
      batchLeyna?.running ||
      batchDraft?.running ||
      batchPipelineActiveRef.current
    ) {
      return;
    }
    if (brandsToBatchResearch.length === 0) {
      setSuccess(`Aucune marque à analyser pour ${talent.name}.`);
      return;
    }
    // Sync cache composer → barre avant de filtrer les cibles.
    readLiveCaches();
    batchPipelineActiveRef.current = true;
    setError(null);
    try {
      setBatchPipeline({ running: true, step: 1, label: "Marques" });
      const brandsOk = await runBatchBrandResearch({ quiet: true });
      if (!batchPipelineActiveRef.current || !brandsOk) return;

      setBatchPipeline({ running: true, step: 2, label: "Talent" });
      const talentsOk = await runBatchTalentResearch({ quiet: true });
      if (!batchPipelineActiveRef.current || !talentsOk) return;

      setBatchPipeline({ running: true, step: 3, label: "Boîte mail Leyna" });
      await runBatchLeynaExchange({ quiet: true });
      if (!batchPipelineActiveRef.current) return;

      setBatchPipeline({ running: true, step: 4, label: "Rédaction mails" });
      await runBatchDraftEmails({ quiet: true });
      if (!batchPipelineActiveRef.current) return;

      setSuccess(
        `Pipeline terminé pour ${talent.name} (${brandsToBatchResearch.length} marque${brandsToBatchResearch.length > 1 ? "s" : ""}) — mails à valider.`
      );
    } finally {
      batchPipelineActiveRef.current = false;
      setBatchPipeline(null);
    }
  }

  const running =
    Boolean(batchPipeline?.running) ||
    Boolean(batchResearch?.running) ||
    Boolean(batchLeyna?.running) ||
    Boolean(batchDraft?.running);

  const btnBase =
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const btnPrimary =
    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40";

  return (
    <div className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs leading-snug text-slate-500">
            {batchPipeline?.running
              ? `Pipeline ${batchPipeline.step}/4 · ${batchPipeline.label} — ${talent.name} uniquement.`
              : `Tout analyser + rédiger pour ${talent.name} : marque → talent → Leyna → mails (${brandsToBatchResearch.length} à traiter). Skip auto : déjà « Prêt à envoyer » / brouillon OK, et analyses déjà en cache.`}
          </p>
          {(batchResearch?.running ||
            batchLeyna?.running ||
            batchDraft?.running) && (
            <div className="mt-2.5 flex flex-col gap-2">
              {batchResearch?.running ? (
                <ProgressRow
                  label={`${batchPipeline?.running ? `${batchPipeline.step}/4 · ` : ""}${
                    batchResearch.phase === "marques" ? "Marques" : "Talent"
                  }${batchResearch.current ? ` · ${batchResearch.current}` : ""}`}
                  done={batchResearch.phaseDone}
                  total={batchResearch.phaseTotal}
                  failed={batchResearch.failed}
                />
              ) : null}
              {batchLeyna?.running ? (
                <ProgressRow
                  label={`${batchPipeline?.running ? "3/4 · " : ""}Boîte mail${
                    batchLeyna.current ? ` · ${batchLeyna.current}` : ""
                  }`}
                  done={batchLeyna.done}
                  total={batchLeyna.total}
                  failed={batchLeyna.failed}
                />
              ) : null}
              {batchDraft?.running ? (
                <ProgressRow
                  label={`${batchPipeline?.running ? "4/4 · " : ""}Rédaction${
                    batchDraft.current ? ` · ${batchDraft.current}` : ""
                  }`}
                  done={batchDraft.done}
                  total={batchDraft.total}
                  failed={batchDraft.failed}
                />
              ) : null}
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {running ? (
            <button
              type="button"
              className={btnBase}
              style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
              onClick={
                batchPipeline?.running
                  ? stopBatchPipeline
                  : batchResearch?.running
                    ? stopBatchResearch
                    : batchLeyna?.running
                      ? stopBatchLeyna
                      : stopBatchDraft
              }
            >
              {batchPipeline?.running
                ? "Arrêter le pipeline"
                : batchResearch?.running
                  ? "Arrêter marques/talent"
                  : batchLeyna?.running
                    ? "Arrêter boîte mail"
                    : "Arrêter rédaction"}
            </button>
          ) : (
            <>
              <button
                type="button"
                className={btnPrimary}
                style={{ background: "#0f172a" }}
                disabled={!canRun || brandsToBatchResearch.length === 0}
                onClick={() => void runBatchFullPipeline()}
                title="Marque → talent → Leyna → rédaction (uniquement les marques de ce talent)"
              >
                Tout analyser + rédiger
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={!canRun || brandsToBatchResearch.length === 0}
                onClick={() => void runBatchBrandResearch()}
              >
                Marques
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={
                  !canRun ||
                  brandsToBatchResearch.length === 0 ||
                  brandCacheCount === 0
                }
                onClick={() => void runBatchTalentResearch()}
                title={
                  brandCacheCount === 0
                    ? "Analyse d’abord les marques"
                    : `Analyse ${talent.name} pour chaque marque`
                }
              >
                Talent
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={
                  !canRun ||
                  brandsToBatchResearch.length === 0 ||
                  brandCacheCount === 0
                }
                onClick={() => void runBatchLeynaExchange()}
                title="Scan Leyna avec emails CRM, carte enregistrée, ou formulaire ouvert (même sans Enregistrer). Sans email → skip."
              >
                Boîte mail
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={
                  !canRun ||
                  brandsToBatchResearch.length === 0 ||
                  brandCacheCount === 0 ||
                  talentCacheCount === 0
                }
                onClick={() => void runBatchDraftEmails()}
                title={
                  talentCacheCount === 0
                    ? "Analyse d’abord marques + talent"
                    : "Rédige les mails → À valider"
                }
              >
                Rédiger les mails
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

function ProgressRow(props: {
  label: string;
  done: number;
  total: number;
  failed: number;
}) {
  const pct = Math.min(
    100,
    Math.round((props.total > 0 ? props.done / props.total : 0) * 100)
  );
  return (
    <div>
      <div className="mb-1.5 flex justify-between gap-2 text-xs font-semibold text-slate-700">
        <span>{props.label}</span>
        <span>
          {props.done}/{props.total}
          {props.failed > 0
            ? ` · ${props.failed} échec${props.failed > 1 ? "s" : ""}`
            : ""}
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
        <div
          className="h-full rounded-full transition-[width] duration-300 ease-out"
          style={{
            width: `${pct}%`,
            background: "linear-gradient(90deg, #64748b, #0f172a)",
          }}
        />
      </div>
    </div>
  );
}
