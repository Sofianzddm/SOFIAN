"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { LevelBadge, EmptyState } from "@/components/decision-center/ui";
import type { DcLevel } from "@/lib/decision-center/constants";

type Hit = {
  policy: {
    id: string;
    code: string;
    title: string;
    domain: string;
    autonomyRule: string;
    level: DcLevel;
  };
  verdict: {
    level: DcLevel;
    headline: string;
    reason: string;
    cta: "none" | "prepare";
  };
};

export default function QuiDecidePage() {
  return (
    <Suspense fallback={<p className="text-sm text-gray-500">Chargement…</p>}>
      <QuiDecideInner />
    </Suspense>
  );
}

function QuiDecideInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const initial = searchParams.get("q") || "";
  const [q, setQ] = useState(initial);
  const [results, setResults] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);

  async function search(value: string) {
    if (!value.trim()) {
      setResults([]);
      return;
    }
    setLoading(true);
    const res = await fetch(`/api/decision-center/search?q=${encodeURIComponent(value)}`);
    const data = await res.json();
    setResults(data.results || []);
    setLoading(false);
  }

  useEffect(() => {
    if (initial) void search(initial);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initial]);

  function prepare(hit: Hit) {
    const params = new URLSearchParams({
      policyId: hit.policy.id,
      title: q,
      question: hit.policy.title,
    });
    const amount = q.match(/(\d+(?:[.,]\d+)?)/);
    if (amount) params.set("amount", amount[1].replace(",", "."));
    router.push(`/decision-center/demander?${params.toString()}`);
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-2xl font-semibold text-glowup-licorice">Qui décide ?</h1>
        <p className="text-gray-600">Décris ce que tu veux faire. La réponse doit être immédiate.</p>
      </header>

      <div className="card">
        <label htmlFor="q" className="sr-only">
          Recherche
        </label>
        <input
          id="q"
          className="input text-lg"
          placeholder="Décris ce que tu veux faire…"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void search(q);
          }}
        />
        <div className="mt-3 flex justify-end">
          <button className="btn btn-primary" onClick={() => void search(q)} disabled={loading}>
            {loading ? "Recherche…" : "Chercher"}
          </button>
        </div>
      </div>

      {!results.length && !loading && q && (
        <EmptyState
          title="Aucune règle évidente"
          hint="Essaie avec un mot plus simple : bagage, facture, avance talent, télétravail…"
        />
      )}

      <div className="space-y-3">
        {results.map((hit) => (
          <article key={hit.policy.code} className="card">
            <div className="flex flex-wrap items-center gap-2">
              <LevelBadge level={hit.verdict.level} />
              <h2 className="font-semibold text-glowup-licorice">{hit.verdict.headline}</h2>
            </div>
            <p className="mt-2 text-sm text-gray-700">{hit.verdict.reason}</p>
            <p className="mt-2 text-xs text-gray-500">{hit.policy.title}</p>
            {hit.verdict.cta === "prepare" ? (
              <button className="btn btn-primary mt-3" onClick={() => prepare(hit)}>
                Préparer la décision
              </button>
            ) : (
              <p className="mt-3 text-sm text-emerald-800">
                🟢 Tu peux décider. Pas de formulaire, pas de validation Sofian.
              </p>
            )}
          </article>
        ))}
      </div>
    </div>
  );
}
