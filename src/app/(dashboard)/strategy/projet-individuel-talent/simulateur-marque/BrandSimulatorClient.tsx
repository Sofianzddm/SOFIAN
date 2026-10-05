"use client";

import { useEffect, useMemo, useState } from "react";
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
} from "lucide-react";

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
};

type SimResult = {
  talent: {
    id: string;
    name: string;
    niches: string[];
    photo: string | null;
    instagram?: string | null;
  };
  profile: Profile;
  brands: BrandRow[];
  meta?: { candidateCount?: number; secteurs?: string[]; contactedCount?: number };
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
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "profile" | "match">("idle");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<SimResult | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    setPhase("profile");
    // UX: après ~8s on affiche "matching" même si l'API fait les 2 étapes d'un coup.
    const phaseTimer = window.setTimeout(() => setPhase("match"), 9000);
    try {
      const res = await fetch("/api/strategy/brand-simulator", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ talentId, limit: 12 }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(data.error || "Simulateur impossible.");
      }
      setResult(data as SimResult);
      setPhase("idle");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
      setPhase("idle");
    } finally {
      window.clearTimeout(phaseTimer);
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

  return (
    <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6">
      <div className="mb-8">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-glowup-rose/80">
          Strategy · Casting
        </p>
        <h1 className="mt-1 font-serif text-3xl text-glowup-licorice sm:text-4xl">
          Simulateur marque
        </h1>
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
              ? phase === "match"
                ? "Matching marques…"
                : "Analyse créateur…"
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
                {selected.instagram ? ` · @${selected.instagram.replace(/^@/, "")}` : ""}
              </p>
            </div>
          </div>
        )}
      </div>

      {error && (
        <div className="mt-4 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {running && (
        <div className="mt-8 flex flex-col items-center justify-center gap-3 py-16 text-sm text-stone-500">
          <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
          <p className="font-medium text-glowup-licorice">
            {phase === "match"
              ? "Sélection des marques les plus pertinentes…"
              : "Recherche web / IG — qui est ce créateur ?"}
          </p>
          <p className="text-xs">Ça peut prendre 30–90 secondes.</p>
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
            {result.profile.brandUniverseHints && (
              <p className="mt-4 rounded-xl border border-indigo-100 bg-indigo-50/60 px-3 py-2 text-sm text-indigo-900">
                <span className="font-semibold">Univers marques : </span>
                {result.profile.brandUniverseHints}
              </p>
            )}
            {result.profile.proofPoints && (
              <p className="mt-2 text-xs text-stone-500">
                Preuves : {result.profile.proofPoints}
              </p>
            )}
            {result.profile.sourcesUsed && (
              <p className="mt-1 text-[11px] text-stone-400">
                Sources : {result.profile.sourcesUsed}
                {result.meta?.candidateCount
                  ? ` · ${result.meta.candidateCount} marques CRM scorées`
                  : ""}
              </p>
            )}
          </section>

          <section>
            <div className="mb-3 flex items-end justify-between gap-3">
              <div>
                <h2 className="font-serif text-2xl text-glowup-licorice">
                  Marques pertinentes
                </h2>
                <p className="text-sm text-stone-500">
                  {result.brands.length} suggestions classées par fit
                </p>
              </div>
              <Link
                href="/strategy/projet-individuel-talent"
                className="text-xs font-medium text-glowup-rose hover:underline"
              >
                Créer une mission →
              </Link>
            </div>

            <ul className="space-y-3">
              {result.brands.map((b, idx) => (
                <li
                  key={`${b.nom}-${idx}`}
                  className="rounded-2xl border border-stone-200 bg-white p-4 transition hover:border-glowup-rose/30"
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="text-xs font-semibold text-stone-400">
                          #{idx + 1}
                        </span>
                        <h3 className="text-base font-semibold text-glowup-licorice">
                          {b.nom}
                        </h3>
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
              ))}
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
