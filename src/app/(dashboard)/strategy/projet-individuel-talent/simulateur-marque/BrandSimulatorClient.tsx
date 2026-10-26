"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  Sparkles,
  Search,
  ExternalLink,
  Copy,
  Check,
  AlertTriangle,
  Target,
  Radio,
  Plus,
} from "lucide-react";

type ProgressLine = {
  id: string;
  step: string;
  label: string;
  detail?: string;
  queries?: string[];
  at: number;
};

type TalentOption = {
  id: string;
  prenom: string;
  nom: string;
  photo: string | null;
  niches: string[];
  instagram?: string | null;
  igFollowers?: number;
};

type Profile = {
  whoTheyAre: string;
  whatTheyDo: string;
  profileAnalysis: string;
  contentThemes: string;
  proofPoints: string;
  sourcesUsed: string;
  brandUniverseHints: string;
  detectedMoments?: string;
};

type BrandRow = {
  marqueId: string | null;
  nom: string;
  secteur: string | null;
  fitScore: number;
  whyFit: string;
  suggestedAngle: string;
  inCrm: boolean;
  alreadyContacted: boolean;
  alreadyWorkedWith?: boolean;
};

type SimResult = {
  talent: {
    id: string;
    name: string;
    niches: string[];
    sports?: string[];
    photo: string | null;
    instagram?: string | null;
  };
  momentContext?: string | null;
  profile: Profile;
  brands: BrandRow[];
  pastBrands?: string[];
  meta?: {
    candidateCount?: number;
    secteurs?: string[];
    contactedCount?: number;
    pastBrandCount?: number;
    brandCount?: number;
    hasMomentContext?: boolean;
    lifestyleSignals?: {
      sports?: string[];
      animaux?: string[];
      enfants?: number | null;
      enceinte?: boolean;
    };
    apify?: {
      note?: string;
      igCaptions?: number;
      tiktokCaptions?: number;
      hashtags?: string[];
      mentions?: string[];
    };
  };
};

function scoreColor(score: number): string {
  if (score >= 85) return "bg-emerald-50 text-emerald-800 border-emerald-200";
  if (score >= 70) return "bg-amber-50 text-amber-900 border-amber-200";
  return "bg-stone-50 text-stone-700 border-stone-200";
}

export function BrandSimulatorClient() {
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [loadingTalents, setLoadingTalents] = useState(true);
  const [query, setQuery] = useState("");
  const [talentId, setTalentId] = useState("");
  const [momentContext, setMomentContext] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "profile" | "match" | "sponsors">(
    "idle"
  );
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressLine[]>([]);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const [selectedBrands, setSelectedBrands] = useState<Set<string>>(new Set());
  const [addingPipeline, setAddingPipeline] = useState(false);
  const [pipelineMsg, setPipelineMsg] = useState<string | null>(null);
  const [pipelineError, setPipelineError] = useState<string | null>(null);
  const [addedBrandKeys, setAddedBrandKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!running) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [progressLog, running]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTalents(true);
      try {
        const res = await fetch("/api/talents?presskit=true", {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.message || data.error || "Chargement talents impossible.");
        const list = (Array.isArray(data.talents) ? data.talents : Array.isArray(data) ? data : [])
          .map((t: Record<string, unknown>) => ({
            id: String(t.id || ""),
            prenom: String(t.prenom || ""),
            nom: String(t.nom || ""),
            photo: (t.photo as string | null) || null,
            niches: Array.isArray(t.niches) ? (t.niches as string[]) : [],
            instagram: (t.instagram as string | null) || null,
            igFollowers: Number(
              (t.stats as { igFollowers?: number } | undefined)?.igFollowers ||
                t.igFollowers ||
                0
            ),
          }))
          .filter((t: TalentOption) => t.id);
        if (!cancelled) setTalents(list);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : "Erreur chargement talents.");
        }
      } finally {
        if (!cancelled) setLoadingTalents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return talents.slice(0, 80);
    return talents
      .filter((t) => {
        const label = `${t.prenom} ${t.nom} ${t.instagram || ""} ${t.niches.join(" ")}`.toLowerCase();
        return label.includes(q);
      })
      .slice(0, 80);
  }, [talents, query]);

  const selected = talents.find((t) => t.id === talentId) || null;

  async function runSimulator() {
    if (!talentId) {
      setError("Sélectionne un créateur.");
      return;
    }
    setRunning(true);
    setError(null);
    setResult(null);
    setProgressLog([]);
    setSelectedBrands(new Set());
    setAddedBrandKeys(new Set());
    setPipelineMsg(null);
    setPipelineError(null);
    setPhase("profile");
    try {
      const res = await fetch("/api/strategy/brand-simulator", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId,
          limit: 50,
          stream: true,
          momentContext: momentContext.trim() || undefined,
        }),
      });

      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Simulateur impossible.");
      }

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let gotResult = false;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() || "";

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          let event: Record<string, unknown>;
          try {
            event = JSON.parse(trimmed) as Record<string, unknown>;
          } catch {
            continue;
          }

          if (event.type === "progress") {
            const step = String(event.step || "");
            if (step === "match" || step === "match_more") setPhase("match");
            else if (step === "sponsors") setPhase("sponsors");
            else if (step === "apify" || step === "profile" || step === "crm") {
              setPhase("profile");
            }
            setProgressLog((prev) => [
              ...prev,
              {
                id: `${Date.now()}-${prev.length}`,
                step,
                label: String(event.label || step),
                detail:
                  typeof event.detail === "string" ? event.detail : undefined,
                queries: Array.isArray(event.queries)
                  ? (event.queries as unknown[])
                      .map((q) => String(q || "").trim())
                      .filter(Boolean)
                  : undefined,
                at: Date.now(),
              },
            ]);
          } else if (event.type === "result") {
            gotResult = true;
            const payload = { ...event };
            delete payload.type;
            setResult(payload as unknown as SimResult);
          } else if (event.type === "error") {
            throw new Error(
              String(event.error || "Simulateur impossible.")
            );
          }
        }
      }

      if (!gotResult) {
        throw new Error("Flux interrompu — pas de résultat.");
      }
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setPhase("idle");
    } finally {
      setRunning(false);
    }
  }

  async function copyAngle(brand: BrandRow) {
    const text = [
      `${result?.talent.name || "Créateur"} × ${brand.nom}`,
      brand.whyFit,
      brand.suggestedAngle ? `Angle : ${brand.suggestedAngle}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(brand.nom);
      window.setTimeout(() => setCopiedId(null), 1500);
    } catch {
      /* ignore */
    }
  }

  function brandKey(b: BrandRow): string {
    return (b.marqueId || b.nom).trim().toLowerCase();
  }

  function toggleBrand(b: BrandRow) {
    const key = brandKey(b);
    if (addedBrandKeys.has(key)) return;
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectTopBrands(n: number) {
    if (!result) return;
    const next = new Set<string>();
    for (const b of result.brands.slice(0, n)) {
      const key = brandKey(b);
      if (!addedBrandKeys.has(key)) next.add(key);
    }
    setSelectedBrands(next);
  }

  async function addSelectedToPipeline() {
    if (!result?.talent.id || selectedBrands.size === 0) return;
    setAddingPipeline(true);
    setPipelineMsg(null);
    setPipelineError(null);

    const toAdd = result.brands.filter((b) => selectedBrands.has(brandKey(b)));
    let ok = 0;
    let enrichOk = 0;
    const fails: string[] = [];
    const newlyAdded = new Set(addedBrandKeys);

    for (const b of toAdd) {
      const key = brandKey(b);
      try {
        const res = await fetch("/api/strategy/contact-missions", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            talentId: result.talent.id,
            targetBrand: b.nom,
            marqueId: b.marqueId || null,
            strategyReason: b.whyFit?.trim() || "Simulateur marque",
            recommendedAngle: b.suggestedAngle?.trim() || null,
            notifyAdmin: false,
          }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          fails.push(
            `${b.nom} : ${data.error || `erreur ${res.status}`}`
          );
          continue;
        }
        ok += 1;
        newlyAdded.add(key);

        const missionId = String(data?.mission?.id || "");
        if (!b.inCrm && missionId) {
          const enrichRes = await fetch(
            `/api/strategy/contact-missions/${missionId}/request-enrichissement`,
            {
              method: "POST",
              credentials: "include",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                note: "Ajout depuis le Simulateur marque — marque absente du CRM.",
              }),
            }
          );
          if (enrichRes.ok) enrichOk += 1;
        }
      } catch (e) {
        fails.push(
          `${b.nom} : ${e instanceof Error ? e.message : "erreur réseau"}`
        );
      }
    }

    setAddedBrandKeys(newlyAdded);
    setSelectedBrands((prev) => {
      const next = new Set(prev);
      for (const k of newlyAdded) next.delete(k);
      return next;
    });

    const parts = [
      ok > 0
        ? `${ok} marque${ok > 1 ? "s" : ""} ajoutée${ok > 1 ? "s" : ""} à la prospection indiv de ${result.talent.name}`
        : null,
      enrichOk > 0
        ? `${enrichOk} envoyée${enrichOk > 1 ? "s" : ""} en enrichissement (hors CRM)`
        : null,
    ].filter(Boolean);
    if (parts.length) setPipelineMsg(parts.join(" · "));
    if (fails.length) {
      setPipelineError(
        fails.length <= 3
          ? fails.join(" · ")
          : `${fails.slice(0, 2).join(" · ")} · +${fails.length - 2} autres`
      );
    }
    setAddingPipeline(false);
  }

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-glowup-rose/80">
          Strategy · Casting
        </p>
        <h1 className="mt-1 font-serif text-3xl text-glowup-licorice sm:text-4xl">
          Simulateur marque
        </h1>
        <p className="mt-2 max-w-2xl text-sm text-stone-500">
          Analyse toute la fiche talent + IG + web, détecte les moments de vie
          tout seul, puis matche des marques niches ultra-pertinentes.
        </p>
      </div>

      <div className="rounded-2xl border border-stone-200/80 bg-gradient-to-br from-[#FBF7F2] via-white to-[#F3EDE6] p-5 shadow-sm sm:p-6">
        <label className="block text-xs font-semibold uppercase tracking-wide text-stone-500">
          Créateur
        </label>
        <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-end">
          <div className="relative flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-stone-400" />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Chercher un talent…"
              className="w-full rounded-xl border border-stone-200 bg-white py-2.5 pl-9 pr-3 text-sm outline-none focus:border-glowup-rose/40 focus:ring-2 focus:ring-glowup-rose/15"
            />
          </div>
          <select
            value={talentId}
            onChange={(e) => setTalentId(e.target.value)}
            disabled={loadingTalents || running}
            className="w-full rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none focus:border-glowup-rose/40 focus:ring-2 focus:ring-glowup-rose/15 sm:max-w-xs"
          >
            <option value="">
              {loadingTalents ? "Chargement…" : "Choisir un créateur"}
            </option>
            {filtered.map((t) => (
              <option key={t.id} value={t.id}>
                {t.prenom} {t.nom}
                {t.niches[0] ? ` · ${t.niches[0]}` : ""}
              </option>
            ))}
          </select>
          <button
            type="button"
            disabled={!talentId || running}
            onClick={() => void runSimulator()}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-glowup-licorice px-4 py-2.5 text-sm font-medium text-white transition hover:bg-glowup-licorice/90 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {running
              ? phase === "sponsors"
                ? "Sponsors events…"
                : phase === "match"
                  ? "Matching marques…"
                  : "Apify + analyse…"
              : "Analyser & matcher"}
          </button>
        </div>

        {selected && (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-white/60 bg-white/70 px-3 py-2">
            <div className="h-11 w-11 overflow-hidden rounded-xl bg-stone-100 ring-1 ring-stone-200">
              {selected.photo ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={selected.photo}
                  alt=""
                  className="h-full w-full object-cover"
                />
              ) : (
                <div className="flex h-full w-full items-center justify-center text-xs font-semibold text-stone-400">
                  {selected.prenom.charAt(0)}
                  {selected.nom.charAt(0)}
                </div>
              )}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold text-glowup-licorice">
                {selected.prenom} {selected.nom}
              </p>
              <p className="truncate text-xs text-stone-500">
                {(selected.niches || []).slice(0, 3).join(" · ") || "Sans niche"}
                {selected.instagram
                  ? ` · @${selected.instagram
                      .replace(/^@/, "")
                      .replace(/^https?:\/\/(www\.)?instagram\.com\/@?/i, "")
                      .replace(/\/+$/, "")
                      .replace(/[?#].*$/, "")}`
                  : ""}
              </p>
            </div>
          </div>
        )}

        <details className="mt-4 group">
          <summary className="cursor-pointer list-none text-xs font-medium text-stone-500 hover:text-stone-700">
            <span className="underline-offset-2 group-open:underline">
              Forcer un contexte (optionnel)
            </span>
            <span className="ml-1 font-normal text-stone-400">
              — sinon détecté auto depuis la fiche
            </span>
          </summary>
          <textarea
            id="moment-context"
            value={momentContext}
            onChange={(e) => setMomentContext(e.target.value.slice(0, 500))}
            disabled={running}
            rows={2}
            placeholder="Uniquement si tu veux forcer un angle non visible sur la fiche…"
            className="mt-2 w-full resize-y rounded-xl border border-stone-200 bg-white px-3 py-2.5 text-sm outline-none placeholder:text-stone-400 focus:border-glowup-rose/40 focus:ring-2 focus:ring-glowup-rose/15 disabled:opacity-60"
          />
        </details>
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {(running || progressLog.length > 0) && (
        <div className="mt-6 rounded-2xl border border-stone-200 bg-[#1a1714] p-4 text-stone-200 shadow-sm sm:p-5">
          <div className="mb-3 flex items-center justify-between gap-2">
            <div className="flex items-center gap-2">
              <Radio
                className={`h-3.5 w-3.5 ${
                  running ? "animate-pulse text-emerald-400" : "text-stone-500"
                }`}
              />
              <p className="text-xs font-semibold uppercase tracking-wide text-stone-400">
                Journal de recherche
              </p>
            </div>
            {running && (
              <span className="inline-flex items-center gap-1.5 text-[11px] text-emerald-400/90">
                <Loader2 className="h-3 w-3 animate-spin" />
                En cours
              </span>
            )}
          </div>
          <ul className="max-h-72 space-y-3 overflow-y-auto pr-1 font-mono text-[12px] leading-relaxed">
            {progressLog.length === 0 && running && (
              <li className="text-stone-500">Connexion au flux…</li>
            )}
            {progressLog.map((line, idx) => {
              const isLast = idx === progressLog.length - 1 && running;
              return (
                <li
                  key={line.id}
                  className={
                    isLast ? "text-emerald-300" : "text-stone-400"
                  }
                >
                  <div className="flex flex-wrap items-baseline gap-x-2">
                    <span className="text-stone-600">
                      {new Date(line.at).toLocaleTimeString("fr-FR", {
                        hour: "2-digit",
                        minute: "2-digit",
                        second: "2-digit",
                      })}
                    </span>
                    <span
                      className={
                        isLast
                          ? "font-semibold text-emerald-200"
                          : "font-medium text-stone-200"
                      }
                    >
                      {line.label}
                    </span>
                  </div>
                  {line.detail && (
                    <p className="mt-0.5 pl-[4.5rem] text-stone-500">
                      {line.detail}
                    </p>
                  )}
                  {line.queries && line.queries.length > 0 && (
                    <ul className="mt-1 space-y-0.5 pl-[4.5rem]">
                      {line.queries.map((q) => (
                        <li key={q} className="text-amber-200/80">
                          <span className="text-stone-600">→ </span>
                          {q}
                        </li>
                      ))}
                    </ul>
                  )}
                </li>
              );
            })}
            <div ref={logEndRef} />
          </ul>
        </div>
      )}

      {result && !running && (
        <div className="mt-8 space-y-6">
          <section className="rounded-2xl border border-stone-200 bg-white p-5 sm:p-6">
            <div className="flex items-center gap-2 text-glowup-rose">
              <Target className="h-4 w-4" />
              <h2 className="text-sm font-semibold uppercase tracking-wide">
                Analyse créateur
              </h2>
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <ProfileBlock title="Qui c’est" body={result.profile.whoTheyAre} />
              <ProfileBlock title="Ce qu’il/elle fait" body={result.profile.whatTheyDo} />
              <ProfileBlock title="Analyse profil" body={result.profile.profileAnalysis} />
              <ProfileBlock title="Thèmes" body={result.profile.contentThemes} />
            </div>
            {result.profile.detectedMoments && (
              <p className="mt-4 rounded-xl border border-emerald-100 bg-emerald-50/70 px-3 py-2 text-sm text-emerald-950">
                <span className="font-semibold">Moments détectés auto : </span>
                {result.profile.detectedMoments}
              </p>
            )}
            {result.momentContext && (
              <p className="mt-2 rounded-xl border border-amber-100 bg-amber-50/70 px-3 py-2 text-sm text-amber-950">
                <span className="font-semibold">Contexte forcé : </span>
                {result.momentContext}
              </p>
            )}
            {result.profile.brandUniverseHints && (
              <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900">
                <span className="font-semibold">Univers marques : </span>
                {result.profile.brandUniverseHints}
              </p>
            )}
            {((result.talent.sports && result.talent.sports.length > 0) ||
              result.meta?.lifestyleSignals?.animaux?.length ||
              (result.meta?.lifestyleSignals?.enfants != null &&
                result.meta.lifestyleSignals.enfants > 0) ||
              result.meta?.lifestyleSignals?.enceinte) && (
              <div className="mt-3 flex flex-wrap gap-1.5">
                {(result.talent.sports || []).map((s) => (
                  <span
                    key={`sport-${s}`}
                    className="rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] text-emerald-800"
                  >
                    {s}
                  </span>
                ))}
                {(result.meta?.lifestyleSignals?.animaux || []).map((a) => (
                  <span
                    key={`animal-${a}`}
                    className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-700"
                  >
                    {a}
                  </span>
                ))}
                {result.meta?.lifestyleSignals?.enceinte && (
                  <span className="rounded-full border border-pink-200 bg-pink-50 px-2 py-0.5 text-[11px] text-pink-800">
                    Grossesse
                  </span>
                )}
                {result.meta?.lifestyleSignals?.enfants != null &&
                  result.meta.lifestyleSignals.enfants > 0 && (
                    <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800">
                      {result.meta.lifestyleSignals.enfants} enfant
                      {result.meta.lifestyleSignals.enfants > 1 ? "s" : ""}
                    </span>
                  )}
              </div>
            )}
            {Array.isArray(result.pastBrands) && result.pastBrands.length > 0 && (
              <div className="mt-4">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
                  Déjà bossé avec
                </p>
                <div className="mt-1.5 flex flex-wrap gap-1.5">
                  {result.pastBrands.map((b) => (
                    <span
                      key={b}
                      className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-700"
                    >
                      {b}
                    </span>
                  ))}
                </div>
              </div>
            )}
            {result.profile.proofPoints && (
              <p className="mt-2 text-xs text-stone-500">
                Preuves : {result.profile.proofPoints}
              </p>
            )}
            {result.profile.sourcesUsed && (
              <p className="mt-1 text-[11px] text-stone-400">
                Sources : {result.profile.sourcesUsed}
                {result.meta?.brandCount
                  ? ` · ${result.meta.brandCount} marques`
                  : result.meta?.candidateCount
                    ? ` · ${result.meta.candidateCount} marques CRM scorées`
                    : ""}
              </p>
            )}
            {result.meta?.apify && (
              <div className="mt-3 rounded-xl border border-stone-100 bg-stone-50/80 px-3 py-2 text-[11px] text-stone-600">
                <p className="font-semibold text-stone-700">Scrape Apify</p>
                <p className="mt-0.5">{result.meta.apify.note}</p>
                {(result.meta.apify.hashtags?.length ||
                  result.meta.apify.mentions?.length) && (
                  <p className="mt-1 text-stone-500">
                    {result.meta.apify.hashtags?.length
                      ? `Hashtags : ${result.meta.apify.hashtags.join(" ")}`
                      : ""}
                    {result.meta.apify.hashtags?.length &&
                    result.meta.apify.mentions?.length
                      ? " · "
                      : ""}
                    {result.meta.apify.mentions?.length
                      ? `Mentions : ${result.meta.apify.mentions.join(" ")}`
                      : ""}
                  </p>
                )}
              </div>
            )}
          </section>

          <section>
            <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl text-glowup-licorice">
                  Marques pertinentes
                </h2>
                <p className="text-sm text-stone-500">
                  {result.brands.length} suggestions classées par fit
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => selectTopBrands(10)}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-50"
                >
                  Top 10
                </button>
                <button
                  type="button"
                  onClick={() => selectTopBrands(20)}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-50"
                >
                  Top 20
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedBrands(new Set())}
                  disabled={selectedBrands.size === 0}
                  className="rounded-lg border border-stone-200 bg-white px-2.5 py-1.5 text-[11px] font-medium text-stone-600 hover:bg-stone-50 disabled:opacity-40"
                >
                  Tout désélectionner
                </button>
                <Link
                  href="/strategy/projet-individuel-talent/pipeline"
                  className="text-xs font-medium text-glowup-rose hover:underline"
                >
                  Voir le pipeline →
                </Link>
              </div>
            </div>

            <div className="sticky top-2 z-10 mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-glowup-licorice/15 bg-white/95 px-4 py-3 shadow-sm backdrop-blur">
              <p className="text-sm text-stone-600">
                <span className="font-semibold text-glowup-licorice">
                  {selectedBrands.size}
                </span>{" "}
                sélectionnée{selectedBrands.size > 1 ? "s" : ""} pour{" "}
                <span className="font-medium">{result.talent.name}</span>
              </p>
              <button
                type="button"
                disabled={selectedBrands.size === 0 || addingPipeline}
                onClick={() => void addSelectedToPipeline()}
                className="inline-flex items-center gap-2 rounded-xl bg-glowup-licorice px-4 py-2.5 text-sm font-medium text-white transition hover:bg-glowup-licorice/90 disabled:opacity-50"
              >
                {addingPipeline ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Plus className="h-4 w-4" />
                )}
                {addingPipeline
                  ? "Ajout en cours…"
                  : "Ajouter à la prospection indiv"}
              </button>
            </div>

            {pipelineMsg && (
              <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                {pipelineMsg}{" "}
                <Link
                  href="/strategy/projet-individuel-talent/pipeline"
                  className="font-medium underline underline-offset-2"
                >
                  Ouvrir le pipeline
                </Link>
              </div>
            )}
            {pipelineError && (
              <div className="mb-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {pipelineError}
              </div>
            )}

            <ul className="space-y-3">
              {result.brands.map((b, idx) => {
                const key = brandKey(b);
                const isSelected = selectedBrands.has(key);
                const isAdded = addedBrandKeys.has(key);
                return (
                <li
                  key={`${b.nom}-${idx}`}
                  className={`rounded-2xl border bg-white p-4 transition ${
                    isAdded
                      ? "border-emerald-200 bg-emerald-50/40"
                      : isSelected
                        ? "border-glowup-rose/40 ring-1 ring-glowup-rose/20"
                        : "border-stone-200 hover:border-glowup-rose/30"
                  }`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 flex-1 gap-3">
                      <input
                        type="checkbox"
                        checked={isSelected || isAdded}
                        disabled={isAdded || addingPipeline}
                        onChange={() => toggleBrand(b)}
                        className="mt-1 h-4 w-4 shrink-0 rounded border-stone-300 text-glowup-licorice focus:ring-glowup-rose/30"
                        aria-label={`Sélectionner ${b.nom}`}
                      />
                      <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-stone-400">
                          #{idx + 1}
                        </span>
                        <h3 className="text-base font-semibold text-glowup-licorice">
                          {b.nom}
                        </h3>
                        {isAdded && (
                          <span className="inline-flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-medium text-emerald-800">
                            <Check className="h-3 w-3" />
                            Dans le pipeline
                          </span>
                        )}
                        {b.secteur && (
                          <span className="rounded-full border border-stone-200 bg-stone-50 px-2 py-0.5 text-[11px] text-stone-600">
                            {b.secteur}
                          </span>
                        )}
                        {!b.inCrm && (
                          <span className="rounded-full border border-violet-200 bg-violet-50 px-2 py-0.5 text-[11px] text-violet-700">
                            Hors CRM
                          </span>
                        )}
                        {b.alreadyWorkedWith && (
                          <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[11px] text-sky-800">
                            Déjà collab
                          </span>
                        )}
                        {b.alreadyContacted && (
                          <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] text-amber-800">
                            Déjà contacté (90 j)
                          </span>
                        )}
                      </div>
                      <p className="mt-2 text-sm text-stone-700">{b.whyFit}</p>
                      {b.suggestedAngle && (
                        <p className="mt-1 text-sm text-stone-500">
                          <span className="font-medium text-stone-600">Angle : </span>
                          {b.suggestedAngle}
                        </p>
                      )}
                      </div>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-2">
                      <span
                        className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${scoreColor(
                          b.fitScore
                        )}`}
                      >
                        {b.fitScore}/100
                      </span>
                      <div className="flex gap-1.5">
                        <button
                          type="button"
                          onClick={() => void copyAngle(b)}
                          className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                          title="Copier le pitch"
                        >
                          {copiedId === b.nom ? (
                            <Check className="h-3 w-3 text-emerald-600" />
                          ) : (
                            <Copy className="h-3 w-3" />
                          )}
                          Copier
                        </button>
                        {b.marqueId && (
                          <Link
                            href={`/marques/${b.marqueId}`}
                            className="inline-flex items-center gap-1 rounded-lg border border-stone-200 px-2 py-1 text-[11px] text-stone-600 hover:bg-stone-50"
                          >
                            <ExternalLink className="h-3 w-3" />
                            CRM
                          </Link>
                        )}
                      </div>
                    </div>
                  </div>
                </li>
                );
              })}
            </ul>
          </section>
        </div>
      )}
    </div>
  );
}

function ProfileBlock({ title, body }: { title: string; body: string }) {
  if (!body) return null;
  return (
    <div>
      <p className="text-[11px] font-semibold uppercase tracking-wide text-stone-400">
        {title}
      </p>
      <p className="mt-1 text-sm leading-relaxed text-stone-700">{body}</p>
    </div>
  );
}
