"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  cacheOutreachBrandResearch,
  hasOutreachBrandCacheEntry,
  loadOutreachBrandResearchCache,
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
  market: "FR" | "BENELUX";
  brands: OutreachBatchBrandGroup[];
  onFlash?: (kind: "success" | "error", message: string) => void;
};

function researchLabel(g: OutreachBatchBrandGroup): string {
  const covered = (g.coveredBrands || [])
    .map((b) => b.trim())
    .filter(Boolean);
  if (covered.length > 0) return covered.join(", ");
  return (g.company || "").trim();
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

  const refreshCacheCount = useCallback(() => {
    const cache = loadOutreachBrandResearchCache(market);
    let n = 0;
    for (const g of brands) {
      if (
        hasOutreachBrandCacheEntry(
          cache,
          researchLabel(g),
          g.company,
          ...(g.coveredBrands || [])
        )
      ) {
        n += 1;
      }
    }
    setBrandCacheCount(n);
  }, [market, brands]);

  useEffect(() => {
    refreshCacheCount();
  }, [refreshCacheCount]);

  const pending = useMemo(() => {
    const cache = loadOutreachBrandResearchCache(market);
    return brands.filter(
      (g) =>
        researchLabel(g) &&
        !hasOutreachBrandCacheEntry(
          cache,
          researchLabel(g),
          g.company,
          ...(g.coveredBrands || [])
        )
    );
  }, [brands, market, brandCacheCount]);

  async function runBatchBrandResearch() {
    if (running) return;
    if (brands.length === 0) {
      onFlash?.("success", "Aucune marque à analyser.");
      return;
    }
    const targets = pending;
    if (targets.length === 0) {
      onFlash?.(
        "success",
        `Toutes les marques sont déjà analysées (${brands.length}).`
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
    setCurrent(researchLabel(targets[0]!) || "");

    let ok = 0;
    let fail = 0;

    const analyzeOne = async (g: OutreachBatchBrandGroup) => {
      const brandName = researchLabel(g);
      const availabilityFocus: "FR" | "BE" =
        g.pipeline === "BENELUX" && !g.alsoInSiblingMarket ? "BE" : "FR";
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
      cacheOutreachBrandResearch(
        market,
        brandName,
        data as OutreachCachedBrandResearch
      );
      // Aussi indexer sous le nom maison mère pour le lookup composer.
      if (g.company && g.company.trim() !== brandName) {
        cacheOutreachBrandResearch(
          market,
          g.company.trim(),
          data as OutreachCachedBrandResearch
        );
      }
    };

    try {
      await mapPool(targets, 2, async (g) => {
        if (ac.signal.aborted) return;
        const label = researchLabel(g);
        setCurrent(label);
        try {
          await analyzeOne(g);
          ok += 1;
        } catch (e) {
          if (ac.signal.aborted) return;
          fail += 1;
          console.error(`[outreach-batch] brand-research ${label}:`, e);
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
          `Marques analysées (${ok}). Ouvre « Rédiger le mail » → sélectionne les talents → analyse → Leyna.`
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
              : `Prépare l’étape 1 : analyser les marques À contacter (${brandCacheCount}/${brands.length} en cache). Ensuite, marque par marque : sélection talents → analyse → boîte Leyna.`}
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
              {pending.length > 0 && brandCacheCount > 0 ? (
                <>Analyser les marques restantes ({pending.length})</>
              ) : brandCacheCount >= brands.length && brands.length > 0 ? (
                <>Marques déjà analysées ({brands.length})</>
              ) : (
                <>
                  Analyser toutes les marques
                  {brands.length > 0 ? ` (${brands.length})` : ""}
                </>
              )}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
