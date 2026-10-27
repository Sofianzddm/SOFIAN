"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cacheOutreachBrandResearchMarkets,
  hasOutreachBrandCacheEntry,
  loadOutreachBrandResearchCacheMarkets,
  outreachCacheMarketsForContact,
  type OutreachCachedBrandResearch,
} from "@/lib/outreach-clients-batch-cache";

export type OutreachBatchBrandGroup = {
  groupKey: string;
  company: string;
  /** Sous-marques couvertes (ex. Dove, Axe) — même logique que CastingComposer. */
  coveredBrands?: string[];
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

/** Une entrée de recherche = une marque pitchée (jamais un join multi-marques). */
function pitchBrandsForGroup(g: OutreachBatchBrandGroup): string[] {
  const covered = (g.coveredBrands || [])
    .map((b) => b.trim())
    .filter(Boolean);
  if (covered.length > 0) return Array.from(new Set(covered));
  const company = (g.company || "").trim();
  return company ? [company] : [];
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
 * Prépare l’étape 1 du composer Outreach Clients :
 * analyse toutes les marques « À contacter ».
 * Sélection talents + Leyna restent dans le CastingComposer, marque par marque.
 */
export default function OutreachClientsBatchAnalyzeBar({
  market,
  readBothMarkets = false,
  fileLabel = "À contacter",
  brands,
  onFlash,
}: Props) {
  const [brandCacheCount, setBrandCacheCount] = useState(0);
  const [running, setRunning] = useState(false);
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

  const refreshCacheCount = useCallback(() => {
    const cache = loadOutreachBrandResearchCacheMarkets(viewCacheMarkets);
    let n = 0;
    for (const g of brands) {
      const pitches = pitchBrandsForGroup(g);
      if (
        pitches.length > 0 &&
        pitches.every((p) => hasOutreachBrandCacheEntry(cache, p))
      ) {
        n += 1;
      }
    }
    setBrandCacheCount(n);
  }, [viewCacheMarkets, brands]);

  useEffect(() => {
    refreshCacheCount();
  }, [refreshCacheCount]);

  /** Marques pitchées encore sans cache (1 entrée = 1 marque, pas le groupe). */
  const pendingPitches = useMemo(() => {
    const cache = loadOutreachBrandResearchCacheMarkets(viewCacheMarkets);
    const out: Array<{ brandName: string; pipeline?: "FR" | "BENELUX"; alsoInSiblingMarket?: boolean }> =
      [];
    const seen = new Set<string>();
    for (const g of brands) {
      for (const brandName of pitchBrandsForGroup(g)) {
        const key = brandName.toLowerCase();
        if (seen.has(key)) continue;
        seen.add(key);
        if (!hasOutreachBrandCacheEntry(cache, brandName)) {
          out.push({
            brandName,
            pipeline: g.pipeline,
            alsoInSiblingMarket: g.alsoInSiblingMarket || readBothMarkets,
          });
        }
      }
    }
    return out;
  }, [brands, viewCacheMarkets, brandCacheCount, readBothMarkets]);

  async function runBatchBrandResearch() {
    if (running) return;
    if (brands.length === 0) {
      onFlash?.("success", "Aucune marque à analyser.");
      return;
    }
    const targets = pendingPitches;
    if (targets.length === 0) {
      onFlash?.(
        "success",
        `Toutes les marques sont déjà analysées (${brands.length} groupe${brands.length > 1 ? "s" : ""}).`
      );
      return;
    }

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    setRunning(true);
    setDone(0);
    setTotal(targets.length);
    setFailed(0);
    setCurrent(targets[0]?.brandName || "");

    let ok = 0;
    let fail = 0;

    const analyzeOne = async (t: (typeof targets)[number]) => {
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
      // Cache uniquement sous la marque pitchée — jamais sous le nom d’agence
      // (évite de réutiliser une analyse Kiko pour une autre marque Nice Work).
      // FR+BE : écrit FR et BENELUX pour que le composer retrouve l’analyse
      // quel que soit le pipeline primaire.
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
          `Marques analysées (${ok}). Ouvre « Rédiger le mail » → choisis la marque si besoin → talents → Leyna.`
        );
      }
    } finally {
      if (!ac.signal.aborted) {
        setRunning(false);
        setCurrent("");
      }
    }
  }

  function stop() {
    abortRef.current?.abort();
    setRunning(false);
    setCurrent("");
    refreshCacheCount();
    onFlash?.("success", "Analyse marques interrompue — cache conservé.");
  }

  const btnBase =
    "inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-40";
  const btnPrimary =
    "inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm font-semibold text-white transition disabled:cursor-not-allowed disabled:opacity-40";

  const pct =
    total > 0 ? Math.min(100, Math.round((done / total) * 100)) : 0;

  return (
    <div className="mb-4 w-full rounded-xl border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="m-0 text-xs leading-snug text-slate-500">
            {running
              ? `Analyse marques · ${current || "…"}`
              : `Prépare l’étape 1 : analyser les marques ${fileLabel} (${brandCacheCount}/${brands.length} en cache). Ensuite, marque par marque : sélection talents → analyse → boîte Leyna.`}
          </p>
          {running && (
            <div className="mt-2.5">
              <div className="mb-1 flex items-center justify-between text-[11px] text-slate-500">
                <span>
                  Marques {done}/{total}
                  {failed > 0 ? ` · ${failed} échec${failed > 1 ? "s" : ""}` : ""}
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
            <button
              type="button"
              className={btnPrimary}
              style={{ background: "#0f172a" }}
              disabled={brands.length === 0}
              onClick={() => void runBatchBrandResearch()}
              title="Analyse toutes les marques pas encore en cache"
            >
              {pendingPitches.length > 0 && brandCacheCount > 0 ? (
                <>Analyser les marques restantes ({pendingPitches.length})</>
              ) : brandCacheCount >= brands.length && brands.length > 0 ? (
                <>Marques déjà analysées ({brands.length})</>
              ) : (
                <>
                  Analyser toutes les marques
                  {pendingPitches.length > 0
                    ? ` (${pendingPitches.length})`
                    : brands.length > 0
                      ? ` (${brands.length})`
                      : ""}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
