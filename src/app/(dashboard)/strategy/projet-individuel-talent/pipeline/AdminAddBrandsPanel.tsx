"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, ScanSearch, Search, X } from "lucide-react";
import { brandsLookSame } from "@/lib/brand-match";

type MarqueHit = { id: string; nom: string; ville: string; contactCount: number };

type BrandHistoryHit = {
  marqueId: string | null;
  targetBrand: string;
  targetBrandKey: string;
  sentAt: string;
  daysAgo: number;
  daysLeft: number;
  blocked: boolean;
  viaTalent?: string | null;
  source?: "talent" | "wave";
};

type PipelineMissionLite = {
  id: string;
  talentId?: string | null;
  targetBrand: string;
  marqueId?: string | null;
  marqueNom?: string | null;
  stage: string;
  awaitingContactsCompletion?: boolean;
};

type AddedEntry = { missionId: string; brand: string; enriched: boolean };

const OPEN_STAGES = new Set(["STRATEGY_DEFINED", "TO_DRAFT", "DRAFTED_FOR_VALIDATION", "TO_SEND"]);
const MANUAL_KEY = "__manual__";

function formatFrDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "—";
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(d);
}

function findHistoryForBrand(
  history: BrandHistoryHit[],
  opts: { marqueId?: string | null; nom: string }
): BrandHistoryHit | null {
  const mid = String(opts.marqueId || "").trim();
  if (mid) {
    const byId = history.find((h) => h.marqueId === mid);
    if (byId) return byId;
  }
  const nom = opts.nom.trim();
  if (!nom) return null;
  return (
    history.find(
      (h) => brandsLookSame(nom, h.targetBrand) || brandsLookSame(nom, h.targetBrandKey)
    ) || null
  );
}

function PriorLine({ prior, talentName }: { prior: BrandHistoryHit; talentName: string }) {
  return (
    <div
      className={`mt-0.5 text-[11px] font-medium ${
        prior.blocked ? "text-red-600" : "text-amber-700"
      }`}
    >
      Déjà contactée
      {prior.source === "wave" && prior.viaTalent
        ? ` pour ${prior.viaTalent}`
        : ` pour ${talentName}`}{" "}
      le {formatFrDate(prior.sentAt)}
      {prior.blocked ? ` · bloqué ${prior.daysLeft} j` : ` · ok (il y a ${prior.daysAgo} j)`}
    </div>
  );
}

/**
 * Ajout direct de cartes (talent sélectionné × marque) depuis le Pipeline
 * Casting. Marque choisie dans le CRM ; si elle n'y est pas ou n'a aucun
 * contact, la carte part directement en Enrichissement.
 */
export function AdminAddBrandsPanel({
  talentId,
  talentName,
  missions,
  onClose,
  onChanged,
}: {
  talentId: string;
  talentName: string;
  missions: PipelineMissionLite[];
  onClose: () => void;
  onChanged: () => Promise<void> | void;
}) {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<MarqueHit[] | null>(null);
  const [hitsFor, setHitsFor] = useState("");
  const [searching, setSearching] = useState(false);
  const [history, setHistory] = useState<BrandHistoryHit[]>([]);
  const [strategyReason, setStrategyReason] = useState("");
  const [savingKey, setSavingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [added, setAdded] = useState<AddedEntry[]>([]);

  useEffect(() => {
    setAdded([]);
    setError(null);
    setSuccess(null);
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch(
          `/api/strategy/contact-missions/talent-brand-history?talentId=${encodeURIComponent(talentId)}`,
          { credentials: "include" }
        );
        const data = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(data.error || "Impossible de charger l'historique marques.");
        const talentHits = Array.isArray(data.history) ? (data.history as BrandHistoryHit[]) : [];
        const waveHits = Array.isArray(data.brandWave)
          ? (data.brandWave as BrandHistoryHit[]).filter(
              (w) => !findHistoryForBrand(talentHits, { marqueId: w.marqueId, nom: w.targetBrand })
            )
          : [];
        if (!cancelled) setHistory([...talentHits, ...waveHits]);
      } catch (e: unknown) {
        if (!cancelled) {
          setHistory([]);
          setError(e instanceof Error ? e.message : "Erreur historique.");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [talentId]);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) {
      setHits(null);
      setSearching(false);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`/api/marques/search?q=${encodeURIComponent(q)}`, {
          credentials: "include",
        });
        const data = await res.json().catch(() => ({}));
        if (!cancelled) {
          setHits(Array.isArray(data.marques) ? (data.marques as MarqueHit[]) : []);
          setHitsFor(q);
        }
      } catch {
        if (!cancelled) {
          setHits([]);
          setHitsFor(q);
        }
      } finally {
        if (!cancelled) setSearching(false);
      }
    }, 220);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [query]);

  const openCards = useMemo(
    () =>
      missions.filter(
        (m) =>
          m.talentId === talentId &&
          (OPEN_STAGES.has(m.stage) || Boolean(m.awaitingContactsCompletion))
      ),
    [missions, talentId]
  );

  function findOpenCard(opts: { marqueId?: string | null; nom: string }) {
    return (
      openCards.find(
        (m) =>
          (opts.marqueId && m.marqueId === opts.marqueId) ||
          brandsLookSame(opts.nom, m.marqueNom || m.targetBrand) ||
          brandsLookSame(opts.nom, m.targetBrand)
      ) || null
    );
  }

  async function addBrand(opts: {
    targetBrand: string;
    marqueId: string | null;
    enrich: boolean;
    savingKey: string;
  }) {
    setSavingKey(opts.savingKey);
    setError(null);
    setSuccess(null);
    try {
      const res = await fetch("/api/strategy/contact-missions", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          talentId,
          targetBrand: opts.targetBrand,
          marqueId: opts.marqueId,
          strategyReason: strategyReason.trim() || "À préciser",
          notifyAdmin: false,
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || "Ajout de la marque impossible.");
      const missionId = String(data?.mission?.id || "");
      const brand = String(data?.mission?.targetBrand || opts.targetBrand);

      let enriched = false;
      let enrichError: string | null = null;
      if (opts.enrich && missionId) {
        const enrichRes = await fetch(
          `/api/strategy/contact-missions/${missionId}/request-enrichissement`,
          {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              note: opts.marqueId
                ? "Ajout admin depuis le Pipeline Casting — fiche CRM sans contact."
                : "Ajout admin depuis le Pipeline Casting — marque absente du CRM.",
            }),
          }
        );
        const enrichData = await enrichRes.json().catch(() => ({}));
        if (enrichRes.ok) enriched = true;
        else enrichError = enrichData.error || "mise en enrichissement impossible";
      }

      setAdded((prev) => [{ missionId, brand, enriched }, ...prev]);
      if (enrichError) {
        setError(`${brand} ajoutée en « À rédiger », mais pas envoyée en enrichissement : ${enrichError}.`);
      } else {
        setSuccess(
          enriched
            ? `${brand} ajoutée pour ${talentName} et envoyée en Enrichissement (contacts CRM à compléter).`
            : `${brand} ajoutée pour ${talentName} en « À rédiger ».`
        );
      }
      if (opts.savingKey === MANUAL_KEY) setQuery("");
      await onChanged();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setSavingKey(null);
    }
  }

  const q = query.trim();
  const busy = savingKey !== null;
  const exactCrmHit = (hits || []).find((h) => brandsLookSame(q, h.nom)) || null;
  const showManual =
    q.length >= 2 && !searching && hits !== null && hitsFor === q && !exactCrmHit;
  const manualOpenCard = showManual ? findOpenCard({ nom: q }) : null;
  const manualPrior = showManual ? findHistoryForBrand(history, { nom: q }) : null;

  return (
    <div className="relative mt-4 rounded-xl border border-slate-200 bg-slate-50/70 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">
            Ajouter des marques · <span className="font-bold">{talentName}</span>
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            Choisis dans le CRM : la carte arrive en « À rédiger ». Marque absente du CRM ou
            sans contact → elle part directement en Enrichissement.
          </p>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="inline-flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 transition hover:bg-white hover:text-slate-900"
          aria-label="Fermer"
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      <div className="mt-3 grid gap-2 md:grid-cols-[1fr_minmax(0,320px)]">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Rechercher une marque dans le CRM…"
            className="w-full rounded-lg border border-slate-200 bg-white py-2 pl-9 pr-3 text-sm"
          />
        </div>
        <input
          value={strategyReason}
          onChange={(e) => setStrategyReason(e.target.value)}
          placeholder="Raison stratégie (optionnelle)"
          title="Appliquée aux prochains ajouts"
          className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm"
        />
      </div>

      {q.length >= 2 && (
        <div className="mt-2 max-h-[320px] overflow-auto rounded-lg border border-slate-200 bg-white">
          {searching ? (
            <div className="flex items-center gap-2 p-4 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Recherche…
            </div>
          ) : (hits || []).length === 0 ? (
            <div className="p-4 text-center text-sm text-slate-500">
              Aucune marque CRM pour « {q} ».
            </div>
          ) : (
            (hits || []).map((h) => {
              const openCard = findOpenCard({ marqueId: h.id, nom: h.nom });
              const prior = findHistoryForBrand(history, { marqueId: h.id, nom: h.nom });
              const noContact = h.contactCount === 0;
              return (
                <div
                  key={h.id}
                  className="flex items-center gap-3 border-b border-slate-100 px-3.5 py-2.5 last:border-b-0"
                >
                  <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[11px] font-semibold text-slate-700">
                    {h.nom.slice(0, 1).toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm font-semibold text-slate-900">{h.nom}</div>
                    <div
                      className={`text-[11.5px] ${
                        noContact ? "font-semibold text-amber-700" : "text-slate-500"
                      }`}
                    >
                      {noContact
                        ? "Aucun contact CRM"
                        : `${h.contactCount} contact${h.contactCount === 1 ? "" : "s"}`}
                      {h.ville ? ` · ${h.ville}` : ""}
                    </div>
                    {prior ? <PriorLine prior={prior} talentName={talentName} /> : null}
                  </div>
                  {openCard ? (
                    <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
                      {openCard.awaitingContactsCompletion
                        ? "Déjà en enrichissement"
                        : "Déjà dans le pipeline"}
                    </span>
                  ) : prior?.blocked ? (
                    <span className="shrink-0 rounded-full bg-red-50 px-2.5 py-1 text-[11px] font-medium text-red-700">
                      Bloqué {prior.daysLeft} j
                    </span>
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      onClick={() =>
                        void addBrand({
                          targetBrand: h.nom,
                          marqueId: h.id,
                          enrich: noContact,
                          savingKey: h.id,
                        })
                      }
                      className={
                        noContact
                          ? "inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
                          : "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-60"
                      }
                      title={
                        noContact
                          ? "Crée la carte et l'envoie en Enrichissement pour compléter les contacts"
                          : undefined
                      }
                    >
                      {savingKey === h.id ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : noContact ? (
                        <ScanSearch className="h-3.5 w-3.5" />
                      ) : (
                        <Plus className="h-3.5 w-3.5" />
                      )}
                      {noContact ? "Ajouter → Enrichissement" : "Ajouter"}
                    </button>
                  )}
                </div>
              );
            })
          )}
        </div>
      )}

      {showManual && (
        <div className="mt-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-dashed border-amber-300 bg-amber-50/60 px-3.5 py-2.5">
          <div className="min-w-0">
            <p className="text-sm text-slate-800">
              Pas dans le CRM ? Ajouter <span className="font-semibold">« {q} »</span>
            </p>
            <p className="text-[11px] text-slate-500">
              Une fiche marque est créée et la carte part en Enrichissement.
            </p>
            {manualPrior ? <PriorLine prior={manualPrior} talentName={talentName} /> : null}
          </div>
          {manualOpenCard ? (
            <span className="shrink-0 rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-medium text-slate-600">
              Déjà dans le pipeline
            </span>
          ) : (
            <button
              type="button"
              disabled={busy || Boolean(manualPrior?.blocked)}
              onClick={() =>
                void addBrand({
                  targetBrand: q,
                  marqueId: null,
                  enrich: true,
                  savingKey: MANUAL_KEY,
                })
              }
              className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-amber-300 bg-white px-3 py-1.5 text-xs font-semibold text-amber-900 disabled:opacity-60"
            >
              {savingKey === MANUAL_KEY ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <ScanSearch className="h-3.5 w-3.5" />
              )}
              Ajouter → Enrichissement
            </button>
          )}
        </div>
      )}

      {q.length < 2 && (
        <p className="mt-2 text-xs text-slate-500">Tape au moins 2 lettres pour chercher.</p>
      )}

      {error && (
        <p className="mt-3 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
          {error}
        </p>
      )}
      {success && (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          {success}
        </p>
      )}

      {added.length > 0 && (
        <div className="mt-3 flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-medium uppercase tracking-wide text-slate-500">
            Ajoutées
          </span>
          {added.map((a) => (
            <span
              key={a.missionId || a.brand}
              className={`rounded-full px-2.5 py-0.5 text-[11px] font-medium ${
                a.enriched ? "bg-amber-100 text-amber-900" : "bg-slate-200 text-slate-800"
              }`}
            >
              {a.brand} · {a.enriched ? "Enrichissement" : "À rédiger"}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}
