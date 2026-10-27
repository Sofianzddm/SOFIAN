"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Image from "next/image";
import {
  Check,
  ChevronDown,
  ChevronRight,
  Loader2,
  SkipForward,
  Sparkles,
  X,
} from "lucide-react";
import { isBelgianPays } from "@/lib/pays";
import {
  cacheOutreachBrandResearchMarkets,
  cacheOutreachRosterFitMarkets,
  cacheOutreachSelectedTalentsMarkets,
  cacheOutreachTalentResearchMarkets,
  hasOutreachBrandCacheEntry,
  loadOutreachBrandResearchCacheMarkets,
  loadOutreachLeynaExchangeCacheMarkets,
  loadOutreachRosterFitCacheMarkets,
  loadOutreachSelectedTalentsCacheMarkets,
  loadOutreachTalentResearchCacheMarkets,
  lookupOutreachBrandCache,
  outreachCacheMarketsForContact,
  type OutreachCachedBrandResearch,
  type OutreachCachedLeynaExchange,
  type OutreachCachedRosterFitItem,
  type OutreachCachedTalentResearchItem,
} from "@/lib/outreach-clients-batch-cache";
import {
  cacheIndivBrandResearch,
  cacheIndivTalentResearch,
  loadIndivBrandResearchCache,
  loadIndivLeynaExchangeCache,
  loadIndivTalentResearchCache,
  lookupIndivBrandCache,
  type IndivCachedBrandResearch,
  type IndivCachedLeynaExchange,
  type IndivCachedTalentResearchItem,
} from "@/lib/indiv-talent-batch-cache";

/** Enrichit talent-research avec l’angle casting (roster-fit) pour la rédaction. */
function mergeCastingAnglesIntoTalentResearch(
  research: OutreachCachedTalentResearchItem[],
  fits: OutreachCachedRosterFitItem[] | null | undefined
): OutreachCachedTalentResearchItem[] {
  if (!fits?.length) return research;
  const byId = new Map(fits.map((f) => [f.talentId, f]));
  return research.map((r) => {
    const fit = byId.get(r.talentId);
    if (!fit) return r;
    const suggestedAngle = (fit.suggestedAngle || "").trim();
    const castingWhyFit = (fit.whyFit || "").trim();
    if (!suggestedAngle && !castingWhyFit) return r;
    return {
      ...r,
      ...(suggestedAngle ? { suggestedAngle } : {}),
      ...(castingWhyFit ? { castingWhyFit } : {}),
    };
  });
}

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";

export type OutreachCastingTargetRef = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  language?: string | null;
  pipeline?: "FR" | "BENELUX";
  siblingTargetId?: string;
  siblingPipeline?: "FR" | "BENELUX";
  draftSubject?: string | null;
  draftBodyHtml?: string | null;
};

export type OutreachCastingBrand = {
  groupKey: string;
  company: string;
  coveredBrands?: string[];
  emails?: string[];
  pipeline?: "FR" | "BENELUX";
  alsoInSiblingMarket?: boolean;
  targets: OutreachCastingTargetRef[];
};

type PresskitTalent = {
  id: string;
  prenom: string;
  nom: string;
  photo?: string | null;
  pays?: string | null;
  niches?: string[];
  instagram?: string | null;
  igFollowers?: number;
  igEngagement?: number;
  ttFollowers?: number;
  ttEngagement?: number;
};

type Props = {
  open: boolean;
  market: "FR" | "BENELUX";
  readBothMarkets?: boolean;
  brands: OutreachCastingBrand[];
  onClose: () => void;
  onFlash?: (kind: "success" | "error", message: string) => void;
  /** Persiste le brouillon généré (sujet + HTML) sur les cibles du groupe. */
  onSaveDraft: (
    brand: OutreachCastingBrand,
    subject: string,
    bodyHtml: string
  ) => Promise<void>;
  /** Ouvre le CastingComposer pour contrôle / envoi (draft optionnel = anti-race). */
  onReviewBrand: (
    groupKey: string,
    draft?: { subject: string; bodyHtml: string }
  ) => void;
  /**
   * Envoi direct depuis l’aperçu mail (indiv : schedule-send).
   * Si absent → seul « Contrôler » reste.
   */
  onSendBrand?: (
    groupKey: string,
    draft: { subject: string; bodyHtml: string }
  ) => Promise<void>;
  /** Après rédaction batch réussie — parent peut recharger les targets. */
  onDraftsWritten?: () => void;
  /**
   * Mode pipeline indiv : 1 talent verrouillé × N marques.
   * Utilise les caches indiv + sélection auto de ce talent.
   */
  lockedTalentId?: string | null;
  /** Libellé header (ex. « Casting indiv · Tatiana »). */
  wizardTitle?: string;
};

type Phase = "casting" | "writing" | "review";

function pitchNamesForBrand(b: OutreachCastingBrand): string[] {
  const covered = (b.coveredBrands || []).map((x) => x.trim()).filter(Boolean);
  if (covered.length > 0) return Array.from(new Set(covered));
  const company = (b.company || "").trim();
  return company ? [company] : [];
}

function defaultPitchBrand(b: OutreachCastingBrand): string {
  return pitchNamesForBrand(b)[0] || (b.company || "").trim();
}

function nicheColor(i: number): string {
  const colors = ["#1A1110", "#C08B8B", "#5B7C6E", "#8B6F5C"];
  return colors[i % colors.length]!;
}

function formatFollowers(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}k`;
  return String(n || 0);
}

function fitScoreColor(score: number): { bg: string; color: string; border: string } {
  if (score >= 75)
    return { bg: "#ecfdf5", color: "#065f46", border: "#a7f3d0" };
  if (score >= 50)
    return { bg: "#fffbeb", color: "#92400e", border: "#fde68a" };
  return { bg: "#f8fafc", color: "#64748b", border: "#e2e8f0" };
}

function autoPickRecommended(
  fits: OutreachCachedRosterFitItem[],
  max = 8
): string[] {
  return [...fits]
    .filter((f) => f.recommended)
    .sort((a, b) => b.fitScore - a.fitScore)
    .slice(0, max)
    .map((f) => f.talentId);
}

function skipStorageKey(market: string, both: boolean): string {
  return `outreach-casting-skip:${both ? "BOTH" : market}`;
}

function loadSkipSet(market: string, both: boolean): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = localStorage.getItem(skipStorageKey(market, both));
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function saveSkipSet(market: string, both: boolean, set: Set<string>) {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(
      skipStorageKey(market, both),
      JSON.stringify(Array.from(set))
    );
  } catch {
    // ignore
  }
}

/**
 * Wizard Outreach Clients : marque (brief cache) → talents → Suivant,
 * puis batch rédaction, puis file de contrôle.
 */
export default function OutreachCastingWizard({
  open,
  market,
  readBothMarkets = false,
  brands,
  onClose,
  onFlash,
  onSaveDraft,
  onReviewBrand,
  onSendBrand,
  onDraftsWritten,
  lockedTalentId = null,
  wizardTitle,
}: Props) {
  const isIndivMode = Boolean(lockedTalentId);
  const viewCacheMarkets = useMemo(
    (): Array<"FR" | "BENELUX"> =>
      readBothMarkets ? ["FR", "BENELUX"] : [market],
    [readBothMarkets, market]
  );
  const talentMarket: "FR" | "BENELUX" | "BOTH" = readBothMarkets
    ? "BOTH"
    : market;

  const [phase, setPhase] = useState<Phase>("casting");
  const [index, setIndex] = useState(0);
  const [skipped, setSkipped] = useState<Set<string>>(() => new Set());
  const [pitchOverride, setPitchOverride] = useState<Record<string, string>>(
    {}
  );
  const [selectedByBrand, setSelectedByBrand] = useState<
    Record<string, string[]>
  >({});
  const [talents, setTalents] = useState<PresskitTalent[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(false);
  const [talentsError, setTalentsError] = useState<string | null>(null);

  const [writeDone, setWriteDone] = useState(0);
  const [writeTotal, setWriteTotal] = useState(0);
  const [writeCurrent, setWriteCurrent] = useState("");
  const [writeFailed, setWriteFailed] = useState(0);
  const [readyKeys, setReadyKeys] = useState<string[]>([]);
  const [negoReviewKeys, setNegoReviewKeys] = useState<string[]>([]);
  /** Aperçu mail dans le wizard (outreach + indiv). */
  const [localDrafts, setLocalDrafts] = useState<
    Record<string, { subject: string; bodyHtml: string }>
  >({});
  const abortRef = useRef<AbortController | null>(null);

  /** Fits casting IA indexés par groupKey → talentId */
  const [fitByBrand, setFitByBrand] = useState<
    Record<string, Record<string, OutreachCachedRosterFitItem>>
  >({});
  const [fitRunning, setFitRunning] = useState(false);
  const [fitDone, setFitDone] = useState(0);
  const [fitTotal, setFitTotal] = useState(0);
  const [fitCurrent, setFitCurrent] = useState("");
  const [fitFailed, setFitFailed] = useState(0);
  const [expandedFitId, setExpandedFitId] = useState<string | null>(null);
  /** Job serveur (survit à la fermeture de page). */
  const [fitJobId, setFitJobId] = useState<string | null>(null);
  const fitPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appliedFitBrandsRef = useRef<Set<string>>(new Set());
  /** Rédaction d’une seule marque (sans bloquer le batch casting). */
  const [writingOneKey, setWritingOneKey] = useState<string | null>(null);
  const writeOneAbortRef = useRef<AbortController | null>(null);
  const [sendingKey, setSendingKey] = useState<string | null>(null);
  const [sentKeys, setSentKeys] = useState<string[]>([]);
  /** Dès qu’un fit marque est done → rédaction (client outreach / serveur indiv). */
  const [autoWriteAfterFit, setAutoWriteAfterFit] = useState(true);
  const [autoWriteQueueLen, setAutoWriteQueueLen] = useState(0);
  const [autoWriteCurrent, setAutoWriteCurrent] = useState("");
  /** Invalide le cache marque indiv après analyse inline (clic → fit). */
  const [indivCacheTick, setIndivCacheTick] = useState(0);
  const [brandPrepCurrent, setBrandPrepCurrent] = useState("");
  /** Indiv : rédaction via CastingIndivDraftJob (survit à la fermeture). */
  const [serverDraftRunning, setServerDraftRunning] = useState(false);
  const [serverDraftJobId, setServerDraftJobId] = useState<string | null>(null);
  const [serverDraftDone, setServerDraftDone] = useState(0);
  const [serverDraftTotal, setServerDraftTotal] = useState(0);
  const [serverDraftFailed, setServerDraftFailed] = useState(0);
  const [serverDraftCurrent, setServerDraftCurrent] = useState("");
  const autoWriteAfterFitRef = useRef(true);
  const autoWriteQueueRef = useRef<
    Array<{ groupKey: string; talentIds: string[] }>
  >([]);
  const autoWriteBusyRef = useRef(false);
  const autoWriteDoneKeysRef = useRef<Set<string>>(new Set());
  const drainAutoWriteRef = useRef<() => void>(() => {});
  const enqueueAutoWriteRef = useRef<(groupKey: string, talentIds: string[]) => void>(
    () => {}
  );
  const serverDraftPollRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const pendingServerDraftKeysRef = useRef<Set<string>>(new Set());
  /** Déjà envoyés (ou en cours d’envoi) au job rédaction serveur. */
  const serverDraftQueuedRef = useRef<Set<string>>(new Set());
  const serverDraftStartingRef = useRef(false);
  const startIndivServerDraftRef = useRef<(keys?: string[]) => void>(() => {});
  const startOutreachServerDraftRef = useRef<(keys?: string[]) => void>(() => {});
  const readyKeysRef = useRef<string[]>([]);
  const localDraftsRef = useRef(localDrafts);
  const fitByBrandRef = useRef(fitByBrand);
  const selectedByBrandRef = useRef(selectedByBrand);
  useEffect(() => {
    fitByBrandRef.current = fitByBrand;
  }, [fitByBrand]);
  useEffect(() => {
    selectedByBrandRef.current = selectedByBrand;
  }, [selectedByBrand]);

  useEffect(() => {
    readyKeysRef.current = readyKeys;
  }, [readyKeys]);
  useEffect(() => {
    localDraftsRef.current = localDrafts;
  }, [localDrafts]);

  /** Marché fit isolé en indiv pour ne pas collisionner avec Outreach FR. */
  const fitMarketKey = lockedTalentId
    ? `INDIV:${lockedTalentId}`
    : readBothMarkets
      ? "BOTH"
      : market;

  useEffect(() => {
    autoWriteAfterFitRef.current = autoWriteAfterFit;
  }, [autoWriteAfterFit]);

  const brandCache = useMemo(
    () => loadOutreachBrandResearchCacheMarkets(viewCacheMarkets),
    [viewCacheMarkets, open, brands]
  );
  const leynaCache = useMemo(
    () => loadOutreachLeynaExchangeCacheMarkets(viewCacheMarkets),
    [viewCacheMarkets, open, brands]
  );

  const indivBrandCache = useMemo(
    () =>
      lockedTalentId ? loadIndivBrandResearchCache(lockedTalentId) : {},
    [lockedTalentId, open, brands, indivCacheTick]
  );

  const brandsWithCache = useMemo(() => {
    if (isIndivMode) {
      // Indiv : toutes les marques du lot (brief optionnel — sinon message vide).
      return brands.filter((b) => pitchNamesForBrand(b).length > 0);
    }
    return brands.filter((b) => {
      const names = pitchNamesForBrand(b);
      return (
        names.length > 0 &&
        names.some((n) => hasOutreachBrandCacheEntry(brandCache, n, b.company))
      );
    });
  }, [brands, brandCache, isIndivMode]);

  // Init sélection + skips à l’ouverture.
  useEffect(() => {
    if (!open) return;
    setPhase("casting");
    setIndex(0);
    setWriteDone(0);
    setWriteTotal(0);
    setWriteCurrent("");
    setWriteFailed(0);
    setReadyKeys([]);
    setNegoReviewKeys([]);
    setPitchOverride({});
    setFitRunning(false);
    setFitDone(0);
    setFitTotal(0);
    setFitCurrent("");
    setFitFailed(0);
    setExpandedFitId(null);
    setWritingOneKey(null);
    setSendingKey(null);
    setSentKeys([]);
    setFitJobId(null);
    setAutoWriteQueueLen(0);
    setAutoWriteCurrent("");
    setServerDraftRunning(false);
    setServerDraftJobId(null);
    setServerDraftDone(0);
    setServerDraftTotal(0);
    setServerDraftFailed(0);
    setServerDraftCurrent("");
    appliedFitBrandsRef.current = new Set();
    autoWriteQueueRef.current = [];
    autoWriteBusyRef.current = false;
    autoWriteDoneKeysRef.current = new Set();
    pendingServerDraftKeysRef.current = new Set();
    serverDraftQueuedRef.current = new Set();
    serverDraftStartingRef.current = false;
    if (fitPollRef.current) {
      clearInterval(fitPollRef.current);
      fitPollRef.current = null;
    }
    if (serverDraftPollRef.current) {
      clearInterval(serverDraftPollRef.current);
      serverDraftPollRef.current = null;
    }
    writeOneAbortRef.current?.abort();

    const skip = loadSkipSet(
      isIndivMode ? `indiv:${lockedTalentId}` : market,
      isIndivMode ? false : readBothMarkets
    );
    setSkipped(skip);

    const selectedCache =
      loadOutreachSelectedTalentsCacheMarkets(viewCacheMarkets);
    const rosterFitCache =
      loadOutreachRosterFitCacheMarkets(viewCacheMarkets);
    const nextSel: Record<string, string[]> = {};
    const nextFit: Record<
      string,
      Record<string, OutreachCachedRosterFitItem>
    > = {};
    const nextDrafts: Record<string, { subject: string; bodyHtml: string }> =
      {};
    const nextReady: string[] = [];
    for (const b of brands) {
      const pitch = defaultPitchBrand(b);
      const existing = b.targets.find(
        (t) =>
          (t.draftSubject || "").trim() && (t.draftBodyHtml || "").trim()
      );
      if (existing) {
        nextDrafts[b.groupKey] = {
          subject: String(existing.draftSubject || "").trim(),
          bodyHtml: String(existing.draftBodyHtml || "").trim(),
        };
        nextReady.push(b.groupKey);
      }
      if (lockedTalentId) {
        nextSel[b.groupKey] = [lockedTalentId];
      } else {
        const ids =
          lookupOutreachBrandCache(
            selectedCache,
            pitch,
            b.company,
            ...(b.coveredBrands || [])
          ) || [];
        if (ids.length > 0) nextSel[b.groupKey] = ids;
      }
      const fits =
        lookupOutreachBrandCache(
          rosterFitCache,
          pitch,
          b.company,
          ...(b.coveredBrands || [])
        ) || null;
      if (fits && fits.length > 0) {
        const map: Record<string, OutreachCachedRosterFitItem> = {};
        for (const f of fits) {
          if (f?.talentId) map[f.talentId] = f;
        }
        nextFit[b.groupKey] = map;
      }
    }
    setSelectedByBrand(nextSel);
    setFitByBrand(nextFit);
    setLocalDrafts(nextDrafts);
    setReadyKeys(nextReady);

    // Reprendre à la première marque non skip / sans sélection (outreach)
    // ou sans brouillon (indiv — talent déjà sélectionné).
    const startIdx = brandsWithCache.findIndex((b) => {
      if (skip.has(b.groupKey)) return false;
      if (lockedTalentId) return !nextDrafts[b.groupKey];
      const sel = nextSel[b.groupKey] || [];
      return sel.length === 0;
    });
    setIndex(startIdx >= 0 ? startIdx : 0);
  }, [open]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot à l’open

  // Charge le presskit selon le marché.
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoadingTalents(true);
    setTalentsError(null);
    const q =
      talentMarket === "BOTH"
        ? "presskit=true&market=FR"
        : `presskit=true&market=${talentMarket}`;
    fetch(`/api/talents?${q}`, { credentials: "include" })
      .then(async (res) => {
        if (!res.ok) {
          const j = await res.json().catch(() => ({}));
          throw new Error(
            typeof j.message === "string"
              ? j.message
              : "Chargement des talents impossible."
          );
        }
        return res.json();
      })
      .then((data: { talents?: PresskitTalent[] }) => {
        if (cancelled) return;
        const allRaw = Array.isArray(data.talents) ? data.talents : [];
        const all =
          talentMarket === "BENELUX"
            ? allRaw.filter(
                (t) =>
                  t.pays == null ||
                  String(t.pays).trim() === "" ||
                  isBelgianPays(t.pays)
              )
            : allRaw;
        setTalents(all);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setTalentsError(
            e instanceof Error ? e.message : "Erreur réseau talents."
          );
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingTalents(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, talentMarket]);

  const current = brandsWithCache[index] || null;

  useEffect(() => {
    setExpandedFitId(null);
  }, [index, current?.groupKey]);

  const currentPitch = useMemo(() => {
    if (!current) return "";
    return (
      pitchOverride[current.groupKey] ||
      defaultPitchBrand(current)
    );
  }, [current, pitchOverride]);

  const currentBrief = useMemo((): OutreachCachedBrandResearch | null => {
    if (!current || !currentPitch) return null;
    if (lockedTalentId) {
      const indiv = lookupIndivBrandCache(
        indivBrandCache,
        currentPitch,
        current.company,
        ...(current.coveredBrands || [])
      ) as IndivCachedBrandResearch | null;
      return indiv;
    }
    return lookupOutreachBrandCache(
      brandCache,
      currentPitch,
      current.company,
      ...(current.coveredBrands || [])
    );
  }, [current, currentPitch, brandCache, lockedTalentId, indivBrandCache]);

  const currentDraft = useMemo(() => {
    if (!current) return null;
    return localDrafts[current.groupKey] || null;
  }, [current, localDrafts]);

  const currentSelected = useMemo(() => {
    if (!current) return new Set<string>();
    return new Set(selectedByBrand[current.groupKey] || []);
  }, [current, selectedByBrand]);

  const castingProgress = useMemo(() => {
    let done = 0;
    for (const b of brandsWithCache) {
      if (skipped.has(b.groupKey)) {
        done += 1;
        continue;
      }
      // Indiv : talent déjà verrouillé → on compte les mails rédigés.
      if (isIndivMode) {
        if (localDrafts[b.groupKey] || readyKeys.includes(b.groupKey)) {
          done += 1;
        }
        continue;
      }
      if ((selectedByBrand[b.groupKey] || []).length > 0) done += 1;
    }
    return { done, total: brandsWithCache.length };
  }, [
    brandsWithCache,
    skipped,
    selectedByBrand,
    isIndivMode,
    localDrafts,
    readyKeys,
  ]);

  const writableBrands = useMemo(
    () =>
      brandsWithCache.filter(
        (b) =>
          !skipped.has(b.groupKey) &&
          (selectedByBrand[b.groupKey] || []).length > 0
      ),
    [brandsWithCache, skipped, selectedByBrand]
  );

  // Outreach : toutes les marques ont une sélection. Indiv : talent déjà verrouillé.
  const allCastingDone =
    brandsWithCache.length > 0 &&
    (isIndivMode
      ? brandsWithCache.every(
          (b) =>
            skipped.has(b.groupKey) ||
            (selectedByBrand[b.groupKey] || []).length > 0
        )
      : castingProgress.done >= brandsWithCache.length);

  const persistSelection = useCallback(
    (brand: OutreachCastingBrand, pitch: string, ids: string[]) => {
      const markets = outreachCacheMarketsForContact({
        pipeline: brand.pipeline || market,
        alsoInSiblingMarket: brand.alsoInSiblingMarket || readBothMarkets,
      });
      if (pitch) cacheOutreachSelectedTalentsMarkets(markets, pitch, ids);
    },
    [market, readBothMarkets]
  );

  const toggleTalent = useCallback(
    (talentId: string) => {
      if (!current) return;
      // Mode indiv : talent figé.
      if (lockedTalentId) return;
      setSelectedByBrand((prev) => {
        const cur = new Set(prev[current.groupKey] || []);
        if (cur.has(talentId)) cur.delete(talentId);
        else {
          if (cur.size >= 8) return prev;
          cur.add(talentId);
        }
        const ids = Array.from(cur);
        persistSelection(current, currentPitch, ids);
        return { ...prev, [current.groupKey]: ids };
      });
    },
    [current, currentPitch, persistSelection, lockedTalentId]
  );

  const goNext = useCallback(() => {
    if (!current) return;
    const ids = selectedByBrand[current.groupKey] || [];
    if (ids.length === 0) {
      onFlash?.("error", "Sélectionne au moins un talent, ou passe la marque.");
      return;
    }
    if (index < brandsWithCache.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setPhase("review");
      onFlash?.(
        "success",
        `Casting terminé (${writableBrands.length} marque${writableBrands.length > 1 ? "s" : ""}). Lance « Rédiger ».`
      );
    }
  }, [
    current,
    selectedByBrand,
    index,
    brandsWithCache.length,
    writableBrands.length,
    onFlash,
  ]);

  const skipBrand = useCallback(() => {
    if (!current) return;
    setSkipped((prev) => {
      const next = new Set(prev);
      next.add(current.groupKey);
      saveSkipSet(market, readBothMarkets, next);
      return next;
    });
    if (index < brandsWithCache.length - 1) {
      setIndex((i) => i + 1);
    } else {
      setPhase("review");
    }
  }, [current, index, brandsWithCache.length, market, readBothMarkets]);

  const unskipAndEdit = useCallback(
    (groupKey: string) => {
      setSkipped((prev) => {
        const next = new Set(prev);
        next.delete(groupKey);
        saveSkipSet(market, readBothMarkets, next);
        return next;
      });
      const idx = brandsWithCache.findIndex((b) => b.groupKey === groupKey);
      if (idx >= 0) {
        setIndex(idx);
        setPhase("casting");
      }
    },
    [brandsWithCache, market, readBothMarkets]
  );

  const currentFits = useMemo(() => {
    if (!current) return {} as Record<string, OutreachCachedRosterFitItem>;
    return fitByBrand[current.groupKey] || {};
  }, [current, fitByBrand]);

  const sortedTalents = useMemo(() => {
    const base = lockedTalentId
      ? talents.filter((t) => t.id === lockedTalentId)
      : talents;
    const hasFits = Object.keys(currentFits).length > 0;
    if (!hasFits) return base;
    return [...base].sort((a, b) => {
      const fa = currentFits[a.id];
      const fb = currentFits[b.id];
      const ra = fa?.recommended ? 1 : 0;
      const rb = fb?.recommended ? 1 : 0;
      if (ra !== rb) return rb - ra;
      return (fb?.fitScore || 0) - (fa?.fitScore || 0);
    });
  }, [talents, currentFits, lockedTalentId]);

  // Indiv : si le talent n’est pas dans le presskit marché, on le charge à part.
  useEffect(() => {
    if (!open || !lockedTalentId) return;
    if (talents.some((t) => t.id === lockedTalentId)) return;
    let cancelled = false;
    fetch(`/api/talents/${encodeURIComponent(lockedTalentId)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        const data = await res.json().catch(() => ({}));
        if (!res.ok) return;
        const t = data.talent || data;
        if (!t?.id || cancelled) return;
        const stats = t.stats || {};
        const niches = Array.isArray(t.niches)
          ? t.niches.map((n: unknown) => String(n || "").trim()).filter(Boolean)
          : [];
        setTalents((prev) => {
          if (prev.some((x) => x.id === lockedTalentId)) return prev;
          return [
            {
              id: String(t.id),
              prenom: String(t.prenom || ""),
              nom: String(t.nom || ""),
              photo: t.photoUrl || t.photo || null,
              pays: t.pays || null,
              niches,
              instagram: t.instagram || null,
              igFollowers: Number(stats.igFollowers || 0) || 0,
              igEngagement: Number(stats.igEngagement || 0) || 0,
              ttFollowers: Number(stats.ttFollowers || 0) || 0,
              ttEngagement: Number(stats.ttEngagement || 0) || 0,
            },
            ...prev,
          ];
        });
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [open, lockedTalentId, talents]);

  const brandsMissingFit = useMemo(() => {
    return brandsWithCache.filter((b) => {
      if (skipped.has(b.groupKey)) return false;
      const map = fitByBrand[b.groupKey];
      return !map || Object.keys(map).length === 0;
    });
  }, [brandsWithCache, skipped, fitByBrand]);

  const applyJobBrandResult = useCallback(
    (
      groupKey: string,
      brandName: string,
      company: string | null | undefined,
      list: OutreachCachedRosterFitItem[],
      brandResearch?: OutreachCachedBrandResearch | null
    ) => {
      if (appliedFitBrandsRef.current.has(groupKey)) return;
      appliedFitBrandsRef.current.add(groupKey);

      const brand = brandsWithCache.find((b) => b.groupKey === groupKey);
      const pitch =
        (brand && (pitchOverride[brand.groupKey] || defaultPitchBrand(brand))) ||
        brandName;
      const markets = outreachCacheMarketsForContact({
        pipeline: brand?.pipeline || market,
        alsoInSiblingMarket:
          brand?.alsoInSiblingMarket || readBothMarkets,
      });
      cacheOutreachRosterFitMarkets(markets, pitch, list);
      if (
        brandResearch &&
        (brandResearch.newProducts ||
          brandResearch.brandPositioning ||
          brandResearch.influenceStrategy ||
          brandResearch.recentCampaigns ||
          brandResearch.availabilityFrEu)
      ) {
        if (lockedTalentId) {
          cacheIndivBrandResearch(
            lockedTalentId,
            pitch || company || brandName,
            brandResearch as IndivCachedBrandResearch
          );
          setIndivCacheTick((n) => n + 1);
        } else {
          cacheOutreachBrandResearchMarkets(
            markets,
            pitch || company || brandName,
            brandResearch
          );
        }
      }

      const map: Record<string, OutreachCachedRosterFitItem> = {};
      for (const f of list) {
        if (f?.talentId) map[f.talentId] = f;
      }
      setFitByBrand((prev) => ({ ...prev, [groupKey]: map }));

      if (brand) {
        setSelectedByBrand((prev) => {
          if (lockedTalentId) {
            const picks = [lockedTalentId];
            persistSelection(brand, pitch, picks);
            return { ...prev, [groupKey]: picks };
          }
          const existing = prev[groupKey] || [];
          if (existing.length > 0) return prev;
          const picks = autoPickRecommended(list, 8);
          if (picks.length === 0) return prev;
          persistSelection(brand, pitch, picks);
          return { ...prev, [groupKey]: picks };
        });
      }
    },
    [
      brandsWithCache,
      pitchOverride,
      market,
      readBothMarkets,
      persistSelection,
      lockedTalentId,
    ]
  );

  const stopFitPoll = useCallback(() => {
    if (fitPollRef.current) {
      clearInterval(fitPollRef.current);
      fitPollRef.current = null;
    }
  }, []);

  const pollFitJob = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/casting/roster-fit-jobs/${jobId}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          completed?: number;
          failed?: number;
          totalBrands?: number;
          currentBrandName?: string | null;
          brands?: Array<{
            groupKey: string;
            brandName: string;
            company?: string | null;
            status: string;
            brandResearch?: OutreachCachedBrandResearch | null;
            talents?: OutreachCachedRosterFitItem[];
          }>;
          error?: string;
        };
        if (!res.ok) return;

        setFitDone(Number(data.completed || 0) + Number(data.failed || 0));
        setFitFailed(Number(data.failed || 0));
        setFitTotal(Number(data.totalBrands || 0));
        setFitCurrent(data.currentBrandName || "");

        for (const b of data.brands || []) {
          if (b.status === "done" && Array.isArray(b.talents) && b.talents.length) {
            applyJobBrandResult(
              b.groupKey,
              b.brandName,
              b.company,
              b.talents,
              b.brandResearch
            );
            if (!autoWriteAfterFitRef.current) continue;
            const hasDraft =
              Boolean(localDraftsRef.current[b.groupKey]) ||
              readyKeysRef.current.includes(b.groupKey);
            if (hasDraft || autoWriteDoneKeysRef.current.has(b.groupKey)) {
              continue;
            }
            // File serveur (indiv OU outreach) — survit à la fermeture / VPS.
            if (!serverDraftQueuedRef.current.has(b.groupKey)) {
              const picks = lockedTalentId
                ? [lockedTalentId]
                : autoPickRecommended(b.talents, 8);
              if (picks.length === 0) continue;
              pendingServerDraftKeysRef.current.add(b.groupKey);
              try {
                const storageKey = lockedTalentId
                  ? `casting-indiv-pending-draft:${lockedTalentId}`
                  : `casting-outreach-pending-draft:${fitMarketKey}`;
                sessionStorage.setItem(
                  storageKey,
                  JSON.stringify(
                    Array.from(pendingServerDraftKeysRef.current)
                  )
                );
              } catch {
                /* ignore */
              }
            }
          }
        }

        const terminal = ["completed", "failed", "cancelled"].includes(
          String(data.status || "")
        );
        if (terminal) {
          stopFitPoll();
          setFitRunning(false);
          setFitJobId(null);
          const ok = Number(data.completed || 0);
          const fail = Number(data.failed || 0);
          if (data.status === "cancelled") {
            onFlash?.(
              "error",
              `Analyse casting arrêtée (${ok} OK${fail ? `, ${fail} échec(s)` : ""}).`
            );
          } else {
            if (autoWriteAfterFitRef.current) {
              for (const b of data.brands || []) {
                if (b.status !== "done" || !Array.isArray(b.talents)) continue;
                const hasDraft =
                  Boolean(localDraftsRef.current[b.groupKey]) ||
                  readyKeysRef.current.includes(b.groupKey);
                if (
                  hasDraft ||
                  autoWriteDoneKeysRef.current.has(b.groupKey) ||
                  serverDraftQueuedRef.current.has(b.groupKey)
                ) {
                  continue;
                }
                const picks = lockedTalentId
                  ? [lockedTalentId]
                  : autoPickRecommended(b.talents, 8);
                if (picks.length === 0) continue;
                pendingServerDraftKeysRef.current.add(b.groupKey);
              }
            }
            const pendingDraft = pendingServerDraftKeysRef.current.size;
            onFlash?.(
              fail > 0 && ok === 0 ? "error" : "success",
              ok > 0
                ? `Casting analysé · ${ok} marque${ok > 1 ? "s" : ""}${
                    fail ? ` · ${fail} échec(s)` : ""
                  }${
                    autoWriteAfterFitRef.current && pendingDraft > 0
                      ? " · rédaction serveur lancée (tu peux quitter)."
                      : autoWriteAfterFitRef.current
                        ? " · aucun OUI casting → pas de rédaction auto."
                        : ". Vérifie les OUI puis rédige."
                  }`
                : "Analyse casting échouée — réessaie."
            );
            if (autoWriteAfterFitRef.current && pendingDraft > 0) {
              if (lockedTalentId) {
                startIndivServerDraftRef.current(
                  Array.from(pendingServerDraftKeysRef.current)
                );
              } else {
                startOutreachServerDraftRef.current(
                  Array.from(pendingServerDraftKeysRef.current)
                );
              }
            }
          }
        }
      } catch (e) {
        console.error("[outreach-casting] poll job:", e);
      }
    },
    [applyJobBrandResult, stopFitPoll, onFlash, lockedTalentId, fitMarketKey]
  );

  const startFitPoll = useCallback(
    (jobId: string) => {
      stopFitPoll();
      setFitJobId(jobId);
      setFitRunning(true);
      void pollFitJob(jobId);
      fitPollRef.current = setInterval(() => {
        void pollFitJob(jobId);
      }, 3000);
    },
    [stopFitPoll, pollFitJob]
  );

  // Reprend le job fit actif (FR / BENELUX / BOTH / INDIV:talentId).
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const marketKey = fitMarketKey;
    void (async () => {
      try {
        const res = await fetch(
          `/api/casting/roster-fit-jobs?market=${encodeURIComponent(marketKey)}`,
          { credentials: "include" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          active?: {
            id: string;
            status: string;
            market?: string;
            totalBrands?: number;
            completed?: number;
            failed?: number;
            currentBrandName?: string | null;
          } | null;
          jobs?: Array<{
            id: string;
            status: string;
            market?: string;
            totalBrands?: number;
            completed?: number;
            failed?: number;
            currentBrandName?: string | null;
          }>;
        };
        if (cancelled || !res.ok) return;
        const match =
          (data.jobs || []).find(
            (j) =>
              j.market === marketKey &&
              ["pending", "running"].includes(j.status)
          ) ||
          (data.active &&
          data.active.market === marketKey &&
          ["pending", "running"].includes(data.active.status)
            ? data.active
            : null);
        if (!match?.id) return;
        setFitTotal(Number(match.totalBrands || 0));
        setFitDone(
          Number(match.completed || 0) + Number(match.failed || 0)
        );
        setFitFailed(Number(match.failed || 0));
        setFitCurrent(match.currentBrandName || "");
        startFitPoll(match.id);
        onFlash?.(
          "success",
          lockedTalentId
            ? "Job casting indiv repris — tu peux quitter, la rédaction serveur suivra."
            : `Job casting ${marketKey} repris — d’autres marchés peuvent tourner en parallèle.`
        );
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, fitMarketKey, lockedTalentId]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot à l’open / market

  useEffect(() => {
    return () => {
      stopFitPoll();
    };
  }, [stopFitPoll]);

  const cancelFitJob = useCallback(async () => {
    if (!fitJobId) {
      stopFitPoll();
      setFitRunning(false);
      return;
    }
    try {
      await fetch(`/api/casting/roster-fit-jobs/${fitJobId}`, {
        method: "DELETE",
        credentials: "include",
      });
    } catch {
      /* ignore */
    }
    stopFitPoll();
    setFitRunning(false);
    setFitJobId(null);
    onFlash?.("error", "Arrêt demandé — le serveur s’arrête à la marque en cours.");
  }, [fitJobId, stopFitPoll, onFlash]);

  const runRosterFitBatch = useCallback(async () => {
    if (fitRunning || phase !== "casting") return;
    if (talents.length === 0) {
      onFlash?.("error", "Roster talents pas encore chargée.");
      return;
    }
    const targets =
      brandsMissingFit.length > 0
        ? brandsMissingFit
        : brandsWithCache.filter((b) => !skipped.has(b.groupKey));
    if (targets.length === 0) {
      onFlash?.("error", "Aucune marque à analyser (brief manquant ou tout skip).");
      return;
    }

    const talentIds = (
      lockedTalentId
        ? [lockedTalentId]
        : talents.map((t) => t.id).filter(Boolean)
    ).slice(0, 30);

    appliedFitBrandsRef.current = new Set(
      Object.keys(fitByBrand).filter((k) => Object.keys(fitByBrand[k] || {}).length > 0)
    );
    setFitRunning(true);
    setFitDone(0);
    setFitTotal(targets.length);
    setFitFailed(0);
    setFitCurrent(targets[0]?.company || "");
    setBrandPrepCurrent("");

    try {
      // Brief optionnel : worker fait analyse marque si manquant (survit / VPS).
      const liveIndivCache = lockedTalentId
        ? loadIndivBrandResearchCache(lockedTalentId)
        : {};
      const emptyBrief: OutreachCachedBrandResearch = {
        recentCampaigns: "",
        newProducts: "",
        availabilityFrEu: "",
        brandPositioning: "",
        influenceStrategy: "",
      };

      const payloadBrands: Array<{
        groupKey: string;
        brandName: string;
        company: string;
        brandResearch: OutreachCachedBrandResearch;
        targetIds?: string[];
        pipeline?: "FR" | "BENELUX";
      }> = [];

      for (const brand of targets) {
        const pitch =
          pitchOverride[brand.groupKey] || defaultPitchBrand(brand);
        const brief = lockedTalentId
          ? ((lookupIndivBrandCache(
              liveIndivCache,
              pitch,
              brand.company,
              ...(brand.coveredBrands || [])
            ) as OutreachCachedBrandResearch | null) || emptyBrief)
          : lookupOutreachBrandCache(
              brandCache,
              pitch,
              brand.company,
              ...(brand.coveredBrands || [])
            );
        // Outreach : brief encore requis côté UI (analyse marque pipeline).
        // Indiv : emptyBrief OK → serveur fait marque + fit.
        if (!brief) continue;
        payloadBrands.push({
          groupKey: brand.groupKey,
          brandName: pitch || brand.company,
          company: brand.company,
          brandResearch: brief,
          ...(lockedTalentId
            ? {}
            : {
                targetIds: brand.targets.map((t) => t.id).filter(Boolean),
                pipeline:
                  brand.pipeline === "BENELUX" ? "BENELUX" : ("FR" as const),
              }),
        });
      }

      if (payloadBrands.length === 0) {
        throw new Error(
          lockedTalentId
            ? "Aucune marque à analyser pour ce lot."
            : "Aucun brief marque en cache pour lancer le job."
        );
      }

      setFitTotal(payloadBrands.length);
      setFitCurrent(payloadBrands[0]?.brandName || "");

      const res = await fetch("/api/casting/roster-fit-jobs", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          market: fitMarketKey,
          talentIds,
          brands: payloadBrands,
        }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        jobId?: string;
        parallelActive?: number;
        error?: string;
        message?: string;
      };
      if (!res.ok || !data.jobId) {
        throw new Error(
          typeof data.error === "string" ? data.error : "Impossible de lancer le job"
        );
      }
      const n = Number(data.parallelActive || 1);
      onFlash?.(
        "success",
        data.message ||
          (lockedTalentId
            ? `Fit casting lancé — marque + fit serveur (tu peux quitter).`
            : `Fit casting lancé (${n} actif${n > 1 ? "s" : ""} en parallèle).`)
      );
      startFitPoll(data.jobId);
    } catch (e) {
      setFitRunning(false);
      setBrandPrepCurrent("");
      onFlash?.(
        "error",
        e instanceof Error ? e.message : "Lancement job impossible."
      );
    }
  }, [
    fitRunning,
    phase,
    talents,
    brandsMissingFit,
    brandsWithCache,
    skipped,
    pitchOverride,
    brandCache,
    fitByBrand,
    fitMarketKey,
    startFitPoll,
    onFlash,
    lockedTalentId,
  ]);

  const writeBrandDraft = useCallback(
    async (
      brand: OutreachCastingBrand,
      signal: AbortSignal,
      talentIdsOverride?: string[]
    ): Promise<{ needsNego: boolean; subject: string; bodyHtml: string }> => {
      const pitch =
        pitchOverride[brand.groupKey] || defaultPitchBrand(brand);
      const talentIds = (
        talentIdsOverride?.length
          ? talentIdsOverride
          : selectedByBrand[brand.groupKey] || []
      ).slice(0, 8);
      if (talentIds.length === 0) {
        throw new Error("Aucun talent sélectionné");
      }
      if (isIndivMode && lockedTalentId) {
        const fit = fitByBrand[brand.groupKey]?.[lockedTalentId];
        if (!fit) {
          throw new Error(
            "Fit casting obligatoire — lance « Analyser le casting »."
          );
        }
      }

      const markets = outreachCacheMarketsForContact({
        pipeline: brand.pipeline || market,
        alsoInSiblingMarket: brand.alsoInSiblingMarket || readBothMarkets,
      });

      const talentCacheLive = loadOutreachTalentResearchCacheMarkets(
        viewCacheMarkets
      );

      let talentResearch: OutreachCachedTalentResearchItem[] | null = null;
      if (lockedTalentId) {
        talentResearch =
          (lookupIndivBrandCache(
            loadIndivTalentResearchCache(lockedTalentId),
            pitch,
            brand.company,
            ...(brand.coveredBrands || [])
          ) as IndivCachedTalentResearchItem[] | null) || null;
      } else {
        talentResearch =
          lookupOutreachBrandCache(
            talentCacheLive,
            pitch,
            brand.company,
            ...(brand.coveredBrands || [])
          ) || null;
      }
      const cachedIds = new Set(
        (talentResearch || []).map((t) => t.talentId).filter(Boolean)
      );
      const sameSet =
        talentResearch &&
        cachedIds.size === talentIds.length &&
        talentIds.every((id) => cachedIds.has(id));

      if (!sameSet) {
        const trRes = await fetch("/api/casting/talent-research", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({ brandName: pitch, talentIds }),
        });
        const trData = await trRes.json().catch(() => ({}));
        if (!trRes.ok) {
          throw new Error(
            typeof trData.error === "string"
              ? trData.error
              : "Analyse talents impossible"
          );
        }
        const list = Array.isArray(trData.talents) ? trData.talents : [];
        talentResearch = list as OutreachCachedTalentResearchItem[];
        if (lockedTalentId) {
          cacheIndivTalentResearch(lockedTalentId, pitch, list);
        } else {
          cacheOutreachTalentResearchMarkets(markets, pitch, talentResearch);
          cacheOutreachSelectedTalentsMarkets(markets, pitch, talentIds);
        }
      }

      const brandResearch = lockedTalentId
        ? (lookupIndivBrandCache(
            loadIndivBrandResearchCache(lockedTalentId),
            pitch,
            brand.company,
            ...(brand.coveredBrands || [])
          ) as OutreachCachedBrandResearch | null)
        : lookupOutreachBrandCache(
            brandCache,
            pitch,
            brand.company,
            ...(brand.coveredBrands || [])
          );
      if (!brandResearch) {
        throw new Error(
          isIndivMode
            ? "Analyse marque manquante — lance « Marques » dans la barre batch."
            : "Analyse marque manquante — relance le batch marques."
        );
      }

      const leyna = lockedTalentId
        ? (lookupIndivBrandCache(
            loadIndivLeynaExchangeCache(lockedTalentId),
            pitch,
            brand.company,
            ...(brand.coveredBrands || [])
          ) as IndivCachedLeynaExchange | null)
        : (lookupOutreachBrandCache(
            leynaCache,
            pitch,
            brand.company,
            ...(brand.coveredBrands || [])
          ) as OutreachCachedLeynaExchange | null);

      // Angles casting (Oui/Non) → injectés dans la rédaction, sans remplacer talent-research.
      const rosterFits =
        lookupOutreachBrandCache(
          loadOutreachRosterFitCacheMarkets(viewCacheMarkets),
          pitch,
          brand.company,
          ...(brand.coveredBrands || [])
        ) ||
        (fitByBrand[brand.groupKey]
          ? Object.values(fitByBrand[brand.groupKey] || {})
          : null);
      const talentResearchWithAngles = mergeCastingAnglesIntoTalentResearch(
        talentResearch || [],
        rosterFits
      );

      const selectedTalents = talentIds
        .map((id) => talents.find((t) => t.id === id))
        .filter((t): t is PresskitTalent => Boolean(t));

      const talentsPayload = selectedTalents.map((t) => {
        const followers = Math.max(t.igFollowers || 0, t.ttFollowers || 0);
        const eng =
          (t.igEngagement || 0) > 0
            ? t.igEngagement
            : (t.ttEngagement || 0) > 0
              ? t.ttEngagement
              : undefined;
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
      });

      const recipientEmails = (brand.emails || [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => e.includes("@"));
      const lang =
        brand.targets.every((t) => t.language === "en") ? "en" : "fr";
      const composerMarket =
        brand.alsoInSiblingMarket || readBothMarkets
          ? "BOTH"
          : brand.pipeline === "BENELUX"
            ? "BENELUX"
            : "FR";
      const availabilityFocus: "FR" | "BE" =
        brand.pipeline === "BENELUX" && !brand.alsoInSiblingMarket
          ? "BE"
          : "FR";
      const agencyName =
        brand.company &&
        brand.company.toLowerCase() !== pitch.toLowerCase()
          ? brand.company
          : undefined;

      const genOnce = async (ackNego: boolean) => {
        const res = await fetch("/api/casting/generate-email", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          signal,
          body: JSON.stringify({
            language: lang,
            market: composerMarket,
            availabilityFocus,
            brandName: pitch,
            agencyName,
            brandResearch,
            talents: talentsPayload,
            recipientEmails,
            talentResearch:
              talentResearchWithAngles.length > 0
                ? talentResearchWithAngles
                : talentResearch || undefined,
            negotiationReviewAcknowledged: ackNego || undefined,
            leynaExchangeCache: leyna
              ? {
                  hasExchange: Boolean(leyna.hasExchange),
                  hasSentNoReplyOnly: Boolean(leyna.hasSentNoReplyOnly),
                  tone: leyna.tone ?? null,
                  bannerLabel: leyna.bannerLabel ?? null,
                  alerts: leyna.alerts || [],
                  promptBlockFr: leyna.promptBlockFr || "",
                  promptBlockEn: leyna.promptBlockEn || "",
                  scanStatus:
                    leyna.scanStatus ||
                    (leyna.hasExchange ? "ok" : "empty"),
                  fetchedAt: leyna.fetchedAt || null,
                  contacts: leyna.contacts || [],
                }
              : undefined,
          }),
        });
        const data = await res.json().catch(() => ({}));
        return { res, data };
      };

      let needsNego = false;
      let { res: genRes, data: genData } = await genOnce(false);
      if (!genRes.ok && genData.code === "NEEDS_NEGOTIATION_REVIEW") {
        needsNego = true;
        ({ res: genRes, data: genData } = await genOnce(true));
      }
      if (!genRes.ok) {
        throw new Error(
          typeof genData.error === "string"
            ? genData.error
            : "Génération mail impossible"
        );
      }

      const subject = String(genData.subject || "").trim();
      const bodyHtml = String(genData.body || "").trim();
      if (!subject || !bodyHtml) {
        throw new Error("Mail généré vide");
      }

      await onSaveDraft(brand, subject, bodyHtml);
      setLocalDrafts((prev) => ({
        ...prev,
        [brand.groupKey]: { subject, bodyHtml },
      }));
      return { needsNego, subject, bodyHtml };
    },
    [
      pitchOverride,
      selectedByBrand,
      market,
      readBothMarkets,
      viewCacheMarkets,
      brandCache,
      leynaCache,
      fitByBrand,
      talents,
      onSaveDraft,
      lockedTalentId,
      isIndivMode,
    ]
  );

  /** File série : même writeBrandDraft que le bouton manuel (qualité identique). */
  const drainAutoWriteQueue = useCallback(async () => {
    if (autoWriteBusyRef.current) return;
    autoWriteBusyRef.current = true;
    try {
      while (autoWriteQueueRef.current.length > 0) {
        if (!autoWriteAfterFitRef.current) {
          autoWriteQueueRef.current = [];
          setAutoWriteQueueLen(0);
          setAutoWriteCurrent("");
          break;
        }
        const next = autoWriteQueueRef.current.shift()!;
        setAutoWriteQueueLen(autoWriteQueueRef.current.length);
        const brand = brandsWithCache.find((b) => b.groupKey === next.groupKey);
        if (!brand || skipped.has(next.groupKey)) continue;
        if (autoWriteDoneKeysRef.current.has(next.groupKey)) continue;
        if (readyKeys.includes(next.groupKey)) {
          autoWriteDoneKeysRef.current.add(next.groupKey);
          continue;
        }
        const hasDraft = brand.targets.some(
          (t) =>
            (t.draftSubject || "").trim() && (t.draftBodyHtml || "").trim()
        );
        if (hasDraft) {
          autoWriteDoneKeysRef.current.add(next.groupKey);
          setReadyKeys((prev) =>
            prev.includes(next.groupKey) ? prev : [...prev, next.groupKey]
          );
          continue;
        }

        const ac = new AbortController();
        writeOneAbortRef.current = ac;
        setWritingOneKey(next.groupKey);
        setAutoWriteCurrent(brand.company);
        try {
          const { needsNego } = await writeBrandDraft(
            brand,
            ac.signal,
            next.talentIds
          );
          if (ac.signal.aborted) break;
          autoWriteDoneKeysRef.current.add(next.groupKey);
          setReadyKeys((prev) =>
            prev.includes(next.groupKey) ? prev : [...prev, next.groupKey]
          );
          if (needsNego) {
            setNegoReviewKeys((prev) =>
              prev.includes(next.groupKey) ? prev : [...prev, next.groupKey]
            );
          }
          onDraftsWritten?.();
        } catch (e) {
          if (ac.signal.aborted) break;
          console.error(
            `[outreach-casting] auto-write ${brand.company}:`,
            e
          );
          onFlash?.(
            "error",
            e instanceof Error
              ? `Rédaction auto ${brand.company} : ${e.message}`
              : `Rédaction auto impossible (${brand.company}).`
          );
        } finally {
          if (writeOneAbortRef.current === ac) {
            setWritingOneKey(null);
          }
          setAutoWriteCurrent("");
        }
      }
    } finally {
      autoWriteBusyRef.current = false;
      setAutoWriteQueueLen(autoWriteQueueRef.current.length);
      if (autoWriteQueueRef.current.length > 0) {
        void drainAutoWriteRef.current();
      }
    }
  }, [
    brandsWithCache,
    skipped,
    readyKeys,
    writeBrandDraft,
    onDraftsWritten,
    onFlash,
  ]);

  useEffect(() => {
    drainAutoWriteRef.current = () => {
      void drainAutoWriteQueue();
    };
  }, [drainAutoWriteQueue]);

  const enqueueAutoWrite = useCallback(
    (groupKey: string, talentIds: string[]) => {
      if (!autoWriteAfterFitRef.current) return;
      if (!talentIds.length) return;
      if (autoWriteDoneKeysRef.current.has(groupKey)) return;
      if (readyKeysRef.current.includes(groupKey)) return;
      if (localDraftsRef.current[groupKey]) return;
      if (skipped.has(groupKey)) return;
      if (
        autoWriteQueueRef.current.some((q) => q.groupKey === groupKey) ||
        writingOneKey === groupKey
      ) {
        return;
      }
      autoWriteQueueRef.current.push({ groupKey, talentIds });
      setAutoWriteQueueLen(autoWriteQueueRef.current.length);
      void drainAutoWriteRef.current();
    },
    [skipped, writingOneKey]
  );

  useEffect(() => {
    enqueueAutoWriteRef.current = enqueueAutoWrite;
  }, [enqueueAutoWrite]);

  const stopServerDraftPoll = useCallback(() => {
    if (serverDraftPollRef.current) {
      clearInterval(serverDraftPollRef.current);
      serverDraftPollRef.current = null;
    }
  }, []);

  const pollIndivServerDraft = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/casting/indiv-draft-jobs/${jobId}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          completed?: number;
          failed?: number;
          totalMissions?: number;
          currentBrandName?: string | null;
          items?: Array<{
            missionId: string;
            status: string;
            draftSubject?: string | null;
            draftBodyHtml?: string | null;
          }>;
        };
        if (!res.ok) return;

        setServerDraftDone(
          Number(data.completed || 0) + Number(data.failed || 0)
        );
        setServerDraftFailed(Number(data.failed || 0));
        setServerDraftTotal(Number(data.totalMissions || 0));
        setServerDraftCurrent(data.currentBrandName || "");
        setAutoWriteCurrent(data.currentBrandName || "");
        setAutoWriteQueueLen(
          Math.max(
            0,
            Number(data.totalMissions || 0) -
              Number(data.completed || 0) -
              Number(data.failed || 0)
          )
        );

        const doneItems = (data.items || []).filter((it) => it.status === "done");
        if (doneItems.length > 0) {
          setReadyKeys((prev) => {
            const next = new Set(prev);
            for (const it of doneItems) next.add(it.missionId);
            return Array.from(next);
          });
          setLocalDrafts((prev) => {
            const next = { ...prev };
            for (const it of doneItems) {
              const subject = String(it.draftSubject || "").trim();
              const bodyHtml = String(it.draftBodyHtml || "").trim();
              if (subject && bodyHtml) {
                next[it.missionId] = { subject, bodyHtml };
              }
              autoWriteDoneKeysRef.current.add(it.missionId);
              pendingServerDraftKeysRef.current.delete(it.missionId);
            }
            return next;
          });
        }

        const terminal = ["completed", "failed", "cancelled"].includes(
          String(data.status || "")
        );
        if (terminal) {
          stopServerDraftPoll();
          setServerDraftRunning(false);
          setServerDraftJobId(null);
          setAutoWriteCurrent("");
          setAutoWriteQueueLen(0);
          const ok = Number(data.completed || 0);
          const fail = Number(data.failed || 0);
          onDraftsWritten?.();
          onFlash?.(
            data.status === "cancelled" || (ok === 0 && fail > 0)
              ? "error"
              : "success",
            data.status === "cancelled"
              ? `Rédaction serveur arrêtée (${ok} OK${fail ? `, ${fail} échec(s)` : ""}).`
              : ok > 0
                ? `Mails rédigés serveur · ${ok}${
                    fail ? ` · ${fail} échec(s)` : ""
                  }. Contrôle dans « Prêt à envoyer ».`
                : "Rédaction serveur échouée — réessaie."
          );
          // Enchaîne s’il reste des marques fittées en attente.
          const leftover = Array.from(pendingServerDraftKeysRef.current).filter(
            (k) =>
              !autoWriteDoneKeysRef.current.has(k) &&
              !readyKeysRef.current.includes(k) &&
              !serverDraftQueuedRef.current.has(k)
          );
          if (leftover.length > 0 && autoWriteAfterFitRef.current) {
            startIndivServerDraftRef.current(leftover);
          }
        }
      } catch (e) {
        console.error("[outreach-casting] poll indiv draft:", e);
      }
    },
    [stopServerDraftPoll, onDraftsWritten, onFlash]
  );

  const startIndivServerDraft = useCallback(
    async (keys?: string[]) => {
      if (!lockedTalentId || serverDraftStartingRef.current) return;
      const source =
        keys && keys.length > 0
          ? keys
          : Array.from(pendingServerDraftKeysRef.current);
      const missionIds = [
        ...new Set(
          source.filter((k) => {
            if (!k) return false;
            if (autoWriteDoneKeysRef.current.has(k)) return false;
            if (readyKeysRef.current.includes(k)) return false;
            if (localDraftsRef.current[k]) return false;
            if (serverDraftQueuedRef.current.has(k)) return false;
            return true;
          })
        ),
      ];
      if (missionIds.length === 0) return;
      if (serverDraftJobId && serverDraftRunning) {
        for (const k of missionIds) pendingServerDraftKeysRef.current.add(k);
        return;
      }

      serverDraftStartingRef.current = true;
      for (const k of missionIds) serverDraftQueuedRef.current.add(k);
      try {
        // Job déjà chaîné par le worker fit → on poll, pas de doublon.
        const existingRes = await fetch(
          `/api/casting/indiv-draft-jobs?talentId=${encodeURIComponent(lockedTalentId)}`,
          { credentials: "include" }
        );
        const existing = (await existingRes.json().catch(() => ({}))) as {
          active?: {
            id: string;
            status: string;
            totalMissions?: number;
            completed?: number;
            failed?: number;
            currentBrandName?: string | null;
          } | null;
        };
        if (
          existingRes.ok &&
          existing.active?.id &&
          ["pending", "running"].includes(existing.active.status)
        ) {
          for (const k of missionIds) {
            pendingServerDraftKeysRef.current.delete(k);
          }
          setServerDraftJobId(existing.active.id);
          setServerDraftRunning(true);
          setServerDraftTotal(Number(existing.active.totalMissions || 0));
          setServerDraftDone(
            Number(existing.active.completed || 0) +
              Number(existing.active.failed || 0)
          );
          setServerDraftFailed(Number(existing.active.failed || 0));
          setServerDraftCurrent(existing.active.currentBrandName || "");
          setAutoWriteCurrent(existing.active.currentBrandName || "");
          onFlash?.(
            "success",
            "Rédaction serveur déjà en cours (enchaînée après le fit)."
          );
          stopServerDraftPoll();
          void pollIndivServerDraft(existing.active.id);
          serverDraftPollRef.current = setInterval(() => {
            void pollIndivServerDraft(existing.active!.id);
          }, 3000);
          return;
        }

        const items = missionIds.map((missionId) => {
          const brand = brandsWithCache.find((b) => b.groupKey === missionId);
          const pitch = brand
            ? pitchOverride[brand.groupKey] || defaultPitchBrand(brand)
            : "";
          return {
            missionId,
            talentId: lockedTalentId,
            brandName: pitch || brand?.company || "Marque",
          };
        });
        const res = await fetch("/api/casting/indiv-draft-jobs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            talentId: lockedTalentId,
            items,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          jobId?: string;
          totalMissions?: number;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.jobId) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Impossible de lancer la rédaction serveur"
          );
        }
        for (const k of missionIds) {
          pendingServerDraftKeysRef.current.delete(k);
        }
        try {
          const rest = Array.from(pendingServerDraftKeysRef.current);
          if (rest.length === 0) {
            sessionStorage.removeItem(
              `casting-indiv-pending-draft:${lockedTalentId}`
            );
          } else {
            sessionStorage.setItem(
              `casting-indiv-pending-draft:${lockedTalentId}`,
              JSON.stringify(rest)
            );
          }
        } catch {
          /* ignore */
        }
        setServerDraftJobId(data.jobId);
        setServerDraftRunning(true);
        setServerDraftDone(0);
        setServerDraftFailed(0);
        setServerDraftTotal(Number(data.totalMissions || items.length));
        setServerDraftCurrent(items[0]?.brandName || "");
        setAutoWriteCurrent(items[0]?.brandName || "");
        setAutoWriteQueueLen(items.length);
        onFlash?.(
          "success",
          data.message ||
            `Rédaction serveur (${items.length}) — tu peux quitter la page.`
        );
        stopServerDraftPoll();
        void pollIndivServerDraft(data.jobId);
        serverDraftPollRef.current = setInterval(() => {
          void pollIndivServerDraft(data.jobId!);
        }, 3000);
      } catch (e) {
        for (const k of missionIds) serverDraftQueuedRef.current.delete(k);
        setServerDraftRunning(false);
        setServerDraftJobId(null);
        onFlash?.(
          "error",
          `${e instanceof Error ? e.message : "Rédaction serveur impossible."} — bascule rédaction navigateur.`
        );
        // Fallback : même qualité client si le job serveur refuse.
        for (const k of missionIds) {
          enqueueAutoWriteRef.current(k, [lockedTalentId]);
        }
      } finally {
        serverDraftStartingRef.current = false;
      }
    },
    [
      lockedTalentId,
      serverDraftJobId,
      serverDraftRunning,
      brandsWithCache,
      pitchOverride,
      stopServerDraftPoll,
      pollIndivServerDraft,
      onFlash,
    ]
  );

  useEffect(() => {
    startIndivServerDraftRef.current = (keys?: string[]) => {
      void startIndivServerDraft(keys);
    };
  }, [startIndivServerDraft]);

  const pollOutreachServerDraft = useCallback(
    async (jobId: string) => {
      try {
        const res = await fetch(`/api/casting/outreach-draft-jobs/${jobId}`, {
          credentials: "include",
        });
        const data = (await res.json().catch(() => ({}))) as {
          status?: string;
          completed?: number;
          failed?: number;
          totalBrands?: number;
          currentBrandName?: string | null;
          items?: Array<{
            groupKey: string;
            status: string;
            draftSubject?: string | null;
            draftBodyHtml?: string | null;
          }>;
        };
        if (!res.ok) return;

        setServerDraftDone(
          Number(data.completed || 0) + Number(data.failed || 0)
        );
        setServerDraftFailed(Number(data.failed || 0));
        setServerDraftTotal(Number(data.totalBrands || 0));
        setServerDraftCurrent(data.currentBrandName || "");
        setAutoWriteCurrent(data.currentBrandName || "");
        setAutoWriteQueueLen(
          Math.max(
            0,
            Number(data.totalBrands || 0) -
              Number(data.completed || 0) -
              Number(data.failed || 0)
          )
        );

        const doneItems = (data.items || []).filter((it) => it.status === "done");
        if (doneItems.length > 0) {
          setReadyKeys((prev) => {
            const next = new Set(prev);
            for (const it of doneItems) next.add(it.groupKey);
            return Array.from(next);
          });
          setLocalDrafts((prev) => {
            const next = { ...prev };
            for (const it of doneItems) {
              const subject = String(it.draftSubject || "").trim();
              const bodyHtml = String(it.draftBodyHtml || "").trim();
              if (subject && bodyHtml) {
                next[it.groupKey] = { subject, bodyHtml };
              }
              autoWriteDoneKeysRef.current.add(it.groupKey);
              pendingServerDraftKeysRef.current.delete(it.groupKey);
            }
            return next;
          });
        }

        const terminal = ["completed", "failed", "cancelled"].includes(
          String(data.status || "")
        );
        if (terminal) {
          stopServerDraftPoll();
          setServerDraftRunning(false);
          setServerDraftJobId(null);
          setAutoWriteCurrent("");
          setAutoWriteQueueLen(0);
          const ok = Number(data.completed || 0);
          const fail = Number(data.failed || 0);
          onDraftsWritten?.();
          onFlash?.(
            data.status === "cancelled" || (ok === 0 && fail > 0)
              ? "error"
              : "success",
            data.status === "cancelled"
              ? `Rédaction serveur arrêtée (${ok} OK${fail ? `, ${fail} échec(s)` : ""}).`
              : ok > 0
                ? `Mails rédigés serveur · ${ok}${
                    fail ? ` · ${fail} échec(s)` : ""
                  }. Contrôle dans « Prêt à envoyer ».`
                : "Rédaction serveur échouée — réessaie."
          );
          const leftover = Array.from(pendingServerDraftKeysRef.current).filter(
            (k) =>
              !autoWriteDoneKeysRef.current.has(k) &&
              !readyKeysRef.current.includes(k) &&
              !serverDraftQueuedRef.current.has(k)
          );
          if (leftover.length > 0 && autoWriteAfterFitRef.current) {
            startOutreachServerDraftRef.current(leftover);
          }
        }
      } catch (e) {
        console.error("[outreach-casting] poll outreach draft:", e);
      }
    },
    [stopServerDraftPoll, onDraftsWritten, onFlash]
  );

  const startOutreachServerDraft = useCallback(
    async (keys?: string[]) => {
      if (lockedTalentId || serverDraftStartingRef.current) return;
      const source =
        keys && keys.length > 0
          ? keys
          : Array.from(pendingServerDraftKeysRef.current);
      const groupKeys = [
        ...new Set(
          source.filter((k) => {
            if (!k) return false;
            if (autoWriteDoneKeysRef.current.has(k)) return false;
            if (readyKeysRef.current.includes(k)) return false;
            if (localDraftsRef.current[k]) return false;
            if (serverDraftQueuedRef.current.has(k)) return false;
            return true;
          })
        ),
      ];
      if (groupKeys.length === 0) return;
      if (serverDraftJobId && serverDraftRunning) {
        for (const k of groupKeys) pendingServerDraftKeysRef.current.add(k);
        return;
      }

      serverDraftStartingRef.current = true;
      for (const k of groupKeys) serverDraftQueuedRef.current.add(k);
      try {
        const liveBrandCache = loadOutreachBrandResearchCacheMarkets(
          viewCacheMarkets
        );
        const items = groupKeys
          .map((groupKey) => {
            const brand = brandsWithCache.find((b) => b.groupKey === groupKey);
            if (!brand) return null;
            const pitch =
              pitchOverride[brand.groupKey] || defaultPitchBrand(brand);
            const talentIds = (
              selectedByBrandRef.current[groupKey] ||
              Object.keys(fitByBrandRef.current[groupKey] || {})
            ).slice(0, 8);
            const targetIds = brand.targets.map((t) => t.id).filter(Boolean);
            const brandResearch =
              lookupOutreachBrandCache(
                liveBrandCache,
                pitch,
                brand.company,
                ...(brand.coveredBrands || [])
              ) || {
                recentCampaigns: "",
                newProducts: "",
                availabilityFrEu: "",
                brandPositioning: "",
                influenceStrategy: "",
              };
            if (talentIds.length === 0 || targetIds.length === 0) {
              return null;
            }
            const fitsMap = fitByBrandRef.current[groupKey] || {};
            const rosterFits = talentIds
              .map((id) => fitsMap[id])
              .filter(Boolean);
            return {
              groupKey,
              brandName: pitch || brand.company,
              company: brand.company,
              pipeline: brand.pipeline === "BENELUX" ? "BENELUX" : "FR",
              targetIds,
              talentIds,
              brandResearch,
              rosterFits,
            };
          })
          .filter((it): it is NonNullable<typeof it> => Boolean(it));

        if (items.length === 0) {
          throw new Error(
            "Impossible de lancer la rédaction (brief / talents / cibles manquants)."
          );
        }

        const res = await fetch("/api/casting/outreach-draft-jobs", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            market: fitMarketKey,
            items,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          jobId?: string;
          totalBrands?: number;
          message?: string;
          error?: string;
        };
        if (!res.ok || !data.jobId) {
          throw new Error(
            typeof data.error === "string"
              ? data.error
              : "Impossible de lancer la rédaction serveur"
          );
        }
        for (const it of items) {
          pendingServerDraftKeysRef.current.delete(it.groupKey);
        }
        try {
          const rest = Array.from(pendingServerDraftKeysRef.current);
          const storageKey = `casting-outreach-pending-draft:${fitMarketKey}`;
          if (rest.length === 0) {
            sessionStorage.removeItem(storageKey);
          } else {
            sessionStorage.setItem(storageKey, JSON.stringify(rest));
          }
        } catch {
          /* ignore */
        }
        setServerDraftJobId(data.jobId);
        setServerDraftRunning(true);
        setServerDraftDone(0);
        setServerDraftFailed(0);
        setServerDraftTotal(Number(data.totalBrands || items.length));
        setServerDraftCurrent(items[0]?.brandName || "");
        setAutoWriteCurrent(items[0]?.brandName || "");
        setAutoWriteQueueLen(items.length);
        onFlash?.(
          "success",
          data.message ||
            `Rédaction serveur (${items.length}) — tu peux quitter la page.`
        );
        stopServerDraftPoll();
        void pollOutreachServerDraft(data.jobId);
        serverDraftPollRef.current = setInterval(() => {
          void pollOutreachServerDraft(data.jobId!);
        }, 3000);
      } catch (e) {
        for (const k of groupKeys) serverDraftQueuedRef.current.delete(k);
        setServerDraftRunning(false);
        setServerDraftJobId(null);
        onFlash?.(
          "error",
          `${e instanceof Error ? e.message : "Rédaction serveur impossible."} — bascule rédaction navigateur.`
        );
        for (const k of groupKeys) {
          const ids = (
            selectedByBrandRef.current[k] ||
            Object.keys(fitByBrandRef.current[k] || {})
          ).slice(0, 8);
          if (ids.length > 0) enqueueAutoWriteRef.current(k, ids);
        }
      } finally {
        serverDraftStartingRef.current = false;
      }
    },
    [
      lockedTalentId,
      serverDraftJobId,
      serverDraftRunning,
      brandsWithCache,
      pitchOverride,
      viewCacheMarkets,
      fitMarketKey,
      stopServerDraftPoll,
      pollOutreachServerDraft,
      onFlash,
    ]
  );

  useEffect(() => {
    startOutreachServerDraftRef.current = (keys?: string[]) => {
      void startOutreachServerDraft(keys);
    };
  }, [startOutreachServerDraft]);

  // Reprend un job rédaction indiv actif (même après fermeture).
  useEffect(() => {
    if (!open || !lockedTalentId) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/casting/indiv-draft-jobs?talentId=${encodeURIComponent(lockedTalentId)}`,
          { credentials: "include" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          active?: {
            id: string;
            status: string;
            totalMissions?: number;
            completed?: number;
            failed?: number;
            currentBrandName?: string | null;
          } | null;
        };
        if (cancelled) return;
        if (res.ok && data.active?.id && ["pending", "running"].includes(data.active.status)) {
          setServerDraftJobId(data.active.id);
          setServerDraftRunning(true);
          setServerDraftTotal(Number(data.active.totalMissions || 0));
          setServerDraftDone(
            Number(data.active.completed || 0) + Number(data.active.failed || 0)
          );
          setServerDraftFailed(Number(data.active.failed || 0));
          setServerDraftCurrent(data.active.currentBrandName || "");
          setAutoWriteCurrent(data.active.currentBrandName || "");
          stopServerDraftPoll();
          void pollIndivServerDraft(data.active.id);
          serverDraftPollRef.current = setInterval(() => {
            void pollIndivServerDraft(data.active!.id);
          }, 3000);
          onFlash?.(
            "success",
            "Rédaction serveur reprise — tu peux quitter, ça continue."
          );
          return;
        }
        // Fit fini hors écran : relance la rédaction depuis le pending session.
        if (!autoWriteAfterFitRef.current) return;
        let pending: string[] = [];
        try {
          const raw = sessionStorage.getItem(
            `casting-indiv-pending-draft:${lockedTalentId}`
          );
          if (raw) pending = JSON.parse(raw) as string[];
        } catch {
          pending = [];
        }
        if (!Array.isArray(pending) || pending.length === 0) return;
        pendingServerDraftKeysRef.current = new Set(pending.filter(Boolean));
        startIndivServerDraftRef.current(pending.filter(Boolean));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lockedTalentId]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot à l’open

  // Reprend un job rédaction outreach actif (même après fermeture).
  useEffect(() => {
    if (!open || lockedTalentId) return;
    let cancelled = false;
    const marketKey = fitMarketKey;
    void (async () => {
      try {
        const res = await fetch(
          `/api/casting/outreach-draft-jobs?market=${encodeURIComponent(marketKey)}`,
          { credentials: "include" }
        );
        const data = (await res.json().catch(() => ({}))) as {
          active?: {
            id: string;
            status: string;
            totalBrands?: number;
            completed?: number;
            failed?: number;
            currentBrandName?: string | null;
          } | null;
        };
        if (cancelled) return;
        if (
          res.ok &&
          data.active?.id &&
          ["pending", "running"].includes(data.active.status)
        ) {
          setServerDraftJobId(data.active.id);
          setServerDraftRunning(true);
          setServerDraftTotal(Number(data.active.totalBrands || 0));
          setServerDraftDone(
            Number(data.active.completed || 0) + Number(data.active.failed || 0)
          );
          setServerDraftFailed(Number(data.active.failed || 0));
          setServerDraftCurrent(data.active.currentBrandName || "");
          setAutoWriteCurrent(data.active.currentBrandName || "");
          stopServerDraftPoll();
          void pollOutreachServerDraft(data.active.id);
          serverDraftPollRef.current = setInterval(() => {
            void pollOutreachServerDraft(data.active!.id);
          }, 3000);
          onFlash?.(
            "success",
            "Rédaction serveur reprise — tu peux quitter, ça continue."
          );
          return;
        }
        if (!autoWriteAfterFitRef.current) return;
        let pending: string[] = [];
        try {
          const raw = sessionStorage.getItem(
            `casting-outreach-pending-draft:${marketKey}`
          );
          if (raw) pending = JSON.parse(raw) as string[];
        } catch {
          pending = [];
        }
        if (!Array.isArray(pending) || pending.length === 0) return;
        pendingServerDraftKeysRef.current = new Set(pending.filter(Boolean));
        startOutreachServerDraftRef.current(pending.filter(Boolean));
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open, lockedTalentId, fitMarketKey]); // eslint-disable-line react-hooks/exhaustive-deps -- snapshot à l’open

  useEffect(() => {
    return () => {
      stopServerDraftPoll();
    };
  }, [stopServerDraftPoll]);

  /** Rédige la marque courante tout de suite (batch casting peut continuer). */
  const runWriteCurrentBrand = useCallback(async () => {
    if (!current || writingOneKey || phase === "writing") return;
    const ids = selectedByBrand[current.groupKey] || [];
    if (ids.length === 0) {
      onFlash?.("error", "Sélectionne au moins un talent.");
      return;
    }
    if (isIndivMode && lockedTalentId) {
      const fit = fitByBrand[current.groupKey]?.[lockedTalentId];
      if (!fit) {
        onFlash?.(
          "error",
          "Fit casting obligatoire — clique « Analyser le casting »."
        );
        return;
      }
    }

    // Déjà rédigé → ouvre le composer pour contrôler / envoyer.
    const existing =
      localDrafts[current.groupKey] ||
      (() => {
        const t = current.targets.find(
          (x) =>
            (x.draftSubject || "").trim() && (x.draftBodyHtml || "").trim()
        );
        return t
          ? {
              subject: String(t.draftSubject || "").trim(),
              bodyHtml: String(t.draftBodyHtml || "").trim(),
            }
          : null;
      })();
    if (readyKeys.includes(current.groupKey) && existing) {
      onReviewBrand(current.groupKey, existing);
      return;
    }

    writeOneAbortRef.current?.abort();
    const ac = new AbortController();
    writeOneAbortRef.current = ac;
    setWritingOneKey(current.groupKey);

    try {
      const { needsNego, subject, bodyHtml } = await writeBrandDraft(
        current,
        ac.signal
      );
      if (ac.signal.aborted) return;
      setReadyKeys((prev) =>
        prev.includes(current.groupKey) ? prev : [...prev, current.groupKey]
      );
      if (needsNego) {
        setNegoReviewKeys((prev) =>
          prev.includes(current.groupKey) ? prev : [...prev, current.groupKey]
        );
      }
      onDraftsWritten?.();
      onFlash?.(
        "success",
        `Mail rédigé pour ${current.company} — aperçu ci-dessous.`
      );
      // Reste dans le wizard pour voir le mail (pas d’ouverture auto du composer).
    } catch (e) {
      if (ac.signal.aborted) return;
      console.error(`[outreach-casting] write-one ${current.company}:`, e);
      onFlash?.(
        "error",
        e instanceof Error ? e.message : "Rédaction impossible."
      );
    } finally {
      if (writeOneAbortRef.current === ac) {
        setWritingOneKey(null);
      }
    }
  }, [
    current,
    writingOneKey,
    phase,
    selectedByBrand,
    readyKeys,
    localDrafts,
    writeBrandDraft,
    onDraftsWritten,
    onFlash,
    onReviewBrand,
    isIndivMode,
    lockedTalentId,
    fitByBrand,
  ]);

  const runWriteBatch = useCallback(async () => {
    if (phase === "writing" || writingOneKey) return;
    const targets = writableBrands;
    if (targets.length === 0) {
      onFlash?.("error", "Aucune marque avec talents sélectionnés.");
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setPhase("writing");
    setWriteDone(0);
    setWriteTotal(targets.length);
    setWriteFailed(0);
    setWriteCurrent(targets[0]?.company || "");
    const ready: string[] = [...readyKeys];
    const nego: string[] = [];
    let ok = 0;
    let fail = 0;

    for (const brand of targets) {
      if (ac.signal.aborted) break;
      const pitch =
        pitchOverride[brand.groupKey] || defaultPitchBrand(brand);
      setWriteCurrent(pitch || brand.company);

      try {
        const { needsNego } = await writeBrandDraft(brand, ac.signal);
        if (needsNego && !nego.includes(brand.groupKey)) {
          nego.push(brand.groupKey);
        }
        if (!ready.includes(brand.groupKey)) ready.push(brand.groupKey);
        ok += 1;
      } catch (e) {
        if (ac.signal.aborted) break;
        fail += 1;
        console.error(
          `[outreach-casting] write ${brand.company}:`,
          e
        );
      } finally {
        if (!ac.signal.aborted) {
          setWriteDone((d) => d + 1);
          setWriteFailed(fail);
        }
      }
    }

    if (ac.signal.aborted) {
      setPhase("review");
      return;
    }

    setReadyKeys(ready);
    setNegoReviewKeys(nego);
    setPhase("review");
    onDraftsWritten?.();
    if (fail > 0) {
      onFlash?.(
        "error",
        `Rédaction OK ${ok}/${targets.length}. ${fail} en échec — tu peux relancer.`
      );
    } else {
      onFlash?.(
        "success",
        `Mails rédigés (${ok}). Contrôle puis envoie marque par marque.`
      );
    }
  }, [
    phase,
    writingOneKey,
    writableBrands,
    readyKeys,
    pitchOverride,
    writeBrandDraft,
    onDraftsWritten,
    onFlash,
  ]);

  const stopWrite = useCallback(() => {
    abortRef.current?.abort();
    setPhase("review");
    onFlash?.("success", "Rédaction interrompue — brouillons déjà sauvés conservés.");
  }, [onFlash]);

  if (!open) return null;

  const pct =
    writeTotal > 0
      ? Math.min(100, Math.round((writeDone / writeTotal) * 100))
      : 0;

  return (
    <div className="fixed inset-0 z-[70] flex items-stretch justify-center bg-black/45 p-0 sm:p-4">
      <div
        className="flex h-full w-full max-w-6xl flex-col overflow-hidden bg-[#FBF8F4] shadow-2xl sm:h-[min(92vh,900px)] sm:rounded-2xl"
        style={{ border: `1px solid ${OLD_ROSE}44` }}
      >
        {/* Header */}
        <div
          className="flex shrink-0 items-center justify-between gap-3 border-b px-4 py-3"
          style={{ borderColor: "#E5E0DA", background: "#fff" }}
        >
          <div className="min-w-0">
            <p
              className="m-0 text-sm font-semibold"
              style={{ fontFamily: "Spectral, serif", color: LICORICE }}
            >
              {wizardTitle ||
                (isIndivMode ? "Casting indiv" : "Casting Outreach")}
            </p>
            <p className="m-0 text-[11px] text-slate-500">
              {phase === "casting"
                ? isIndivMode
                  ? `1 talent × marques · ${castingProgress.done}/${castingProgress.total}`
                  : `Sélection talents · ${castingProgress.done}/${castingProgress.total} marques`
                : phase === "writing"
                  ? `Rédaction · ${writeCurrent || "…"}`
                  : `Contrôle · ${readyKeys.length} prêt${readyKeys.length > 1 ? "s" : ""}`}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Progress pills */}
        {phase === "casting" && brandsWithCache.length > 0 && (
          <div className="flex shrink-0 gap-1 overflow-x-auto border-b px-4 py-2" style={{ borderColor: "#E5E0DA" }}>
            {brandsWithCache.map((b, i) => {
              const sel = (selectedByBrand[b.groupKey] || []).length;
              const isSkip = skipped.has(b.groupKey);
              const hasDraft =
                Boolean(localDrafts[b.groupKey]) ||
                readyKeys.includes(b.groupKey);
              const isDone = isIndivMode
                ? isSkip || hasDraft
                : isSkip || sel > 0;
              const isCurrent = i === index;
              return (
                <button
                  key={b.groupKey}
                  type="button"
                  onClick={() => setIndex(i)}
                  title={
                    hasDraft
                      ? `${b.company} · mail prêt`
                      : b.company
                  }
                  className="h-2 w-6 shrink-0 rounded-full transition"
                  style={{
                    background: isCurrent
                      ? LICORICE
                      : isDone
                        ? TEA_GREEN
                        : "#E5E0DA",
                  }}
                />
              );
            })}
          </div>
        )}

        {/* Body */}
        <div className="min-h-0 flex-1 overflow-y-auto">
          {brandsWithCache.length === 0 ? (
            <div className="p-8 text-center text-sm text-slate-500">
              {isIndivMode
                ? "Aucune marque dans ce lot."
                : "Analyse d’abord les marques (barre du dessus), puis relance le casting."}
            </div>
          ) : phase === "casting" && current ? (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[minmax(0,1fr)_320px]">
              {/* Brief + meta */}
              <div className="space-y-4 border-b p-4 lg:border-b-0 lg:border-r" style={{ borderColor: "#E5E0DA" }}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <h2
                      className="m-0 text-xl font-semibold"
                      style={{ fontFamily: "Spectral, serif", color: LICORICE }}
                    >
                      {current.company}
                    </h2>
                    <p className="m-0 mt-1 text-xs text-slate-500">
                      Marque {index + 1}/{brandsWithCache.length}
                      {current.alsoInSiblingMarket ? " · FR+BE" : current.pipeline === "BENELUX" ? " · BE" : " · FR"}
                      {" · "}
                      {current.targets.length} contact
                      {current.targets.length > 1 ? "s" : ""}
                    </p>
                  </div>
                  {skipped.has(current.groupKey) && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                      Passée
                    </span>
                  )}
                </div>

                {pitchNamesForBrand(current).length > 1 && (
                  <div className="flex flex-wrap gap-1.5">
                    {pitchNamesForBrand(current).map((name) => {
                      const active = currentPitch === name;
                      return (
                        <button
                          key={name}
                          type="button"
                          onClick={() =>
                            setPitchOverride((p) => ({
                              ...p,
                              [current.groupKey]: name,
                            }))
                          }
                          className="rounded-full border px-2.5 py-1 text-xs font-medium"
                          style={{
                            borderColor: active ? LICORICE : "#E5E0DA",
                            background: active ? LICORICE : "#fff",
                            color: active ? "#fff" : LICORICE,
                          }}
                        >
                          {name}
                        </button>
                      );
                    })}
                  </div>
                )}

                <section
                  className="rounded-xl border bg-white p-3"
                  style={{ borderColor: `${OLD_ROSE}55` }}
                >
                  <p
                    className="mb-2 text-[11px] font-semibold uppercase tracking-wide"
                    style={{ color: OLD_ROSE }}
                  >
                    Ce qu’on pitch · {currentPitch}
                  </p>
                  {currentBrief ? (
                    <div className="space-y-2 text-[12px] leading-relaxed" style={{ color: LICORICE }}>
                      {currentBrief.newProducts?.trim() ? (
                        <p className="m-0">
                          <span className="font-semibold">Nouveautés — </span>
                          {currentBrief.newProducts}
                        </p>
                      ) : null}
                      {currentBrief.availabilityFrEu?.trim() ? (
                        <p className="m-0 opacity-80">
                          <span className="font-semibold">Dispo — </span>
                          {currentBrief.availabilityFrEu}
                        </p>
                      ) : null}
                      {currentBrief.brandPositioning?.trim() ? (
                        <p className="m-0">
                          <span className="font-semibold">Positionnement — </span>
                          {currentBrief.brandPositioning}
                        </p>
                      ) : null}
                      {currentBrief.influenceStrategy?.trim() ? (
                        <p className="m-0">
                          <span className="font-semibold">Influence — </span>
                          {currentBrief.influenceStrategy}
                        </p>
                      ) : null}
                      {currentBrief.recentCampaigns?.trim() ? (
                        <p className="m-0 opacity-80">
                          <span className="font-semibold">Campagnes — </span>
                          {currentBrief.recentCampaigns}
                        </p>
                      ) : null}
                    </div>
                  ) : (
                    <p className="m-0 text-xs text-slate-500">
                      Pas d’analyse marque en cache pour cette pitch.
                    </p>
                  )}
                </section>

                <div className="text-[11px] text-slate-500">
                  Contacts :{" "}
                  {current.targets
                    .map((t) =>
                      `${t.firstname} ${t.lastname || ""}`.trim() || t.email
                    )
                    .join(" · ") || "—"}
                </div>

                {currentDraft ? (
                  <section
                    className="rounded-xl border bg-white p-3"
                    style={{ borderColor: TEA_GREEN }}
                  >
                    <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                      <p
                        className="m-0 text-[11px] font-semibold uppercase tracking-wide"
                        style={{ color: "#3f6212" }}
                      >
                        {sentKeys.includes(current.groupKey)
                          ? "Mail envoyé / programmé"
                          : "Mail rédigé"}
                      </p>
                      <div className="flex flex-wrap gap-1.5">
                        <button
                          type="button"
                          onClick={() =>
                            onReviewBrand(current.groupKey, currentDraft)
                          }
                          className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                          style={{ borderColor: "#E5E0DA", color: LICORICE }}
                        >
                          Contrôler
                        </button>
                        {onSendBrand &&
                        !sentKeys.includes(current.groupKey) ? (
                          <button
                            type="button"
                            disabled={sendingKey === current.groupKey}
                            onClick={() => {
                              void (async () => {
                                setSendingKey(current.groupKey);
                                try {
                                  await onSendBrand(
                                    current.groupKey,
                                    currentDraft
                                  );
                                  setSentKeys((prev) =>
                                    prev.includes(current.groupKey)
                                      ? prev
                                      : [...prev, current.groupKey]
                                  );
                                  onFlash?.(
                                    "success",
                                    `Envoi programmé · ${current.company}`
                                  );
                                } catch (e) {
                                  onFlash?.(
                                    "error",
                                    e instanceof Error
                                      ? e.message
                                      : "Envoi impossible."
                                  );
                                } finally {
                                  setSendingKey(null);
                                }
                              })();
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                            style={{ background: LICORICE }}
                          >
                            {sendingKey === current.groupKey ? (
                              <>
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                Envoi…
                              </>
                            ) : (
                              "Envoyer"
                            )}
                          </button>
                        ) : null}
                      </div>
                    </div>
                    <p
                      className="m-0 mb-2 text-sm font-semibold"
                      style={{ color: LICORICE }}
                    >
                      {currentDraft.subject}
                    </p>
                    <div
                      className="max-h-56 overflow-y-auto rounded-lg border bg-[#FBF8F4] p-3 text-[12px] leading-relaxed prose prose-sm max-w-none"
                      style={{ borderColor: "#E5E0DA", color: LICORICE }}
                      dangerouslySetInnerHTML={{
                        __html: currentDraft.bodyHtml,
                      }}
                    />
                  </section>
                ) : writingOneKey === current.groupKey ||
                  (autoWriteCurrent &&
                    current.company === autoWriteCurrent) ||
                  (serverDraftRunning &&
                    serverDraftCurrent === current.company) ? (
                  <div
                    className="flex items-center gap-2 rounded-xl border px-3 py-2.5 text-xs"
                    style={{ borderColor: "#E5E0DA", color: OLD_ROSE }}
                  >
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Rédaction du mail en cours…
                  </div>
                ) : null}
              </div>

              {/* Talents */}
              <div className="flex min-h-0 flex-col p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p
                    className="m-0 text-sm font-semibold"
                    style={{ color: LICORICE }}
                  >
                    {isIndivMode
                      ? "Talent (verrouillé)"
                      : talentMarket === "BOTH"
                        ? "Talents FR + BE"
                        : talentMarket === "BENELUX"
                          ? "Créateurs belges"
                          : "Sélectionner les talents"}
                  </p>
                  <span className="text-[11px] text-slate-500">
                    {isIndivMode
                      ? currentFits[lockedTalentId || ""]?.recommended
                        ? "Oui"
                        : currentFits[lockedTalentId || ""]
                          ? "Non"
                          : "Fit…"
                      : `${currentSelected.size}/8`}
                  </span>
                </div>
                {talentsError && (
                  <p className="mb-2 text-xs text-red-600">{talentsError}</p>
                )}
                <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pr-1">
                  {loadingTalents ? (
                    <div className="flex items-center gap-2 text-sm" style={{ color: OLD_ROSE }}>
                      <Loader2 className="h-4 w-4 animate-spin" />
                      Chargement…
                    </div>
                  ) : (
                    sortedTalents.map((t) => {
                      const sel = currentSelected.has(t.id);
                      const fit = currentFits[t.id];
                      const expanded = expandedFitId === t.id;
                      const scoreStyle = fit
                        ? fitScoreColor(fit.fitScore)
                        : null;
                      return (
                        <div
                          key={t.id}
                          className="rounded-xl border-2 bg-white/80 transition"
                          style={{
                            borderColor: sel
                              ? TEA_GREEN
                              : fit?.recommended
                                ? "#bbf7d0"
                                : "transparent",
                          }}
                        >
                          <div className="flex w-full gap-2.5 p-2.5 text-left">
                            <button
                              type="button"
                              onClick={() => toggleTalent(t.id)}
                              className="flex min-w-0 flex-1 gap-2.5 text-left"
                            >
                              <div className="relative h-11 w-11 shrink-0 overflow-hidden rounded-lg bg-gray-200">
                                {t.photo ? (
                                  <Image
                                    src={t.photo}
                                    alt=""
                                    fill
                                    className="object-cover"
                                    sizes="44px"
                                  />
                                ) : (
                                  <div className="flex h-full w-full items-center justify-center text-[10px] text-gray-500">
                                    —
                                  </div>
                                )}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <p
                                    className="truncate text-sm font-semibold"
                                    style={{ color: LICORICE }}
                                  >
                                    {t.prenom} {t.nom}
                                  </p>
                                  {fit ? (
                                    <>
                                      <span
                                        className="rounded-full px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide"
                                        style={{
                                          background: fit.recommended
                                            ? "#dcfce7"
                                            : "#f1f5f9",
                                          color: fit.recommended
                                            ? "#166534"
                                            : "#64748b",
                                        }}
                                      >
                                        {fit.recommended ? "Oui" : "Non"}
                                      </span>
                                      {scoreStyle ? (
                                        <span
                                          className="rounded-full border px-1.5 py-0.5 text-[10px] font-semibold"
                                          style={{
                                            background: scoreStyle.bg,
                                            color: scoreStyle.color,
                                            borderColor: scoreStyle.border,
                                          }}
                                        >
                                          {fit.fitScore}/100
                                        </span>
                                      ) : null}
                                    </>
                                  ) : null}
                                </div>
                                <div className="mt-1 flex flex-wrap gap-1">
                                  {(t.niches || []).slice(0, 2).map((n, i) => (
                                    <span
                                      key={n}
                                      className="rounded-full px-1.5 py-0.5 text-[10px] text-white"
                                      style={{ backgroundColor: nicheColor(i) }}
                                    >
                                      {n}
                                    </span>
                                  ))}
                                </div>
                                <p className="mt-0.5 text-[10px] text-slate-500">
                                  IG {formatFollowers(t.igFollowers || 0)}
                                </p>
                              </div>
                              {sel ? (
                                <Check
                                  className="h-4 w-4 shrink-0"
                                  style={{ color: "#3f6212" }}
                                />
                              ) : null}
                            </button>
                            {fit ? (
                              <button
                                type="button"
                                aria-label="Détail fit"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setExpandedFitId(expanded ? null : t.id);
                                }}
                                className="shrink-0 self-start rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                              >
                                <ChevronDown
                                  className={`h-4 w-4 transition ${expanded ? "rotate-180" : ""}`}
                                />
                              </button>
                            ) : null}
                          </div>
                          {fit && expanded ? (
                            <div
                              className="space-y-1.5 border-t px-2.5 pb-2.5 pt-2 text-[11px] leading-snug"
                              style={{ borderColor: "#E5E0DA", color: LICORICE }}
                            >
                              <p className="m-0">
                                <span className="font-semibold">Fit — </span>
                                {fit.whyFit}
                              </p>
                              {fit.risks?.trim() ? (
                                <p className="m-0 opacity-80">
                                  <span className="font-semibold">Risques — </span>
                                  {fit.risks}
                                </p>
                              ) : null}
                              {fit.suggestedAngle?.trim() ? (
                                <p className="m-0">
                                  <span className="font-semibold">Angle — </span>
                                  {fit.suggestedAngle}
                                </p>
                              ) : null}
                              {fit.proofPoints?.trim() ? (
                                <p className="m-0 opacity-80">
                                  <span className="font-semibold">Preuves — </span>
                                  {fit.proofPoints}
                                </p>
                              ) : null}
                            </div>
                          ) : null}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          ) : phase === "writing" ? (
            <div className="flex flex-col items-center justify-center gap-4 p-10">
              <Loader2 className="h-8 w-8 animate-spin" style={{ color: OLD_ROSE }} />
              <p className="m-0 text-sm font-medium" style={{ color: LICORICE }}>
                Analyse talents + rédaction · {writeCurrent}
              </p>
              <div className="w-full max-w-md">
                <div className="mb-1 flex justify-between text-[11px] text-slate-500">
                  <span>
                    {writeDone}/{writeTotal}
                    {writeFailed > 0 ? ` · ${writeFailed} échec(s)` : ""}
                  </span>
                  <span>{pct}%</span>
                </div>
                <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full transition-all"
                    style={{ width: `${pct}%`, background: LICORICE }}
                  />
                </div>
              </div>
              <button
                type="button"
                onClick={stopWrite}
                className="rounded-lg border px-3 py-1.5 text-sm"
                style={{ borderColor: "#E5E0DA", color: LICORICE }}
              >
                Arrêter
              </button>
            </div>
          ) : (
            <div className="space-y-3 p-4">
              {(() => {
                const pendingWrite = writableBrands.filter(
                  (b) => !readyKeys.includes(b.groupKey)
                ).length;
                const pipelineBusy =
                  fitRunning ||
                  serverDraftRunning ||
                  Boolean(brandPrepCurrent) ||
                  Boolean(autoWriteCurrent) ||
                  autoWriteQueueLen > 0 ||
                  Boolean(writingOneKey);
                const doneN = readyKeys.length;
                const totalN = Math.max(
                  writableBrands.length,
                  serverDraftTotal,
                  1
                );
                const reviewPct = Math.min(
                  100,
                  Math.round(
                    (Math.max(doneN, serverDraftDone) / totalN) * 100
                  )
                );
                const statusLine = brandPrepCurrent
                  ? `Analyse marque · ${brandPrepCurrent}`
                  : fitRunning
                    ? `Fit casting · ${fitCurrent || "…"} · ${fitDone}/${fitTotal}`
                    : serverDraftRunning
                      ? `Rédaction serveur · ${serverDraftCurrent || "…"} · ${serverDraftDone}/${serverDraftTotal} · tu peux quitter`
                      : writingOneKey || autoWriteCurrent
                        ? `Rédaction · ${
                            autoWriteCurrent ||
                            brandsWithCache.find(
                              (x) => x.groupKey === writingOneKey
                            )?.company ||
                            "…"
                          }`
                        : autoWriteQueueLen > 0
                          ? `File rédaction · ${autoWriteQueueLen} restante${autoWriteQueueLen > 1 ? "s" : ""}`
                          : pendingWrite > 0
                            ? `${pendingWrite} en attente de rédaction`
                            : "Tout est prêt";
                return (
                  <>
                    <div
                      className="rounded-xl border bg-white p-3"
                      style={{ borderColor: "#E5E0DA" }}
                    >
                      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
                        <p
                          className="m-0 inline-flex items-center gap-2 text-sm font-medium"
                          style={{ color: LICORICE }}
                        >
                          {pipelineBusy ? (
                            <Loader2
                              className="h-4 w-4 shrink-0 animate-spin"
                              style={{ color: OLD_ROSE }}
                            />
                          ) : null}
                          {statusLine}
                        </p>
                        <span className="text-[11px] text-slate-500">
                          {doneN}/{totalN} prêt
                          {doneN > 1 ? "s" : ""} · {reviewPct}%
                        </span>
                      </div>
                      <div className="h-2 overflow-hidden rounded-full bg-slate-100">
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${pipelineBusy && reviewPct === 0 ? 8 : reviewPct}%`,
                            background: pipelineBusy ? OLD_ROSE : TEA_GREEN,
                          }}
                        />
                      </div>
                      {fitRunning || autoWriteQueueLen > 0 || autoWriteCurrent ? (
                        <p className="m-0 mt-2 text-[11px] text-slate-500">
                          {fitRunning
                            ? `Fit ${fitDone}/${Math.max(fitTotal, 1)}`
                            : null}
                          {fitRunning &&
                          (autoWriteCurrent || autoWriteQueueLen > 0)
                            ? " · "
                            : null}
                          {autoWriteCurrent
                            ? `En cours : ${autoWriteCurrent}`
                            : autoWriteQueueLen > 0
                              ? `File : ${autoWriteQueueLen}`
                              : null}
                        </p>
                      ) : null}
                    </div>
                    <p className="m-0 text-sm" style={{ color: LICORICE }}>
                      {writableBrands.length} marque
                      {writableBrands.length > 1 ? "s" : ""} avec talents ·{" "}
                      {readyKeys.length} brouillon
                      {readyKeys.length > 1 ? "s" : ""} prêt
                      {readyKeys.length > 1 ? "s" : ""}
                      {negoReviewKeys.length > 0
                        ? ` · ${negoReviewKeys.length} avec revue négo (suite prudente)`
                        : ""}
                    </p>
                  </>
                );
              })()}
              <ul className="m-0 space-y-2 p-0 list-none">
                {brandsWithCache.map((b) => {
                  const isSkip = skipped.has(b.groupKey);
                  const sel = selectedByBrand[b.groupKey] || [];
                  const ready = readyKeys.includes(b.groupKey);
                  const draftSubject =
                    localDrafts[b.groupKey]?.subject ||
                    b.targets.find((t) => t.draftSubject)?.draftSubject ||
                    "";
                  const isWritingNow =
                    writingOneKey === b.groupKey ||
                    autoWriteCurrent === b.company ||
                    (serverDraftRunning &&
                      serverDraftCurrent === b.company);
                  const hasFit = Object.keys(fitByBrand[b.groupKey] || {}).length > 0;
                  const waitingFit = fitRunning && !hasFit && !ready && !isSkip;
                  return (
                    <li
                      key={b.groupKey}
                      className="flex flex-wrap items-center gap-2 rounded-xl border bg-white px-3 py-2.5"
                      style={{
                        borderColor: isWritingNow ? OLD_ROSE : "#E5E0DA",
                      }}
                    >
                      <div className="min-w-0 flex-1">
                        <p
                          className="m-0 truncate text-sm font-semibold"
                          style={{ color: LICORICE }}
                        >
                          {b.company}
                        </p>
                        <p className="m-0 text-[11px] text-slate-500">
                          {isSkip
                            ? "Passée"
                            : sel.length > 0
                              ? `${sel.length} talent${sel.length > 1 ? "s" : ""}`
                              : "Sans sélection"}
                          {ready && draftSubject
                            ? ` · ${draftSubject}`
                            : ready
                              ? " · Brouillon prêt"
                              : ""}
                          {negoReviewKeys.includes(b.groupKey)
                            ? " · Revue négo"
                            : ""}
                        </p>
                      </div>
                      {isSkip ? (
                        <button
                          type="button"
                          onClick={() => unskipAndEdit(b.groupKey)}
                          className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                          style={{ borderColor: "#E5E0DA", color: LICORICE }}
                        >
                          Reprendre
                        </button>
                      ) : sel.length === 0 ? (
                        <button
                          type="button"
                          onClick={() => {
                            const idx = brandsWithCache.findIndex(
                              (x) => x.groupKey === b.groupKey
                            );
                            if (idx >= 0) {
                              setIndex(idx);
                              setPhase("casting");
                            }
                          }}
                          className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                          style={{ borderColor: "#E5E0DA", color: LICORICE }}
                        >
                          Choisir talents
                        </button>
                      ) : ready ? (
                        <div className="flex flex-wrap gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const d = localDrafts[b.groupKey];
                              const idx = brandsWithCache.findIndex(
                                (x) => x.groupKey === b.groupKey
                              );
                              if (idx >= 0) {
                                setIndex(idx);
                                setPhase("casting");
                              } else {
                                onReviewBrand(
                                  b.groupKey,
                                  d
                                    ? {
                                        subject: d.subject,
                                        bodyHtml: d.bodyHtml,
                                      }
                                    : undefined
                                );
                              }
                            }}
                            className="rounded-lg border px-2.5 py-1 text-xs font-medium"
                            style={{
                              borderColor: "#E5E0DA",
                              color: LICORICE,
                            }}
                          >
                            Voir le mail
                          </button>
                          {onSendBrand &&
                          localDrafts[b.groupKey] &&
                          !sentKeys.includes(b.groupKey) ? (
                            <button
                              type="button"
                              disabled={sendingKey === b.groupKey}
                              onClick={() => {
                                const d = localDrafts[b.groupKey];
                                if (!d) return;
                                void (async () => {
                                  setSendingKey(b.groupKey);
                                  try {
                                    await onSendBrand(b.groupKey, d);
                                    setSentKeys((prev) =>
                                      prev.includes(b.groupKey)
                                        ? prev
                                        : [...prev, b.groupKey]
                                    );
                                    onFlash?.(
                                      "success",
                                      `Envoi programmé · ${b.company}`
                                    );
                                  } catch (e) {
                                    onFlash?.(
                                      "error",
                                      e instanceof Error
                                        ? e.message
                                        : "Envoi impossible."
                                    );
                                  } finally {
                                    setSendingKey(null);
                                  }
                                })();
                              }}
                              className="rounded-lg px-2.5 py-1 text-xs font-semibold text-white disabled:opacity-40"
                              style={{ background: LICORICE }}
                            >
                              {sendingKey === b.groupKey
                                ? "Envoi…"
                                : "Envoyer"}
                            </button>
                          ) : sentKeys.includes(b.groupKey) ? (
                            <span className="text-[11px] text-emerald-700">
                              Programmé
                            </span>
                          ) : null}
                        </div>
                      ) : isWritingNow ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                          style={{ color: OLD_ROSE }}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Rédaction…
                        </span>
                      ) : waitingFit ? (
                        <span
                          className="inline-flex items-center gap-1.5 text-[11px] font-medium"
                          style={{ color: OLD_ROSE }}
                        >
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          Fit…
                        </span>
                      ) : autoWriteQueueLen > 0 ||
                        fitRunning ||
                        serverDraftRunning ? (
                        <span className="text-[11px] text-slate-400">
                          Dans la file
                          {serverDraftRunning ? " serveur" : ""}
                        </span>
                      ) : (
                        <span className="text-[11px] text-slate-400">
                          En attente rédaction
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </div>

        {/* Footer */}
        <div
          className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-t px-4 py-3"
          style={{ borderColor: "#E5E0DA", background: "#fff" }}
        >
          {phase === "casting" ? (
            <>
              <button
                type="button"
                onClick={skipBrand}
                disabled={!current || Boolean(writingOneKey)}
                className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40"
                style={{ borderColor: "#E5E0DA", color: LICORICE }}
              >
                <SkipForward className="h-4 w-4" />
                Passer
              </button>
              <div className="flex min-w-0 flex-1 flex-col items-center gap-1 px-2">
                {fitRunning ||
                serverDraftRunning ||
                autoWriteCurrent ||
                autoWriteQueueLen > 0 ? (
                  <>
                    <p className="m-0 text-center text-[11px] text-slate-500">
                      {fitRunning
                        ? brandPrepCurrent
                          ? `Analyse marque · ${brandPrepCurrent}`
                          : `Casting · ${fitCurrent || "…"} · ${fitDone}/${fitTotal}`
                        : serverDraftRunning
                          ? `Rédaction serveur · ${serverDraftCurrent || "…"} · ${serverDraftDone}/${serverDraftTotal}`
                          : "Casting terminé"}
                      {fitFailed > 0
                        ? ` · ${fitFailed} échec${fitFailed > 1 ? "s" : ""}`
                        : ""}
                      {serverDraftFailed > 0
                        ? ` · ${serverDraftFailed} rédac. échec`
                        : ""}
                      {!serverDraftRunning && autoWriteAfterFit
                        ? autoWriteCurrent
                          ? ` · rédaction ${autoWriteCurrent}`
                          : autoWriteQueueLen > 0
                            ? ` · file rédaction ${autoWriteQueueLen}`
                            : " · auto-rédaction ON"
                        : ""}
                      {(fitRunning && !brandPrepCurrent) || serverDraftRunning
                        ? " · tu peux quitter"
                        : ""}
                    </p>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={autoWriteAfterFit}
                        onChange={(e) => {
                          const on = e.target.checked;
                          setAutoWriteAfterFit(on);
                          if (!on) {
                            autoWriteQueueRef.current = [];
                            setAutoWriteQueueLen(0);
                          }
                        }}
                      />
                      {isIndivMode
                        ? "Marque + fit + Leyna + mails serveur (tu peux quitter)"
                        : "Rédiger auto après fit (serveur, tu peux quitter)"}
                    </label>
                    {fitRunning ? (
                      <button
                        type="button"
                        onClick={() => void cancelFitJob()}
                        className="rounded-lg border px-3 py-1.5 text-xs font-medium"
                        style={{ borderColor: "#E5E0DA", color: LICORICE }}
                      >
                        Arrêter casting
                      </button>
                    ) : null}
                  </>
                ) : (
                  <div className="flex flex-col items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => void runRosterFitBatch()}
                      disabled={
                        !current ||
                        talents.length === 0 ||
                        brandsWithCache.length === 0 ||
                        Boolean(writingOneKey)
                      }
                      className="inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-semibold disabled:opacity-40"
                      style={{
                        borderColor: OLD_ROSE,
                        color: LICORICE,
                        background: "#FDF6F4",
                      }}
                      title="Juge chaque talent OUI/NON vs le brief marque, pour toutes les marques"
                    >
                      <Sparkles className="h-4 w-4" style={{ color: OLD_ROSE }} />
                      {brandsMissingFit.length > 0 &&
                      Object.keys(fitByBrand).length > 0
                        ? `Analyser le casting (${brandsMissingFit.length})`
                        : Object.keys(fitByBrand).length >=
                            brandsWithCache.filter((b) => !skipped.has(b.groupKey))
                              .length && brandsWithCache.length > 0
                          ? "Relancer l’analyse casting"
                          : "Analyser le casting"}
                    </button>
                    <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600">
                      <input
                        type="checkbox"
                        checked={autoWriteAfterFit}
                        onChange={(e) => setAutoWriteAfterFit(e.target.checked)}
                      />
                      {isIndivMode
                        ? "Marque + fit + Leyna + mails serveur (tu peux quitter)"
                        : "Puis rédiger auto serveur (tu peux quitter)"}
                    </label>
                  </div>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {current && currentSelected.size > 0 ? (
                  <button
                    type="button"
                    onClick={() => void runWriteCurrentBrand()}
                    disabled={
                      Boolean(writingOneKey) ||
                      Boolean(fitRunning) ||
                      Boolean(serverDraftRunning) ||
                      (isIndivMode &&
                        Boolean(lockedTalentId) &&
                        !fitByBrand[current.groupKey]?.[lockedTalentId || ""] &&
                        !readyKeys.includes(current.groupKey))
                    }
                    className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-sm font-semibold text-white disabled:opacity-40"
                    style={{ background: OLD_ROSE }}
                    title={
                      isIndivMode &&
                      lockedTalentId &&
                      !fitByBrand[current.groupKey]?.[lockedTalentId]
                        ? "Fit casting obligatoire d’abord"
                        : "Rédige cette marque tout de suite, sans attendre la fin du batch"
                    }
                  >
                    {writingOneKey === current.groupKey ? (
                      <>
                        <Loader2 className="h-4 w-4 animate-spin" />
                        Rédaction…
                      </>
                    ) : readyKeys.includes(current.groupKey) ? (
                      "Contrôler / envoyer"
                    ) : (
                      "Rédiger cette marque"
                    )}
                  </button>
                ) : null}
                {allCastingDone && (
                  <button
                    type="button"
                    onClick={() => setPhase("review")}
                    disabled={Boolean(writingOneKey)}
                    className="rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-40"
                    style={{ borderColor: "#E5E0DA", color: LICORICE }}
                  >
                    Voir le récap
                  </button>
                )}
                <button
                  type="button"
                  onClick={goNext}
                  disabled={
                    !current ||
                    currentSelected.size === 0 ||
                    Boolean(writingOneKey)
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                  style={{ background: LICORICE }}
                >
                  Suivant
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            </>
          ) : phase === "writing" ? (
            <div className="w-full text-center text-xs text-slate-500">
              Ne ferme pas l’onglet pendant la rédaction…
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={() => {
                  setPhase("casting");
                  setIndex(0);
                }}
                className="rounded-lg border px-3 py-2 text-sm font-medium"
                style={{ borderColor: "#E5E0DA", color: LICORICE }}
              >
                Revoir le casting
              </button>
              <button
                type="button"
                onClick={() => void runWriteBatch()}
                disabled={writableBrands.length === 0}
                className="rounded-lg px-3.5 py-2 text-sm font-semibold text-white disabled:opacity-40"
                style={{ background: LICORICE }}
              >
                {readyKeys.length > 0 &&
                writableBrands.every((b) => readyKeys.includes(b.groupKey))
                  ? `Relancer rédaction (${writableBrands.length})`
                  : `Analyser talents + rédiger (${writableBrands.length})`}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
