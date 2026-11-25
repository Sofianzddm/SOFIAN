"use client";

/**
 * Analyse Chat — quelles marques contacter pour Festival de Cannes.
 * Même moteur VPS que /cannes-partenaires/carto, prompt CANNES_BRANDS.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { Loader2, Sparkles, Plus, Check } from "lucide-react";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";

type ProgressLine = {
  id: string;
  step: string;
  label: string;
  detail?: string;
  at: number;
};

type BrandRow = {
  nom: string;
  secteur: string | null;
  priorite: "P1" | "P2" | "P3";
  typologie?: "HISTORIQUE" | "POTENTIEL";
  whyContact: string;
  suggestedAngle: string;
  signals: string | null;
  alreadyInPipeline: boolean;
  marqueId: string | null;
};

type Result = {
  summary: string;
  brands: BrandRow[];
  chatAnswer?: string;
  focus?: string | null;
};

function prioriteClass(p: string): string {
  if (p === "P1") return "bg-red-50 text-red-700 ring-red-600/20";
  if (p === "P3") return "bg-gray-100 text-gray-600 ring-gray-500/15";
  return "bg-amber-50 text-amber-800 ring-amber-600/20";
}

export function CannesBrandsClient() {
  const { data: session, status } = useSession();
  const allowed = canAccessCannesPartenaires(session?.user?.role);

  const [focus, setFocus] = useState("");
  const [running, setRunning] = useState(false);
  const [phase, setPhase] = useState<"idle" | "queued" | "chat" | "structure">(
    "idle"
  );
  const [loadingHint, setLoadingHint] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [progressLog, setProgressLog] = useState<ProgressLine[]>([]);
  const [lastEndMarker, setLastEndMarker] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement | null>(null);
  const abortRef = useRef(false);

  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [adding, setAdding] = useState(false);
  const [flash, setFlash] = useState<string | null>(null);
  const [addedKeys, setAddedKeys] = useState<Set<string>>(new Set());

  useEffect(() => {
    if (!running) return;
    logEndRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, [progressLog, running]);

  function pushLog(step: string, label: string, detail?: string) {
    setProgressLog((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        step,
        label,
        detail,
        at: Date.now(),
      },
    ]);
  }

  async function tryStructure(endMarker: string): Promise<Result | null> {
    setPhase("structure");
    setLoadingHint("Classement des marques…");
    const res = await fetch("/api/cannes-partenaires/brands/preview", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        mode: "read_screen",
        endMarker,
        focus: focus.trim() || undefined,
      }),
    });
    const data = (await res.json().catch(() => ({}))) as {
      error?: string;
      structured?: { summary?: string; brands?: BrandRow[] };
      chatAnswer?: string;
      focus?: string | null;
    };
    if (!res.ok) {
      if (res.status === 409) return null;
      throw new Error(data.error || "Classement impossible");
    }
    const brands = Array.isArray(data.structured?.brands)
      ? data.structured!.brands!
      : [];
    if (!brands.length) return null;
    return {
      summary: data.structured?.summary || "",
      brands,
      chatAnswer: data.chatAnswer,
      focus: data.focus,
    };
  }

  async function runAnalysis() {
    if (running) return;
    abortRef.current = false;
    setRunning(true);
    setError(null);
    setResult(null);
    setProgressLog([]);
    setSelected(new Set());
    setAddedKeys(new Set());
    setFlash(null);
    setLastEndMarker(null);
    setPhase("queued");
    setLoadingHint("Lancement de l’analyse");

    try {
      pushLog("start", "Lancement analyse Cannes");
      const startRes = await fetch("/api/cannes-partenaires/brands/preview", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mode: "vps_start",
          focus: focus.trim() || undefined,
        }),
      });
      const startData = (await startRes.json().catch(() => ({}))) as {
        error?: string;
        endMarker?: string;
      };
      if (!startRes.ok && startRes.status !== 202) {
        throw new Error(startData.error || "Impossible de lancer l’analyse");
      }
      const ourEndMarker = String(startData.endMarker || "").trim();
      if (!ourEndMarker) throw new Error("Marker de fin manquant — relance");
      setLastEndMarker(ourEndMarker);
      pushLog("queued", "Analyse lancée", ourEndMarker.slice(-12));
      setPhase("chat");
      setLoadingHint("Recherche des marques à contacter…");

      let idleDeadline = Date.now() + 30 * 60_000;
      let lastChars = 0;
      let gotResult = false;

      while (Date.now() < idleDeadline && !abortRef.current) {
        await new Promise((r) => setTimeout(r, 2000));
        if (abortRef.current) break;

        const hRes = await fetch("/api/cannes-partenaires/brands/preview", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ mode: "health" }),
        });
        const h = (await hRes.json().catch(() => ({}))) as {
          jobs?: Array<{
            state?: string;
            endMarker?: string;
            answerChars?: number;
            error?: string | null;
          }>;
        };
        const jobs = Array.isArray(h.jobs) ? h.jobs : [];
        const ourJob =
          jobs.find((j) => String(j.endMarker || "") === ourEndMarker) || null;
        const chars = Number(ourJob?.answerChars || 0);
        const state = String(ourJob?.state || "");

        if (state === "queued") {
          setPhase("queued");
          setLoadingHint("En file d’attente…");
        } else if (state === "running") {
          setPhase("chat");
          setLoadingHint(
            chars > 0
              ? `Analyse en cours · ${chars.toLocaleString("fr-FR")} car.`
              : "Rédaction en cours…"
          );
          if (chars !== lastChars && chars > 0) {
            lastChars = chars;
            idleDeadline = Date.now() + 12 * 60_000;
            pushLog("chat", "Réponse en cours", `${chars} caractères`);
          }
        } else if (state === "done" || state === "error") {
          if (state === "error") {
            throw new Error(ourJob?.error || "Erreur analyse");
          }
          const structured = await tryStructure(ourEndMarker);
          if (structured?.brands?.length) {
            setResult(structured);
            setSelected(
              new Set(
                structured.brands
                  .filter((b) => !b.alreadyInPipeline && b.priorite === "P1")
                  .map((b) => b.nom)
              )
            );
            setPhase("idle");
            setLoadingHint("");
            pushLog("done", "Terminé", `${structured.brands.length} marques`);
            gotResult = true;
            break;
          }
          idleDeadline = Date.now() + 3 * 60_000;
          pushLog("structure", "Classement…", "réessai");
        }
      }

      if (!abortRef.current && !gotResult && ourEndMarker) {
        const structured = await tryStructure(ourEndMarker);
        if (structured?.brands?.length) {
          setResult(structured);
          setSelected(
            new Set(
              structured.brands
                .filter((b) => !b.alreadyInPipeline && b.priorite === "P1")
                .map((b) => b.nom)
            )
          );
        } else {
          setError("Analyse terminée mais aucune marque extraite.");
        }
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
      setPhase("idle");
      setLoadingHint("");
    }
  }

  function toggleBrand(nom: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(nom)) next.delete(nom);
      else next.add(nom);
      return next;
    });
  }

  async function enrollSelected() {
    if (!result || selected.size === 0 || adding) return;
    setAdding(true);
    setFlash(null);
    setError(null);
    try {
      const brands = result.brands.filter((b) => selected.has(b.nom));
      const res = await fetch("/api/cannes-partenaires/brands/enroll", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brands }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        throw new Error(
          (data as { error?: string }).error || "Ajout pipeline impossible"
        );
      }
      const created = Number((data as { created?: number }).created || 0);
      const skipped = Number((data as { skipped?: number }).skipped || 0);
      setFlash(
        `${created} ajoutée(s) au pipeline` +
          (skipped ? ` · ${skipped} déjà présentes` : "")
      );
      setAddedKeys((prev) => {
        const next = new Set(prev);
        for (const b of brands) next.add(b.nom.toLowerCase());
        return next;
      });
      setSelected(new Set());
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setAdding(false);
    }
  }

  if (status === "loading") {
    return (
      <div className="flex h-64 items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-amber-700" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="p-6 text-sm text-red-600">Accès réservé.</div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            href="/cannes-partenaires"
            className="text-sm text-amber-800 underline"
          >
            ← Cannes Partenaires
          </Link>
          <h1 className="mt-2 text-2xl font-semibold text-gray-900">
            Analyse marque
          </h1>
        </div>
        <Link
          href="/cannes-partenaires/carto"
          className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm font-medium text-gray-800 hover:bg-gray-50"
        >
          Carto contacts →
        </Link>
      </div>

      <div className="rounded-xl border border-amber-200 bg-amber-50/50 p-4 space-y-3">
        <label className="block text-xs font-medium text-amber-950">
          Focus optionnel (secteur, angle, typologie…)
        </label>
        <input
          value={focus}
          onChange={(e) => setFocus(e.target.value)}
          disabled={running}
          placeholder="Ex. beauty luxe FR · champagne · auto premium · first-timers Cannes…"
          className="w-full rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm"
        />
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={running}
            onClick={() => void runAnalysis()}
            className="inline-flex items-center gap-2 rounded-lg bg-amber-900 px-4 py-2 text-sm font-medium text-white hover:bg-amber-950 disabled:opacity-50"
          >
            {running ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Sparkles className="h-4 w-4" />
            )}
            {running ? "Analyse en cours…" : "Analyse"}
          </button>
          {running ? (
            <button
              type="button"
              onClick={() => {
                abortRef.current = true;
              }}
              className="rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700"
            >
              Arrêter
            </button>
          ) : null}
          {lastEndMarker && !running ? (
            <button
              type="button"
              onClick={async () => {
                try {
                  setError(null);
                  const structured = await tryStructure(lastEndMarker);
                  if (structured?.brands?.length) {
                    setResult(structured);
                    setFlash("Classement relancé");
                  } else {
                    setError("Pas encore prêt — attends ou relance l’analyse");
                  }
                } catch (e) {
                  setError(e instanceof Error ? e.message : "Erreur");
                }
              }}
              className="rounded-lg border border-amber-300 bg-white px-3 py-2 text-sm text-amber-950"
            >
              Lire / classer l’écran
            </button>
          ) : null}
        </div>
        {loadingHint ? (
          <p className="text-xs text-amber-900/80">{loadingHint}</p>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      ) : null}
      {flash ? (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {flash}{" "}
          <Link href="/cannes-partenaires?tab=board" className="underline">
            Voir le pipeline
          </Link>
        </div>
      ) : null}

      {progressLog.length > 0 ? (
        <div className="max-h-40 overflow-auto rounded-lg border border-gray-200 bg-white px-3 py-2 text-xs text-gray-600">
          {progressLog.map((l) => (
            <div key={l.id} className="flex gap-2 py-0.5">
              <span className="shrink-0 font-medium text-gray-800">
                {l.label}
              </span>
              {l.detail ? (
                <span className="truncate text-gray-400">{l.detail}</span>
              ) : null}
            </div>
          ))}
          <div ref={logEndRef} />
        </div>
      ) : null}

      {result ? (
        <div className="space-y-4">
          {result.summary ? (
            <div className="rounded-xl border border-gray-200 bg-white px-4 py-3 text-sm text-gray-700 leading-relaxed">
              {result.summary}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-gray-600">
              {result.brands.length} marque(s) · {selected.size} sélectionnée(s)
            </p>
            <button
              type="button"
              disabled={selected.size === 0 || adding}
              onClick={() => void enrollSelected()}
              className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
            >
              {adding ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Plus className="h-4 w-4" />
              )}
              Ajouter au pipeline Cannes
            </button>
          </div>

          <ul className="space-y-2">
            {result.brands.map((b) => {
              const key = b.nom.toLowerCase();
              const isAdded = addedKeys.has(key) || b.alreadyInPipeline;
              const isSel = selected.has(b.nom);
              return (
                <li
                  key={b.nom}
                  className={`rounded-xl border bg-white px-4 py-3 ${
                    isSel
                      ? "border-amber-300 ring-1 ring-amber-200"
                      : "border-gray-200"
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-1"
                      checked={isSel}
                      disabled={isAdded}
                      onChange={() => toggleBrand(b.nom)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <span className="font-semibold text-gray-900">
                          {b.nom}
                        </span>
                        <span
                          className={`rounded px-1.5 py-0.5 text-[10px] font-bold ring-1 ring-inset ${prioriteClass(
                            b.priorite
                          )}`}
                        >
                          {b.priorite}
                        </span>
                        {b.typologie === "HISTORIQUE" ? (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-sky-50 text-sky-800 ring-sky-600/20">
                            Années précédentes
                          </span>
                        ) : b.typologie === "POTENTIEL" ? (
                          <span className="rounded px-1.5 py-0.5 text-[10px] font-medium ring-1 ring-inset bg-violet-50 text-violet-800 ring-violet-600/20">
                            Pourrait y être
                          </span>
                        ) : null}
                        {b.secteur ? (
                          <span className="text-xs text-gray-400">
                            {b.secteur}
                          </span>
                        ) : null}
                        {isAdded ? (
                          <span className="inline-flex items-center gap-1 text-xs font-medium text-emerald-700">
                            <Check className="h-3 w-3" />
                            Pipeline
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 text-sm text-gray-600">{b.whyContact}</p>
                      <p className="mt-1 text-sm text-amber-900/90">
                        <span className="font-medium">Angle :</span>{" "}
                        {b.suggestedAngle}
                      </p>
                      {b.signals ? (
                        <p className="mt-0.5 text-xs text-gray-400">
                          Signaux : {b.signals}
                        </p>
                      ) : null}
                    </div>
                    {!isAdded ? (
                      <Link
                        href={`/cannes-partenaires/carto?company=${encodeURIComponent(
                          b.nom
                        )}`}
                        className="shrink-0 text-xs text-amber-800 underline"
                      >
                        Carto
                      </Link>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      {phase !== "idle" && !result ? (
        <div className="flex items-center gap-2 text-sm text-gray-500">
          <Loader2 className="h-4 w-4 animate-spin text-amber-700" />
          {loadingHint || "Analyse…"}
        </div>
      ) : null}
    </div>
  );
}
