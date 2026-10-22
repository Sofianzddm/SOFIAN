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
  talentName?: string | null;
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
  createdAt?: string | Date | null;
  updatedAt?: string | Date | null;
};

type TalentLite = {
  id: string;
  name: string;
  instagram?: string | null;
};

/** Lundi 19 oct. 2026 00:00 Europe/Paris — ne traiter que ce qui n’était pas fait avant. */
const BATCH_SINCE_MS = Date.parse("2026-10-19T00:00:00+02:00");
const BATCH_SINCE_LABEL = "lundi 19 oct.";

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
 * Sans email → scan Leyna + rédaction OK quand même (contexte par nom de marque).
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

type BatchRunOpts = { quiet?: boolean; scope?: MissionLite[] };
type PeriodTab = "since" | "before" | "done";
const DEFAULT_BATCH_SIZE = 25;

type DraftContact = {
  firstname?: string;
  lastname?: string;
  email?: string;
  role?: string;
};

type Props = {
  /** Tous les talents pipeline (batch multi-talents). */
  talents: TalentLite[];
  missions: MissionLite[];
  /** Contacts saisis dans le formulaire mais pas encore « Enregistrer ». */
  draftContactsByMissionId?: Record<string, DraftContact[]>;
  canRun: boolean;
  onChanged: () => Promise<void>;
  setError: (v: string | null) => void;
  setSuccess: (v: string | null) => void;
  /** Affiche les cartes dans le pipeline (vrais boutons contact / mail). */
  onFocusMissions?: (payload: {
    missionIds: string[];
    stage: "DRAFTED_FOR_VALIDATION" | "TO_DRAFT";
    label: string;
  } | null) => void;
};

/**
 * Même flux que projets-outreach : marque → talent → Leyna → rédaction.
 * Tous les talents dispo. Refait les brouillons last-update avant le lundi 19 oct. 2026.
 */
export function TalentIndivBatchAnalyzeBar({
  talents,
  missions,
  draftContactsByMissionId,
  canRun,
  onChanged,
  setError,
  setSuccess,
  onFocusMissions,
}: Props) {
  const talentById = useMemo(() => {
    const map = new Map<string, TalentLite>();
    for (const t of talents) map.set(t.id, t);
    return map;
  }, [talents]);

  const [cacheTick, setCacheTick] = useState(0);
  const [periodTab, setPeriodTab] = useState<PeriodTab>("since");
  const [batchSize, setBatchSize] = useState(DEFAULT_BATCH_SIZE);

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

  /** Missions ouvertes tous talents (indépendant du filtre UI). */
  const [allOpenMissions, setAllOpenMissions] = useState<MissionLite[] | null>(
    null
  );

  const reloadAllOpenMissions = useCallback(async () => {
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        credentials: "include",
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) return;
      const rows = Array.isArray(data.missions)
        ? (data.missions as MissionLite[])
        : [];
      setAllOpenMissions(rows);
    } catch {
      // garde le snapshot précédent
    }
  }, []);

  useEffect(() => {
    void reloadAllOpenMissions();
  }, [missions.length, reloadAllOpenMissions]);

  function resolveTalent(m: MissionLite): TalentLite {
    if (m.talentId && talentById.has(m.talentId)) {
      return talentById.get(m.talentId)!;
    }
    const name = (m.talentName || m.creatorName || "Talent").trim();
    return {
      id: m.talentId || `unknown:${name}`,
      name,
    };
  }

  function missionTimeMs(value: string | Date | null | undefined): number {
    if (!value) return 0;
    const t = new Date(value).getTime();
    return Number.isNaN(t) ? 0 : t;
  }

  function hasCompleteDraft(m: MissionLite): boolean {
    return (
      Boolean(String(m.draftEmailSubject || "").trim()) &&
      Boolean(String(m.draftEmailBody || "").trim())
    );
  }

  /**
   * Brouillon considéré « déjà OK depuis le 19 » → on ne retouche pas.
   * Proxy : updatedAt (dernière sauvegarde du brouillon / carte).
   */
  function missionDraftDoneSinceMonday(m: MissionLite): boolean {
    if (!hasCompleteDraft(m)) return false;
    const updated = missionTimeMs(m.updatedAt);
    if (updated <= 0) return false;
    return updated >= BATCH_SINCE_MS;
  }

  function bumpCache() {
    setCacheTick((n) => n + 1);
  }

  const cacheBrandResearch = useCallback(
    (talentId: string, brandName: string, data: CachedBrandResearch) => {
      cacheIndivBrandResearch(talentId, brandName, data);
      bumpCache();
    },
    []
  );

  const cacheTalentResearch = useCallback(
    (talentId: string, brandName: string, list: CachedTalentResearchItem[]) => {
      cacheIndivTalentResearch(talentId, brandName, list);
      bumpCache();
    },
    []
  );

  const cacheLeynaExchange = useCallback(
    (talentId: string, brandName: string, data: CachedLeynaExchange) => {
      cacheIndivLeynaExchange(talentId, brandName, data);
      bumpCache();
    },
    []
  );

  /**
   * Tous talents · stages ouverts ·
   * - brouillon last-update depuis le 19 → skip
   * - sinon → éligible (à faire ou à refaire)
   */
  const eligibleAll = useMemo(() => {
    const source = allOpenMissions ?? missions;
    const byKey = new Map<string, MissionLite>();
    for (const m of source) {
      if (!m.talentId) continue;
      if (m.sentAt || m.stage === "SENT") continue;
      if (
        m.stage !== "TO_DRAFT" &&
        m.stage !== "DRAFTED_FOR_VALIDATION" &&
        m.stage !== "STRATEGY_DEFINED" &&
        m.stage !== "TO_SEND"
      ) {
        continue;
      }
      if (missionDraftDoneSinceMonday(m)) continue;
      const name = brandLabel(m);
      if (!name) continue;
      const key = `${m.talentId}:${brandResearchKey(name)}`;
      if (!byKey.has(key)) byKey.set(key, m);
    }
    return Array.from(byKey.values());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOpenMissions, missions]);

  /** Avant le 19 = brouillon vieux à refaire, ou carte créée avant sans brouillon. */
  function isBeforeMondayCard(m: MissionLite): boolean {
    const created = missionTimeMs(m.createdAt);
    const updated = missionTimeMs(m.updatedAt);
    if (hasCompleteDraft(m)) {
      return updated > 0 && updated < BATCH_SINCE_MS;
    }
    return created > 0 && created < BATCH_SINCE_MS;
  }

  const beforeMondayList = useMemo(
    () => eligibleAll.filter(isBeforeMondayCard),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleAll]
  );
  const sinceMondayList = useMemo(
    () => eligibleAll.filter((m) => !isBeforeMondayCard(m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [eligibleAll]
  );

  /** Brouillons déjà OK depuis le 19 — suivi / tri, pas de relance. */
  const doneSinceMondayList = useMemo(() => {
    const source = allOpenMissions ?? missions;
    const out: MissionLite[] = [];
    const seen = new Set<string>();
    for (const m of source) {
      if (!m.talentId) continue;
      if (m.sentAt || m.stage === "SENT") continue;
      if (
        m.stage !== "TO_DRAFT" &&
        m.stage !== "DRAFTED_FOR_VALIDATION" &&
        m.stage !== "STRATEGY_DEFINED" &&
        m.stage !== "TO_SEND"
      ) {
        continue;
      }
      if (!missionDraftDoneSinceMonday(m)) continue;
      const name = brandLabel(m);
      if (!name) continue;
      const key = `${m.talentId}:${brandResearchKey(name)}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(m);
    }
    out.sort(
      (a, b) => missionTimeMs(b.updatedAt) - missionTimeMs(a.updatedAt)
    );
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allOpenMissions, missions]);

  const periodList =
    periodTab === "before"
      ? beforeMondayList
      : periodTab === "since"
        ? sinceMondayList
        : [];
  const isDoneTab = periodTab === "done";

  function selectPeriodTab(id: PeriodTab) {
    setPeriodTab(id);
    if (!onFocusMissions) return;
    if (id === "done") {
      onFocusMissions({
        missionIds: doneSinceMondayList.map((m) => m.id),
        stage: "DRAFTED_FOR_VALIDATION",
        label: `Déjà faits depuis ${BATCH_SINCE_LABEL}`,
      });
      return;
    }
    if (id === "since") {
      const ids = sinceMondayList.map((m) => m.id);
      // Sans brouillon → À rédiger ; avec vieux brouillon rare → prêt
      const mostlyDraft = sinceMondayList.every((m) => !hasCompleteDraft(m));
      onFocusMissions({
        missionIds: ids,
        stage: mostlyDraft ? "TO_DRAFT" : "DRAFTED_FOR_VALIDATION",
        label: `À faire depuis ${BATCH_SINCE_LABEL}`,
      });
      return;
    }
    if (id === "before") {
      onFocusMissions({
        missionIds: beforeMondayList.map((m) => m.id),
        stage: "DRAFTED_FOR_VALIDATION",
        label: `À refaire (avant ${BATCH_SINCE_LABEL})`,
      });
      return;
    }
    onFocusMissions(null);
  }

  useEffect(() => {
    if (periodTab !== "done" || !onFocusMissions) return;
    onFocusMissions({
      missionIds: doneSinceMondayList.map((m) => m.id),
      stage: "DRAFTED_FOR_VALIDATION",
      label: `Déjà faits depuis ${BATCH_SINCE_LABEL}`,
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodTab, doneSinceMondayList]);

  const nextChunk = useMemo(
    () => periodList.slice(0, Math.max(1, batchSize)),
    [periodList, batchSize]
  );

  const talentCountInPeriod = useMemo(
    () => new Set(periodList.map((m) => m.talentId).filter(Boolean)).size,
    [periodList]
  );

  const brandCacheCount = useMemo(
    () =>
      nextChunk.filter((m) => {
        const tid = m.talentId!;
        return hasBrandCacheEntry(
          loadIndivBrandResearchCache(tid),
          m.marqueNom,
          m.targetBrand
        );
      }).length,
    [nextChunk, cacheTick]
  );
  const talentCacheCount = useMemo(
    () =>
      nextChunk.filter((m) => {
        const tid = m.talentId!;
        const hit = lookupBrandCache(
          loadIndivTalentResearchCache(tid),
          m.marqueNom,
          m.targetBrand
        );
        return Array.isArray(hit) && hit.length > 0;
      }).length,
    [nextChunk, cacheTick]
  );

  function poolFrom(opts?: BatchRunOpts): MissionLite[] {
    return opts?.scope ?? nextChunk;
  }

  function talentProjectPayload(m: MissionLite, brandName: string) {
    const t = resolveTalent(m);
    return {
      projectBrief: {
        talentId: t.id,
        projectTitle: null,
        projectDescription: null,
        creatorName: t.name || m.creatorName,
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
    const pool = poolFrom(opts);
    const talentN = new Set(pool.map((m) => m.talentId).filter(Boolean)).size;
    if (pool.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Aucune marque à analyser depuis ${BATCH_SINCE_LABEL} (tous talents).`
        );
      }
      return true;
    }
    const targets = pool.filter((m) => {
      const tid = m.talentId!;
      return !hasBrandCacheEntry(
        loadIndivBrandResearchCache(tid),
        m.marqueNom,
        m.targetBrand,
        brandLabel(m)
      );
    });
    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Toutes les marques du batch sont déjà analysées (${pool.length}, ${talentN} talent${talentN > 1 ? "s" : ""}).`
        );
      }
      return true;
    }

    batchAbortRef.current?.abort();
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const analyzeOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const t = resolveTalent(m);
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
      cacheBrandResearch(t.id, brandName, data as CachedBrandResearch);
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
            `Marques OK (${targets.length}, tous talents). Ensuite : analyser les talents.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      if (!opts?.quiet) {
        setSuccess(
          `Marques OK (${result.done}) · ${talentN} talent${talentN > 1 ? "s" : ""}.`
        );
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
    const pool = poolFrom(opts);
    const talentN = new Set(pool.map((m) => m.talentId).filter(Boolean)).size;
    if (pool.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Aucune marque à analyser depuis ${BATCH_SINCE_LABEL} (tous talents).`
        );
      }
      return true;
    }

    const withBrand = pool.filter((m) =>
      hasBrandCacheEntry(
        loadIndivBrandResearchCache(m.talentId!),
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
      const hit = lookupBrandCache(
        loadIndivTalentResearchCache(m.talentId!),
        m.marqueNom,
        m.targetBrand
      );
      return !(Array.isArray(hit) && hit.length > 0);
    });
    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Talents déjà analysés pour toutes les marques du batch (${talentCacheCount}).`
        );
      }
      return true;
    }

    batchAbortRef.current?.abort();
    const ac = new AbortController();
    batchAbortRef.current = ac;

    const analyzeOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const t = resolveTalent(m);
      const res = await fetch("/api/casting/talent-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          brandName,
          talentIds: [t.id],
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
      cacheTalentResearch(t.id, brandName, list);
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
          setSuccess(`Talents OK (${targets.length}) — tous talents du batch.`);
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchResearch(null);
      if (!opts?.quiet) {
        setSuccess(`Talents OK (${result.done}) — tous talents du batch.`);
      }
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
    const pool = poolFrom(opts);
    const talentN = new Set(pool.map((m) => m.talentId).filter(Boolean)).size;
    if (pool.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Aucune marque à analyser depuis ${BATCH_SINCE_LABEL} (tous talents).`
        );
      }
      return true;
    }
    const withBrand = pool.filter((m) =>
      hasBrandCacheEntry(
        loadIndivBrandResearchCache(m.talentId!),
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
          loadIndivLeynaExchangeCache(m.talentId!),
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

    const scannedBrandOnly: string[] = [];
    const foundExchangeNoEmail: string[] = [];

    const analyzeOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const t = resolveTalent(m);
      const contacts = await resolveContactsForMission(m, {
        signal: ac.signal,
        draftContacts: draftsFor(m),
      });
      const emails = contacts.map((c) => c.email);
      // Sans email → scan Leyna par nom de marque (objet / corps / domaine).
      // La rédaction peut quand même partir : generate-email refait ce scan.
      if (emails.length === 0) {
        if (brandName.trim().length < 2) {
          throw new Error("Sans email ni nom de marque — scan Leyna impossible");
        }
        scannedBrandOnly.push(`${t.name} · ${brandName}`);
      } else {
        await persistContactsIfNeeded(m, contacts).catch(() => {});
      }
      const res = await fetch("/api/casting/leyna-exchange-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          recipientEmails: emails,
          brandName,
          talentNames: [t.name].filter(Boolean),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Scan boîte mail impossible"
        );
      }
      const ctx = (data?.context || { hasExchange: false }) as CachedLeynaExchange;
      if (emails.length === 0 && Boolean(ctx.hasExchange)) {
        foundExchangeNoEmail.push(`${t.name} · ${brandName}`);
      }
      cacheLeynaExchange(t.id, brandName, {
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

    const brandScanNote = () => {
      const parts: string[] = [];
      const brandOnly = Array.from(new Set(scannedBrandOnly.filter(Boolean)));
      const withHit = Array.from(new Set(foundExchangeNoEmail.filter(Boolean)));
      if (brandOnly.length > 0) {
        const preview = brandOnly.slice(0, 5).join(", ");
        const more = brandOnly.length > 5 ? ` (+${brandOnly.length - 5})` : "";
        parts.push(
          `${brandOnly.length} sans email → scan Leyna par nom de marque (${preview}${more})`
        );
      }
      if (withHit.length > 0) {
        const preview = withHit.slice(0, 5).join(", ");
        const more = withHit.length > 5 ? ` (+${withHit.length - 5})` : "";
        parts.push(
          `${withHit.length} déjà vue(s) sur Leyna sans contact carte (rédaction quand même) : ${preview}${more}`
        );
      }
      return parts.length ? ` ${parts.join(". ")}.` : "";
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
            `Boîte mail OK ${ok}/${targets.length}. Encore en échec : ${stillFailed.join(", ")}.${brandScanNote()}`
          );
        } else if (!opts?.quiet) {
          setSuccess(`Boîte mail OK (${targets.length}).${brandScanNote()}`);
        } else if (scannedBrandOnly.length > 0 || foundExchangeNoEmail.length > 0) {
          setSuccess(brandScanNote().trim());
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchLeyna(null);
      if (!opts?.quiet) {
        setSuccess(`Boîte mail OK (${result.done}).${brandScanNote()}`);
      } else if (scannedBrandOnly.length > 0 || foundExchangeNoEmail.length > 0) {
        setSuccess(brandScanNote().trim());
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
    const pool = poolFrom(opts);
    const talentN = new Set(pool.map((m) => m.talentId).filter(Boolean)).size;
    if (pool.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          `Aucune marque à rédiger depuis ${BATCH_SINCE_LABEL} (tous talents).`
        );
      }
      return true;
    }

    const targets = pool.filter((m) => {
      // Pas de contact OK : le mail se rédige quand même (contexte Leyna par marque).
      if (m.sentAt || m.stage === "SENT") return false;
      // Brouillon déjà OK depuis le 19 → skip (les plus vieux sont bien refaits).
      if (missionDraftDoneSinceMonday(m)) return false;
      const tid = m.talentId!;
      if (
        !hasBrandCacheEntry(
          loadIndivBrandResearchCache(tid),
          m.marqueNom,
          m.targetBrand
        )
      ) {
        return false;
      }
      const talentHit = lookupBrandCache(
        loadIndivTalentResearchCache(tid),
        m.marqueNom,
        m.targetBrand
      );
      return Array.isArray(talentHit) && talentHit.length > 0;
    });

    if (targets.length === 0) {
      if (!opts?.quiet) {
        setSuccess(
          "Rien à rédiger (déjà OK depuis le 19, ou analyses marque/talent manquantes)."
        );
      }
      return true;
    }

    batchDraftAbortRef.current?.abort();
    const ac = new AbortController();
    batchDraftAbortRef.current = ac;

    const draftOne = async (m: MissionLite) => {
      const brandName = brandLabel(m);
      const t = resolveTalent(m);
      const brandCacheNow = loadIndivBrandResearchCache(t.id);
      const talentCacheNow = loadIndivTalentResearchCache(t.id);
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
      await persistContactsIfNeeded(m, contacts).catch(() => {});

      // Sans contact carte : emails éventuels du scan Leyna (marque) pour le contexte.
      let recipientEmails = contacts.map((c) => c.email).filter(Boolean);
      if (recipientEmails.length === 0) {
        const leynaHit = lookupBrandCache(
          loadIndivLeynaExchangeCache(t.id),
          m.marqueNom,
          m.targetBrand,
          brandName
        );
        recipientEmails = Array.from(
          new Set(
            (Array.isArray(leynaHit?.contacts) ? leynaHit!.contacts! : [])
              .map((c) => String(c.email || "").trim())
              .filter((e) => e.includes("@"))
          )
        );
      }

      const talentsPayload = [
        {
          talentId: t.id,
          name: t.name,
          niche: "—",
          followers: 0,
          igFollowers: 0,
          ttFollowers: 0,
          instagram: t.instagram ?? null,
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
        m.clientLanguage === "EN" ||
        (contacts.length > 0 && enCount >= contacts.length / 2)
          ? "en"
          : "fr";

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

      const patch: Record<string, unknown> = {
        stage: "DRAFTED_FOR_VALIDATION",
        status: "EMAIL_DRAFTED",
        draftEmailSubject: subject,
        draftEmailBody: body,
        draftLanguage: genLanguage,
      };
      // Ne pas écraser les contacts carte avec une liste vide.
      if (contacts.length > 0) {
        patch.clientContacts = contacts.map((c) => ({
          firstname: c.firstname || "",
          lastname: c.lastname || "",
          email: c.email,
          role: c.role || "",
        }));
      }
      await patchMissionDraft(m.id, patch);
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
            `Mails rédigés (${targets.length}) · ${talentN} talent${talentN > 1 ? "s" : ""} — à valider.`
          );
        }
        return !ac.signal.aborted;
      }
      if (ac.signal.aborted) return false;
      setBatchDraft(null);
      await onChanged();
      if (!opts?.quiet) {
        setSuccess(
          `Mails rédigés (${result.done}) · ${talentN} talent${talentN > 1 ? "s" : ""} — à valider.`
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

  async function runBatchFullPipeline(opts?: BatchRunOpts) {
    const pool = poolFrom(opts);
    const talentN = new Set(pool.map((m) => m.talentId).filter(Boolean)).size;
    if (
      batchResearch?.running ||
      batchLeyna?.running ||
      batchDraft?.running ||
      batchPipelineActiveRef.current
    ) {
      return;
    }
    if (pool.length === 0) {
      setSuccess(
        `Rien à faire : tout est déjà OK depuis ${BATCH_SINCE_LABEL}, ou aucune carte ouverte.`
      );
      return;
    }
    bumpCache();
    batchPipelineActiveRef.current = true;
    setError(null);
    try {
      setBatchPipeline({ running: true, step: 1, label: "Marques" });
      const brandsOk = await runBatchBrandResearch({ quiet: true, scope: pool });
      if (!batchPipelineActiveRef.current || !brandsOk) return;

      setBatchPipeline({ running: true, step: 2, label: "Talents" });
      const talentsOk = await runBatchTalentResearch({ quiet: true, scope: pool });
      if (!batchPipelineActiveRef.current || !talentsOk) return;

      setBatchPipeline({ running: true, step: 3, label: "Boîte mail Leyna" });
      await runBatchLeynaExchange({ quiet: true, scope: pool });
      if (!batchPipelineActiveRef.current) return;

      setBatchPipeline({ running: true, step: 4, label: "Rédaction mails" });
      await runBatchDraftEmails({ quiet: true, scope: pool });
      if (!batchPipelineActiveRef.current) return;

      const n = pool.length;
      const t = talentN;
      await onChanged();
      await reloadAllOpenMissions();
      const label =
        periodTab === "before"
          ? `brouillons d’avant ${BATCH_SINCE_LABEL}`
          : `cartes depuis ${BATCH_SINCE_LABEL}`;
      const doneIds = pool.map((m) => m.id);
      onFocusMissions?.({
        missionIds: doneIds,
        stage: "DRAFTED_FOR_VALIDATION",
        label: `Lot terminé (${n})`,
      });
      setPeriodTab("done");
      setSuccess(
        `Lot terminé — ${n} carte${n > 1 ? "s" : ""} · ${t} talent${t > 1 ? "s" : ""} (${label}). Elles sont dans « Prêt à envoyer » — tu peux ajouter les contacts.`
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

  const tabBtn = (id: PeriodTab, label: string, count: number) => {
    const active = periodTab === id;
    return (
      <button
        type="button"
        key={id}
        disabled={running}
        onClick={() => selectPeriodTab(id)}
        className="inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-semibold transition disabled:opacity-50"
        style={
          active
            ? { background: "#0f172a", color: "#fff" }
            : { background: "#f1f5f9", color: "#0f172a" }
        }
      >
        {label}
        <span
          className="rounded-md px-1.5 py-0.5 text-xs tabular-nums"
          style={
            active
              ? { background: "rgba(255,255,255,0.15)" }
              : { background: "#e2e8f0" }
          }
        >
          {count}
        </span>
      </button>
    );
  };

  return (
    <div className="mt-3 w-full rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        {tabBtn("since", "À faire · depuis le 19", sinceMondayList.length)}
        {tabBtn("before", "À refaire · avant le 19", beforeMondayList.length)}
        {tabBtn("done", "Déjà faits · depuis le 19", doneSinceMondayList.length)}
      </div>

      <div className="mt-3 flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs leading-snug text-slate-500">
            {batchPipeline?.running
              ? `Pipeline ${batchPipeline.step}/4 · ${batchPipeline.label} — lot en cours (${periodTab === "before" ? "avant" : "depuis"} le 19).`
              : isDoneTab
                ? `Brouillons OK depuis ${BATCH_SINCE_LABEL} — affichés en cartes dans « Prêt à envoyer » (contacts, revoir le mail, etc.). ${doneSinceMondayList.length} carte${doneSinceMondayList.length > 1 ? "s" : ""}.`
                : periodTab === "before"
                  ? `Brouillons faits avant ${BATCH_SINCE_LABEL} — on les refait. ${beforeMondayList.length} cartes · ${talentCountInPeriod} talent${talentCountInPeriod > 1 ? "s" : ""}. Lance par lots pour éviter de saturer.`
                  : `Cartes depuis ${BATCH_SINCE_LABEL} pas encore OK. ${sinceMondayList.length} cartes · ${talentCountInPeriod} talent${talentCountInPeriod > 1 ? "s" : ""}.`}
          </p>
          {!running && !isDoneTab && periodList.length > 0 ? (
            <p className="m-0 mt-1.5 text-xs text-slate-600">
              Prochain lot : <strong>{nextChunk.length}</strong> / {periodList.length}
              {periodList.length > nextChunk.length
                ? ` — il restera ${periodList.length - nextChunk.length} après`
                : " — dernier lot"}
            </p>
          ) : null}
          {isDoneTab ? (
            <p className="m-0 mt-1.5 text-xs font-medium text-slate-700">
              ↓ Regarde la grille « Prêt à envoyer » en dessous — ce sont les vraies cartes.
            </p>
          ) : null}
          {(batchResearch?.running ||
            batchLeyna?.running ||
            batchDraft?.running) && (
            <div className="mt-2.5 flex flex-col gap-2">
              {batchResearch?.running ? (
                <ProgressRow
                  label={`${batchPipeline?.running ? `${batchPipeline.step}/4 · ` : ""}${
                    batchResearch.phase === "marques" ? "Marques" : "Talents"
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

        <div className="flex flex-wrap items-center gap-2">
          {!isDoneTab && !running ? (
            <label className="inline-flex items-center gap-1.5 text-xs text-slate-600">
              Taille du lot
              <select
                value={batchSize}
                onChange={(e) => setBatchSize(Number(e.target.value))}
                className="rounded-md border border-slate-200 bg-white px-2 py-1.5 text-sm font-semibold text-slate-900"
              >
                {[10, 25, 50, 100].map((n) => (
                  <option key={n} value={n}>
                    {n}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {isDoneTab ? null : running ? (
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
                disabled={!canRun || nextChunk.length === 0}
                onClick={() =>
                  void runBatchFullPipeline({ scope: nextChunk })
                }
                title={`Lance un lot de ${nextChunk.length} (onglet ${periodTab === "before" ? "avant" : "depuis"} le 19)`}
              >
                Lancer le lot ({nextChunk.length})
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={!canRun || periodList.length === 0}
                onClick={() =>
                  void runBatchFullPipeline({ scope: periodList })
                }
                title="Tout l’onglet d’un coup — plus long"
              >
                Tout l’onglet ({periodList.length})
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={!canRun || nextChunk.length === 0}
                onClick={() =>
                  void runBatchBrandResearch({ scope: nextChunk })
                }
              >
                Marques
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={
                  !canRun || nextChunk.length === 0 || brandCacheCount === 0
                }
                onClick={() =>
                  void runBatchTalentResearch({ scope: nextChunk })
                }
              >
                Talents
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={
                  !canRun || nextChunk.length === 0 || brandCacheCount === 0
                }
                onClick={() =>
                  void runBatchLeynaExchange({ scope: nextChunk })
                }
              >
                Boîte mail
              </button>
              <button
                type="button"
                className={btnBase}
                style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
                disabled={
                  !canRun ||
                  nextChunk.length === 0 ||
                  brandCacheCount === 0 ||
                  talentCacheCount === 0
                }
                onClick={() =>
                  void runBatchDraftEmails({ scope: nextChunk })
                }
              >
                Rédiger
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
