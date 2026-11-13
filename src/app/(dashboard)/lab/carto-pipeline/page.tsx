"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { canAccessCartoAiPipeline } from "@/lib/carto-ai/constants";
import {
  CARTO_AI_MARCHES,
  type CartoAiContactCandidate,
  type CartoAiMarche,
  type CartoAiPreviewResult,
} from "@/lib/carto-ai/types";
import { BrandEnrichPanel } from "@/components/enrichissement/BrandEnrichPanel";

type FicheMarket = "FR" | "BENELUX";

type CommitResult = {
  marqueId: string;
  company: string;
  market?: FicheMarket;
  fichePath?: string;
  created: number;
  skipped: number;
  emailsAuto: number;
  queued: number;
  enrolled: number;
};

type MarqueHit = {
  id: string;
  nom: string;
  ville?: string;
  contactCount?: number;
};

export default function CartoAiPipelineLabPage() {
  const { data: session, status } = useSession();
  const allowed = canAccessCartoAiPipeline({
    email: session?.user?.email,
    role: session?.user?.role,
  });

  const [company, setCompany] = useState("");
  const [domain, setDomain] = useState("");
  const [language, setLanguage] = useState<"fr" | "en">("fr");
  const [ficheMarket, setFicheMarket] = useState<FicheMarket>("FR");
  const [ficheQuery, setFicheQuery] = useState("");
  const [marqueId, setMarqueId] = useState<string | null>(null);
  const [marqueNom, setMarqueNom] = useState<string | null>(null);
  const [marqueHits, setMarqueHits] = useState<MarqueHit[]>([]);
  const [loading, setLoading] = useState(false);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CartoAiPreviewResult | null>(null);
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [commitResult, setCommitResult] = useState<CommitResult | null>(null);
  const [phase, setPhase] = useState<"carto" | "enrich">("carto");

  useEffect(() => {
    const q = ficheQuery.trim();
    if (q.length < 2 || marqueId) {
      if (q.length < 2) setMarqueHits([]);
      return;
    }
    const t = window.setTimeout(async () => {
      try {
        if (ficheMarket === "BENELUX") {
          const res = await fetch(
            `/api/benelux-outreach/companies?q=${encodeURIComponent(q)}`
          );
          const data = await res.json();
          if (!res.ok) return;
          const companies = Array.isArray(data.companies)
            ? data.companies
            : [];
          setMarqueHits(
            companies.map(
              (c: {
                id: string;
                nom: string;
                ville?: string;
                _count?: { contacts?: number };
              }) => ({
                id: c.id,
                nom: c.nom,
                ville: c.ville,
                contactCount: c._count?.contacts,
              })
            )
          );
          return;
        }
        const res = await fetch(
          `/api/marques/search?q=${encodeURIComponent(q)}`
        );
        const data = await res.json();
        if (!res.ok) return;
        setMarqueHits(
          Array.isArray(data.marques) ? (data.marques as MarqueHit[]) : []
        );
      } catch {
        setMarqueHits([]);
      }
    }, 250);
    return () => window.clearTimeout(t);
  }, [ficheQuery, marqueId, ficheMarket]);

  const rows = preview?.contacts || [];

  const grouped = useMemo(() => {
    const map: Record<CartoAiMarche, Array<{ c: CartoAiContactCandidate; i: number }>> = {
      FR: [],
      EU: [],
      INT: [],
    };
    rows.forEach((c, i) => {
      const m: CartoAiMarche =
        c.marche === "EU" || c.marche === "INT" ? c.marche : "FR";
      map[m].push({ c, i });
    });
    return map;
  }, [rows]);

  const selectedRows = useMemo(
    () => rows.filter((_, i) => selected[String(i)]),
    [rows, selected]
  );

  function rowKey(c: CartoAiContactCandidate, i: number): string {
    return `${i}:${c.marche}:${c.prenom || ""}:${c.nom}:${c.linkedinUrl || ""}`;
  }

  async function runPreview() {
    setError(null);
    setCommitResult(null);
    setLoading(true);
    setPreview(null);
    setSelected({});
    setMarqueId(null);
    setMarqueNom(null);
    setFicheQuery("");
    setMarqueHits([]);
    setPhase("carto");
    try {
      const res = await fetch("/api/lab/carto-pipeline/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          domain: domain.trim() || undefined,
          language,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec preview");
      const result = data as CartoAiPreviewResult;
      setPreview(result);
      const next: Record<string, boolean> = {};
      result.contacts.forEach((_, i) => {
        next[String(i)] = true;
      });
      setSelected(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }

  async function runCommit() {
    if (!preview || selectedRows.length === 0) return;
    if (!marqueId || !marqueNom) {
      setError("Étape 1 : sélectionne une fiche client FR ou Benelux");
      return;
    }
    setError(null);
    setCommitting(true);
    try {
      const res = await fetch("/api/lab/carto-pipeline/commit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: marqueNom,
          marqueId,
          domain: preview.domain || domain.trim() || undefined,
          language,
          market: ficheMarket,
          selectedRows,
          skipAutoEnrich: true,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec enregistrement");
      setCommitResult(data as CommitResult);
      setPhase("enrich");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setCommitting(false);
    }
  }

  function pickMarque(m: MarqueHit) {
    setMarqueId(m.id);
    setMarqueNom(m.nom);
    setFicheQuery(m.nom);
    setMarqueHits([]);
  }

  function clearMarque() {
    setMarqueId(null);
    setMarqueNom(null);
    setFicheQuery("");
    setMarqueHits([]);
  }

  function switchFicheMarket(next: FicheMarket) {
    setFicheMarket(next);
    clearMarque();
  }

  if (status === "loading") {
    return <div className="p-8 text-sm text-gray-500">Chargement…</div>;
  }

  if (!allowed) {
    return (
      <div className="mx-auto max-w-lg py-20 text-center">
        <p className="text-lg text-red-600">Lab non disponible</p>
        <p className="mt-2 text-sm text-gray-500">
          Accès restreint (allowlist + rôle).
        </p>
      </div>
    );
  }

  if (phase === "enrich" && commitResult) {
    return (
      <div className="mx-auto max-w-5xl space-y-6 p-6">
        <div>
          <p className="text-xs uppercase tracking-wide text-amber-700">
            Lab caché · carto AI · étape 2
          </p>
          <h1 className="mt-1 text-2xl font-semibold text-gray-900">
            Enrichissement · {commitResult.company}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {commitResult.created} ajouté(s) · {commitResult.skipped} déjà
            présents · fiche{" "}
            {(commitResult.market || ficheMarket) === "BENELUX"
              ? "Benelux"
              : "France"}
            {commitResult.fichePath ? (
              <>
                {" · "}
                <Link
                  href={commitResult.fichePath}
                  className="underline hover:text-gray-800"
                >
                  ouvrir la fiche
                </Link>
              </>
            ) : null}
          </p>
        </div>

        {error && (
          <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error}
          </div>
        )}

        <BrandEnrichPanel
          marqueId={commitResult.marqueId}
          market={commitResult.market || ficheMarket}
          company={commitResult.company}
          fichePath={commitResult.fichePath}
          onBack={() => setPhase("carto")}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6">
      <div>
        <p className="text-xs uppercase tracking-wide text-amber-700">
          Lab caché · carto AI
        </p>
        <h1 className="mt-1 text-2xl font-semibold text-gray-900">
          Marque → contacts influence
        </h1>
      </div>

      <div className="space-y-3 rounded-xl border border-gray-200 bg-white p-4">
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-gray-700">Marque</span>
            <input
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="NYX"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm sm:col-span-1">
            <span className="mb-1 block text-gray-700">Domaine (optionnel)</span>
            <input
              value={domain}
              onChange={(e) => setDomain(e.target.value)}
              placeholder="nyxcosmetics.fr"
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            />
          </label>
          <label className="block text-sm">
            <span className="mb-1 block text-gray-700">Langue</span>
            <select
              value={language}
              onChange={(e) => setLanguage(e.target.value === "en" ? "en" : "fr")}
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>
        <button
          type="button"
          onClick={runPreview}
          disabled={loading || !company.trim()}
          className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
        >
          {loading ? "Recherche en cours (peut prendre 1–2 min)…" : "Générer les contacts"}
        </button>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          {CARTO_AI_MARCHES.map((marche) => {
            const items = grouped[marche];
            return (
              <div
                key={marche}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {marche === "FR" && "1 · France"}
                      {marche === "EU" && "2 · Europe"}
                      {marche === "INT" && "3 · International"}
                    </p>
                    <p className="text-xs text-gray-500">
                      {marche === "FR" && "Priorité Glow-up — chercher d’abord ici"}
                      {marche === "EU" && "Hors France (Benelux, UK, DE, ES, IT, EMEA…)"}
                      {marche === "INT" && "Hors Europe (US, global, APAC…)"}
                    </p>
                  </div>
                  <label className="flex items-center gap-2 text-xs text-gray-600">
                    <input
                      type="checkbox"
                      checked={
                        items.length > 0 &&
                        items.every(({ i }) => selected[String(i)])
                      }
                      onChange={(e) => {
                        setSelected((prev) => {
                          const next = { ...prev };
                          items.forEach(({ i }) => {
                            next[String(i)] = e.target.checked;
                          });
                          return next;
                        });
                      }}
                      disabled={items.length === 0}
                    />
                    Tout ({items.length})
                  </label>
                </div>

                {items.length === 0 ? (
                  <p className="px-4 py-6 text-center text-sm text-gray-400">
                    Aucun contact dans cette catégorie
                  </p>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-left text-sm">
                      <thead className="border-b bg-white text-xs uppercase text-gray-500">
                        <tr>
                          <th className="px-3 py-2" />
                          <th className="px-3 py-2">Prio</th>
                          <th className="px-3 py-2">Prénom</th>
                          <th className="px-3 py-2">Nom</th>
                          <th className="px-3 py-2">Ce qu&apos;ils font</th>
                          <th className="px-3 py-2">LinkedIn</th>
                        </tr>
                      </thead>
                      <tbody>
                        {items.map(({ c, i }) => (
                          <tr key={rowKey(c, i)} className="border-b last:border-0">
                            <td className="px-3 py-2">
                              <input
                                type="checkbox"
                                checked={Boolean(selected[String(i)])}
                                onChange={(e) =>
                                  setSelected((prev) => ({
                                    ...prev,
                                    [String(i)]: e.target.checked,
                                  }))
                                }
                              />
                            </td>
                            <td className="whitespace-nowrap px-3 py-2">
                              {c.priorite || "—"}
                            </td>
                            <td className="px-3 py-2">{c.prenom || "—"}</td>
                            <td className="px-3 py-2 font-medium">{c.nom}</td>
                            <td className="px-3 py-2">
                              <div>{c.poste || "—"}</div>
                              {c.perimetre && (
                                <div className="mt-0.5 text-xs text-gray-500">
                                  {c.perimetre}
                                </div>
                              )}
                              {c.note && (
                                <div className="mt-0.5 line-clamp-2 text-xs text-gray-400">
                                  {c.note}
                                </div>
                              )}
                            </td>
                            <td className="px-3 py-2">
                              {c.linkedinUrl ? (
                                <a
                                  href={c.linkedinUrl}
                                  target="_blank"
                                  rel="noreferrer"
                                  className="text-blue-600 hover:underline"
                                >
                                  Profil
                                </a>
                              ) : (
                                "—"
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            );
          })}

          <div className="space-y-4 rounded-xl border border-gray-200 bg-white p-4">
            <div className="space-y-3 border-b border-gray-100 pb-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Étape 1 · Fiche client
                </p>
                <p className="mt-0.5 text-sm text-gray-900">
                  Choisis la fiche {selectedRows.length} contact
                  {selectedRows.length > 1 ? "s" : ""} sélectionné
                  {selectedRows.length > 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => switchFicheMarket("FR")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    ficheMarket === "FR"
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Fiche France
                </button>
                <button
                  type="button"
                  onClick={() => switchFicheMarket("BENELUX")}
                  className={`rounded-lg px-3 py-1.5 text-sm font-medium ${
                    ficheMarket === "BENELUX"
                      ? "bg-gray-900 text-white"
                      : "border border-gray-300 text-gray-700 hover:bg-gray-50"
                  }`}
                >
                  Fiche Benelux
                </button>
              </div>
              <label className="relative block max-w-md text-sm">
                <span className="mb-1 block text-gray-700">
                  Rechercher une fiche{" "}
                  {ficheMarket === "BENELUX" ? "Benelux" : "France"}
                </span>
                <input
                  value={ficheQuery}
                  onChange={(e) => {
                    setFicheQuery(e.target.value);
                    setMarqueId(null);
                    setMarqueNom(null);
                  }}
                  placeholder={preview.company || "Rechercher une fiche…"}
                  className="w-full rounded-lg border border-gray-300 px-3 py-2"
                  autoComplete="off"
                />
                {marqueHits.length > 0 && !marqueId && (
                  <ul className="absolute z-20 mt-1 max-h-48 w-full overflow-auto rounded-lg border border-gray-200 bg-white shadow-lg">
                    {marqueHits.slice(0, 8).map((m) => (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => pickMarque(m)}
                          className="flex w-full items-center justify-between px-3 py-2 text-left text-sm hover:bg-gray-50"
                        >
                          <span className="font-medium text-gray-900">
                            {m.nom}
                          </span>
                          <span className="text-xs text-gray-400">
                            {ficheMarket === "BENELUX" ? "Benelux" : "FR"}
                            {typeof m.contactCount === "number"
                              ? ` · ${m.contactCount}`
                              : ""}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
                {marqueId && marqueNom ? (
                  <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-emerald-700">
                    Fiche {ficheMarket === "BENELUX" ? "Benelux" : "France"} :{" "}
                    {marqueNom}
                    <button
                      type="button"
                      onClick={clearMarque}
                      className="underline"
                    >
                      changer
                    </button>
                  </p>
                ) : (
                  <p className="mt-1 text-xs text-gray-500">
                    Sélectionne une fiche existante pour passer à
                    l&apos;enrichissement
                  </p>
                )}
              </label>
            </div>

            <div className="space-y-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  Étape 2 · Enrichissement
                </p>
                <p className="mt-0.5 text-sm text-gray-900">
                  Enregistre sur la fiche puis enrichis ici (emails, FR/BE,
                  langue FR/EN par contact)
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={runCommit}
                  disabled={
                    committing || selectedRows.length === 0 || !marqueId
                  }
                  className="rounded-lg bg-emerald-700 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {committing
                    ? "Enregistrement…"
                    : `Passer à l'enrichissement (${selectedRows.length})`}
                </button>
                <span className="text-xs text-gray-500">
                  {marqueId
                    ? `→ ${marqueNom} · ${ficheMarket === "BENELUX" ? "Benelux" : "France"}`
                    : "Sélectionne d’abord une fiche (étape 1)"}
                </span>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
