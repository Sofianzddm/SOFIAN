"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cacheOutreachBrandResearchMarkets,
  cacheOutreachLeynaExchangeMarkets,
  hasOutreachBrandCacheEntry,
  loadOutreachBrandResearchCacheMarkets,
  loadOutreachLeynaExchangeCacheMarkets,
  loadOutreachTalentResearchCacheMarkets,
  lookupOutreachBrandCache,
  outreachCacheMarketsForContact,
  type OutreachCachedBrandResearch,
  type OutreachCachedLeynaExchange,
} from "@/lib/outreach-clients-batch-cache";

export type OutreachBatchBrandGroup = {
  groupKey: string;
  company: string;
  /** Sous-marques couvertes (ex. Dove, Axe) — même logique que CastingComposer. */
  coveredBrands?: string[];
  /** Emails contacts du groupe (scan Leyna). */
  emails?: string[];
  /** Pipeline dominant du groupe (pour availabilityFocus). */
  pipeline?: "FR" | "BENELUX";
  alsoInSiblingMarket?: boolean;
};

type Props = {
  /**
   * Marché de la vue (Unique FR / Unique BE).
   * En vue FR+BE le parent passe "FR" + `readBothMarkets` pour ne pas
   * perdre le cache écrit côté Benelux (ou l’inverse).
   */
  market: "FR" | "BENELUX";
  /**
   * Vue FR+BE : lit/écrit FR et BENELUX pour chaque marque (un seul mail,
   * analyses partagées quel que soit le pipeline primaire).
   */
  readBothMarkets?: boolean;
  /** Libellé de la file (À contacter / À recontacter) pour le texte d’aide. */
  fileLabel?: string;
  brands: OutreachBatchBrandGroup[];
  onFlash?: (kind: "success" | "error", message: string) => void;
};

type PitchTarget = {
  brandName: string;
  company: string;
  emails: string[];
  pipeline?: "FR" | "BENELUX";
  alsoInSiblingMarket?: boolean;
};

/** Une entrée de recherche = une marque pitchée (jamais un join multi-marques). */
function pitchBrandsForGroup(g: OutreachBatchBrandGroup): string[] {
  const covered = (g.coveredBrands || [])
    .map((b) => b.trim())
    .filter(Boolean);
  if (covered.length > 0) return Array.from(new Set(covered));
  const company = (g.company || "").trim();
  return company ? [company] : [];
}

function pitchesForBrands(
  brands: OutreachBatchBrandGroup[],
  readBothMarkets: boolean
): PitchTarget[] {
  const out: PitchTarget[] = [];
  const seen = new Set<string>();
  for (const g of brands) {
    const emails = Array.from(
      new Set(
        (g.emails || [])
          .map((e) => String(e || "").trim().toLowerCase())
          .filter((e) => e.includes("@"))
      )
    );
    for (const brandName of pitchBrandsForGroup(g)) {
      const key = brandName.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        brandName,
        company: (g.company || "").trim(),
        emails,
        pipeline: g.pipeline,
        alsoInSiblingMarket: g.alsoInSiblingMarket || readBothMarkets,
      });
    }
  }
  return out;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  fn: (item: T, index: number) => Promise<void>
): Promise<void> {
  let next = 0;
  const workers = Array.from(
    {
      length: Math.min(
        Math.max(1, concurrency),
        Math.max(1, items.length)
      ),
    },
    async () => {
      while (next < items.length) {
        const i = next++;
        await fn(items[i], i);
      }
    }
  );
  await Promise.all(workers);
}

/**
 * Prépare les étapes 1–2 du composer Outreach Clients :
 * 1) analyse marques  →  2) scan boîte Leyna.
 * Sélection / analyse talents restent marque par marque dans le CastingComposer.
 */
export default function OutreachClientsBatchAnalyzeBar({
  market,
  readBothMarkets = false,
  fileLabel = "À contacter",
  brands,
  onFlash,
}: Props) {
  const [brandCacheCount, setBrandCacheCount] = useState(0);
  const [leynaCacheCount, setLeynaCacheCount] = useState(0);
  const [runningKind, setRunningKind] = useState<"brand" | "leyna" | null>(
    null
  );
  const [done, setDone] = useState(0);
  const [total, setTotal] = useState(0);
  const [current, setCurrent] = useState("");
  const [failed, setFailed] = useState(0);
  const abortRef = useRef<AbortController | null>(null);

  /** Marchés à fusionner pour le décompte / pending (vue FR+BE → FR∪BE). */
  const viewCacheMarkets = useMemo(
    (): Array<"FR" | "BENELUX"> =>
      readBothMarkets ? ["FR", "BENELUX"] : [market],
    [readBothMarkets, market]
  );

  const allPitches = useMemo(
    () => pitchesForBrands(brands, readBothMarkets),
    [brands, readBothMarkets]
  );

  const refreshCacheCount = useCallback(() => {
    const brandCache = loadOutreachBrandResearchCacheMarkets(viewCacheMarkets);
    const leynaCache = loadOutreachLeynaExchangeCacheMarkets(viewCacheMarkets);
    let brandsOk = 0;
    let leynaOk = 0;
    for (const g of brands) {
      const pitches = pitchBrandsForGroup(g);
      if (
        pitches.length > 0 &&
        pitches.every((p) => hasOutreachBrandCacheEntry(brandCache, p))
      ) {
        brandsOk += 1;
      }
      if (
        pitches.length > 0 &&
        pitches.every((p) => hasOutreachBrandCacheEntry(leynaCache, p))
      ) {
        leynaOk += 1;
      }
    }
    setBrandCacheCount(brandsOk);
    setLeynaCacheCount(leynaOk);
  }, [viewCacheMarkets, brands]);

  useEffect(() => {
    refreshCacheCount();
  }, [refreshCacheCount]);

  /** Marques pitchées encore sans cache marque. */
  const pendingBrandPitches = useMemo(() => {
    const cache = loadOutreachBrandResearchCacheMarkets(viewCacheMarkets);
    return allPitches.filter(
      (t) => !hasOutreachBrandCacheEntry(cache, t.brandName)
    );
  }, [allPitches, viewCacheMarkets, brandCacheCount]);

  /**
   * Scan Leyna manquant — uniquement pour les marques déjà analysées
   * (étape 1 avant étape 2).
   */
  const pendingLeynaPitches = useMemo(() => {
    const brandCache = loadOutreachBrandResearchCacheMarkets(viewCacheMarkets);
    const leynaCache = loadOutreachLeynaExchangeCacheMarkets(viewCacheMarkets);
    return allPitches.filter(
      (t) =>
        hasOutreachBrandCacheEntry(brandCache, t.brandName) &&
        !hasOutreachBrandCacheEntry(leynaCache, t.brandName)
    );
  }, [allPitches, viewCacheMarkets, brandCacheCount, leynaCacheCount]);

  const running = runningKind !== null;

  async function runBatchBrandResearch() {
    if (running) return;
    if (brands.length === 0) {
      onFlash?.("success", "Aucune marque à analyser.");
      return;
    }
    const targets = pendingBrandPitches;
    if (targets.length === 0) {
      onFlash?.(
        "success",
        `Toutes les marques sont déjà analysées (${brands.length} groupe${brands.length > 1 ? "s" : ""}). Tu peux enchaîner sur la boîte Leyna.`
      );
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunningKind("brand");
    setDone(0);
    setTotal(targets.length);
    setFailed(0);
    setCurrent(targets[0]?.brandName || "");

    let ok = 0;
    let fail = 0;

    const analyzeOne = async (t: PitchTarget) => {
      const brandName = t.brandName;
      const availabilityFocus: "FR" | "BE" =
        t.pipeline === "BENELUX" && !t.alsoInSiblingMarket ? "BE" : "FR";
      const res = await fetch("/api/casting/brand-research", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          brandName,
          availabilityFocus,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Analyse marque impossible"
        );
      }
      const markets = outreachCacheMarketsForContact({
        pipeline: t.pipeline || market,
        alsoInSiblingMarket: t.alsoInSiblingMarket || readBothMarkets,
      });
      cacheOutreachBrandResearchMarkets(
        markets,
        brandName,
        data as OutreachCachedBrandResearch
      );
    };

    try {
      await mapPool(targets, 2, async (t) => {
        if (ac.signal.aborted) return;
        setCurrent(t.brandName);
        try {
          await analyzeOne(t);
          ok += 1;
        } catch (e) {
          if (ac.signal.aborted) return;
          fail += 1;
          console.error(`[outreach-batch] brand-research ${t.brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            setDone((d) => d + 1);
            setFailed(fail);
          }
        }
      });
      if (ac.signal.aborted) return;
      refreshCacheCount();
      if (fail > 0) {
        onFlash?.(
          "error",
          `Marques OK ${ok}/${targets.length}. ${fail} en échec — relance le bouton.`
        );
      } else {
        onFlash?.(
          "success",
          `Marques analysées (${ok}). Enchaîne avec « Analyser boîte Leyna ».`
        );
      }
    } finally {
      if (!ac.signal.aborted) {
        setRunningKind(null);
        setCurrent("");
      }
    }
  }

  async function runBatchLeynaScan() {
    if (running) return;
    if (brands.length === 0) {
      onFlash?.("success", "Aucune marque à scanner.");
      return;
    }
    if (pendingBrandPitches.length > 0) {
      onFlash?.(
        "error",
        `Analyse d’abord les marques (${pendingBrandPitches.length} restante${pendingBrandPitches.length > 1 ? "s" : ""}), puis la boîte Leyna.`
      );
      return;
    }
    const targets = pendingLeynaPitches;
    if (targets.length === 0) {
      onFlash?.(
        "success",
        `Boîte Leyna déjà scannée (${leynaCacheCount}/${brands.length}). Ouvre « Rédiger le mail » → talents → rédaction.`
      );
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunningKind("leyna");
    setDone(0);
    setTotal(targets.length);
    setFailed(0);
    setCurrent(targets[0]?.brandName || "");

    const talentCache = loadOutreachTalentResearchCacheMarkets(viewCacheMarkets);
    let ok = 0;
    let fail = 0;

    const analyzeOne = async (t: PitchTarget) => {
      const brandName = t.brandName;
      const agencyName =
        t.company && t.company.toLowerCase() !== brandName.toLowerCase()
          ? t.company
          : undefined;
      const talentCached =
        lookupOutreachBrandCache(talentCache, brandName) || [];
      const talentNames = talentCached
        .map((x) => String(x.name || "").trim())
        .filter(Boolean);
      const res = await fetch("/api/casting/leyna-exchange-context", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: ac.signal,
        body: JSON.stringify({
          recipientEmails: t.emails,
          brandName,
          agencyName,
          talentNames,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          typeof data.error === "string"
            ? data.error
            : "Scan boîte Leyna impossible"
        );
      }
      const ctx = (data?.context || {
        hasExchange: false,
      }) as OutreachCachedLeynaExchange & {
        hasSentNoReplyOnly?: boolean;
        scanStatus?: "ok" | "empty" | "failed";
        fetchedAt?: string | null;
        promptBlockFr?: string;
        promptBlockEn?: string;
      };
      const markets = outreachCacheMarketsForContact({
        pipeline: t.pipeline || market,
        alsoInSiblingMarket: t.alsoInSiblingMarket || readBothMarkets,
      });
      cacheOutreachLeynaExchangeMarkets(markets, brandName, {
        hasExchange: Boolean(ctx.hasExchange),
        tone: ctx.tone ?? null,
        bannerLabel: ctx.bannerLabel ?? null,
        alerts: Array.isArray(ctx.alerts) ? ctx.alerts : [],
        contacts: Array.isArray(ctx.contacts) ? ctx.contacts : [],
        ...(ctx.hasSentNoReplyOnly != null
          ? { hasSentNoReplyOnly: ctx.hasSentNoReplyOnly }
          : {}),
        ...(ctx.scanStatus ? { scanStatus: ctx.scanStatus } : {}),
        ...(ctx.fetchedAt != null ? { fetchedAt: ctx.fetchedAt } : {}),
        ...(ctx.promptBlockFr != null
          ? { promptBlockFr: ctx.promptBlockFr }
          : {}),
        ...(ctx.promptBlockEn != null
          ? { promptBlockEn: ctx.promptBlockEn }
          : {}),
      } as OutreachCachedLeynaExchange);
    };

    try {
      await mapPool(targets, 2, async (t) => {
        if (ac.signal.aborted) return;
        setCurrent(t.brandName);
        try {
          await analyzeOne(t);
          ok += 1;
        } catch (e) {
          if (ac.signal.aborted) return;
          fail += 1;
          console.error(`[outreach-batch] leyna-exchange ${t.brandName}:`, e);
        } finally {
          if (!ac.signal.aborted) {
            setDone((d) => d + 1);
            setFailed(fail);
          }
        }
      });
      if (ac.signal.aborted) return;
      refreshCacheCount();
      if (fail > 0) {
        onFlash?.(
          "error",
          `Leyna OK ${ok}/${targets.length}. ${fail} en échec — relance le bouton.`
        );
      } else {
        onFlash?.(
          "success",
          `Boîte Leyna scannée (${ok}). Ouvre « Rédiger le mail » → talents → rédaction.`
        );
      }
    } finally {
      if (!ac.signal.aborted) {
        setRunningKind(null);
        setCurrent("");
      }
    }
  }

  function stop() {
    const kind = runningKind;
    abortRef.current?.abort();
    setRunningKind(null);
    setCurrent("");
    refreshCacheCount();
    onFlash?.(
      "success",
      kind === "leyna"
        ? "Scan Leyna interrompu — cache conservé."
        : "Analyse marques interrompue — cache conservé."
    );
  }

  const btnBase =
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const btnPrimary =
    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40";

  const pct =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  const brandsDone =
    brandCacheCount >= brands.length && brands.length > 0;
  const leynaDone =
    leynaCacheCount >= brands.length && brands.length > 0;

  return (
    <div className="mb-4 w-full rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs leading-snug text-slate-500">
            {runningKind === "brand"
              ? `Étape 1 · Analyse marques · ${current || "…"}`
              : runningKind === "leyna"
                ? `Étape 2 · Boîte Leyna · ${current || "…"}`
                : `Étape 1 : marques ${fileLabel} (${brandCacheCount}/${brands.length}) → étape 2 : boîte Leyna (${leynaCacheCount}/${brands.length}). Ensuite, marque par marque : talents → rédaction.`}
          </p>
          {running && (
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  {runningKind === "leyna" ? "Leyna" : "Marques"} {done}/{total}
                  {failed > 0
                    ? ` · ${failed} échec${failed > 1 ? "s" : ""}`
                    : ""}
                </span>
                <span>{pct}%</span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-slate-100">
                <div
                  className="h-full rounded-full bg-slate-800 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          )}
        </div>

        <div className="flex flex-wrap gap-2">
          {running ? (
            <button
              type="button"
              className={btnBase}
              style={{ borderColor: "#e2e8f0", color: "#0f172a" }}
              onClick={stop}
            >
              Arrêter
            </button>
          ) : (
            <>
              <button
                type="button"
                className={btnPrimary}
                style={{ background: "#0f172a" }}
                disabled={brands.length === 0}
                onClick={() => void runBatchBrandResearch()}
                title="Étape 1 — analyse toutes les marques pas encore en cache"
              >
                {pendingBrandPitches.length > 0 && brandCacheCount > 0 ? (
                  <>Analyser les marques restantes ({pendingBrandPitches.length})</>
                ) : brandsDone ? (
                  <>1. Marques OK ({brands.length})</>
                ) : (
                  <>
                    1. Analyser les marques
                    {pendingBrandPitches.length > 0
                      ? ` (${pendingBrandPitches.length})`
                      : brands.length > 0
                        ? ` (${brands.length})`
                        : ""}
                  </>
                )}
              </button>
              <button
                type="button"
                className={btnPrimary}
                style={{
                  background: brandsDone ? "#0f172a" : "#94a3b8",
                }}
                disabled={brands.length === 0 || !brandsDone}
                onClick={() => void runBatchLeynaScan()}
                title={
                  brandsDone
                    ? "Étape 2 — scan historique Leyna pour les marques analysées"
                    : "D’abord terminer l’analyse des marques"
                }
              >
                {pendingLeynaPitches.length > 0 && leynaCacheCount > 0 ? (
                  <>Analyser Leyna restantes ({pendingLeynaPitches.length})</>
                ) : leynaDone ? (
                  <>2. Leyna OK ({brands.length})</>
                ) : (
                  <>
                    2. Analyser boîte Leyna
                    {brandsDone && pendingLeynaPitches.length > 0
                      ? ` (${pendingLeynaPitches.length})`
                      : ""}
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
