"use client";

/**
 * Même UI que /lab/carto-pipeline.
 * Moteur : Chat VPS (invisible) — scrap 22:03 non touché.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSession } from "next-auth/react";
import { canAccessCartoAiPipeline } from "@/lib/carto-ai/constants";
import type { CartoAiContactCandidate } from "@/lib/carto-ai/types";
import type { CartoChatVpsPreviewResult } from "@/lib/carto-chat-vps/types";
import { BrandEnrichPanel } from "@/components/enrichissement/BrandEnrichPanel";

type ContactCouche = "marque" | "agence" | "autre";
type FicheMarket = "FR" | "BENELUX";

const DEFAULT_CHAT_PROMPT =
  "qui gère l'influence chez {marque} en france en interne et si il y a une agence ? Donne tout les noms qui gère l'influence chez {marque}. Trie par ceux qui gère les castings influences de la marque. Met le linkedin réelle de chacun de leurs profils.";
// Le jeton de fin GLOWUP_CART_DONE_9f3k2x est ajouté automatiquement (buildUserChatPrompt).

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

export default function CartoAiPipelineChatLabPage() {
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
  const [loadingHint, setLoadingHint] = useState<string | null>(null);
  const [committing, setCommitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState<CartoChatVpsPreviewResult | null>(
    null
  );
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
  const primaryAgency =
    preview?.agencies?.find((a) => a.primary)?.name ||
    preview?.agencies?.[0]?.name ||
    null;

  function contactCouche(c: CartoAiContactCandidate): ContactCouche {
    const p = (c.perimetre || "").toLowerCase();
    const autre = p.match(/autre\s*agence\s*(.*)/i);
    if (autre) {
      const name = (autre[1] || "").trim();
      // Une seule agence citée / = primary → colonne Agence, pas "Autres"
      if (
        !primaryAgency ||
        !name ||
        name.includes(primaryAgency.toLowerCase().slice(0, 4)) ||
        primaryAgency.toLowerCase().includes(name.slice(0, 4))
      ) {
        return "agence";
      }
      return "autre";
    }
    if (primaryAgency && p.includes(primaryAgency.toLowerCase())) {
      return "agence";
    }
    if (/^agence\b|\bagence\b/.test(p)) return "agence";
    return "marque";
  }

  const grouped = useMemo(() => {
    const map: Record<
      ContactCouche,
      Array<{ c: CartoAiContactCandidate; i: number }>
    > = { marque: [], agence: [], autre: [] };
    rows.forEach((c, i) => {
      map[contactCouche(c)].push({ c, i });
    });
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rows, primaryAgency]);

  const selectedRows = useMemo(
    () => rows.filter((_, i) => selected[String(i)]),
    [rows, selected]
  );

  function rowKey(c: CartoAiContactCandidate, i: number): string {
    return `${i}:${c.marche}:${c.prenom || ""}:${c.nom}:${c.linkedinUrl || ""}`;
  }

  function applyPreview(result: CartoChatVpsPreviewResult) {
    setPreview(result);
    const next: Record<string, boolean> = {};
    result.contacts.forEach((_, i) => {
      next[String(i)] = true;
    });
    setSelected(next);
  }

  async function runPreview() {
    setError(null);
    setCommitResult(null);
    setLoading(true);
    setLoadingHint("Analyse en cours");
    setPreview(null);
    setSelected({});
    setMarqueId(null);
    setMarqueNom(null);
    setFicheQuery("");
    setMarqueHits([]);
    setPhase("carto");
    try {
      const chatPrompt = DEFAULT_CHAT_PROMPT.replaceAll(
        "{marque}",
        company.trim()
      );

      // 1) Lance Chat en async (réponse HTTP immédiate — plus de cutoff navigateur)
      const startRes = await fetch("/api/lab/carto-pipeline2/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          domain: domain.trim() || undefined,
          language,
          mode: "vps_start",
          chatPrompt,
        }),
      });
      const startData = (await startRes.json().catch(() => ({}))) as {
        error?: string;
        startedAt?: number;
        promptPreview?: string;
        company?: string;
      };
      if (!startRes.ok && startRes.status !== 202) {
        throw new Error(startData.error || "Impossible de lancer Chat");
      }

      // 2) Poll : job done OU texte stable → structure immédiate → affichage
      const deadline = Date.now() + 12 * 60_000;
      const ourStartedAt = Number(startData.startedAt || Date.now());
      const pollStarted = Date.now();
      let sawRunning = false;
      let sawGrowth = false;
      let lastChars = 0;
      let peakChars = 0;
      let charsStableSince = Date.now();

      const tryStructure = async (): Promise<boolean> => {
        const rescue = await fetch("/api/lab/carto-pipeline2/preview", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: company.trim(),
            domain: domain.trim() || undefined,
            language,
            mode: "read_screen",
          }),
        });
        const data = await rescue.json().catch(() => ({}));
        if (!rescue.ok) {
          const err = (data as { error?: string }).error || "";
          // Mauvaise marque encore à l'écran → on continue d'attendre
          if (/autre marque|ne mentionne pas|relance/i.test(err)) {
            return false;
          }
          throw new Error(err || "Échec analyse");
        }
        const result = data as CartoChatVpsPreviewResult;
        if (!result.contacts?.length) {
          return false;
        }
        applyPreview(result);
        return true;
      };

      while (Date.now() < deadline) {
        await new Promise((r) => setTimeout(r, 2000));
        const hRes = await fetch("/api/lab/carto-pipeline2/health", {
          cache: "no-store",
        });
        const h = (await hRes.json().catch(() => ({}))) as {
          busy?: boolean;
          lastAnswerChars?: number;
          job?: {
            state?: string;
            error?: string | null;
            answerChars?: number;
            startedAt?: number;
            promptPreview?: string;
          };
          error?: string;
        };

        const jobState = h.job?.state || (h.busy ? "running" : "idle");
        const jobIsOurs =
          Number(h.job?.startedAt || 0) === ourStartedAt ||
          (Number(h.job?.startedAt || 0) >= ourStartedAt - 2_000 &&
            (h.job?.promptPreview || "")
              .toLowerCase()
              .includes(company.trim().toLowerCase().slice(0, 12)));

        if ((jobState === "running" || h.busy) && jobIsOurs) {
          sawRunning = true;
        }

        if (jobState === "error" && jobIsOurs) {
          // Même en erreur worker : tente l'écran (souvent déjà fini)
          if (await tryStructure()) return;
          throw new Error(h.job?.error || "Erreur Chat VPS");
        }

        const chars = Math.max(
          Number(h.job?.answerChars || 0),
          Number(h.lastAnswerChars || 0)
        );
        if (chars > peakChars + 60) {
          peakChars = chars;
          sawGrowth = true;
          charsStableSince = Date.now();
        }
        if (Math.abs(chars - lastChars) > 60) {
          lastChars = chars;
          charsStableSince = Date.now();
        } else {
          lastChars = chars;
        }

        const stableMs = Date.now() - charsStableSince;
        const elapsed = Date.now() - pollStarted;

        // A) Worker a capturé → affiche tout de suite
        if (sawRunning && jobState === "done" && jobIsOurs) {
          if (await tryStructure()) return;
        }

        // B) Texte a grandi puis stable ~15s + assez long (pas juste l'intro Searching)
        const screenDone =
          sawRunning &&
          sawGrowth &&
          chars >= 1500 &&
          stableMs >= 15_000 &&
          elapsed >= 50_000;
        if (screenDone) {
          if (await tryStructure()) return;
        }
      }

      // Dernière chance
      if (await tryStructure()) return;
      throw new Error("Timeout: pas de contacts — réessaie Analyse");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
      setLoadingHint(null);
    }
  }

  /** Structure la réponse déjà affichée dans Chrome VPS (sans renvoyer). */
  async function runReadScreen() {
    setError(null);
    setLoading(true);
    setLoadingHint("Analyse en cours");
    try {
      const res = await fetch("/api/lab/carto-pipeline2/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company: company.trim(),
          domain: domain.trim() || undefined,
          language,
          mode: "read_screen",
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Échec lecture écran");
      applyPreview(data as CartoChatVpsPreviewResult);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
      setLoadingHint(null);
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
              onChange={(e) => {
                setCompany(e.target.value);
                if (domain.trim()) setDomain("");
              }}
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
              onChange={(e) =>
                setLanguage(e.target.value === "en" ? "en" : "fr")
              }
              className="w-full rounded-lg border border-gray-300 px-3 py-2"
            >
              <option value="fr">FR</option>
              <option value="en">EN</option>
            </select>
          </label>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={runPreview}
            disabled={loading || !company.trim()}
            className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
          >
            {loading ? loadingHint || "Analyse en cours" : "Analyse"}
          </button>
          <button
            type="button"
            onClick={runReadScreen}
            disabled={loading || !company.trim()}
            className="rounded-lg border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-800 disabled:opacity-50"
            title="Si la réponse est déjà à l’écran sur le VPS"
          >
            Analyser l’écran
          </button>
        </div>
      </div>

      {error && (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      {preview && (
        <div className="space-y-4">
          {(
            [
              {
                key: "marque" as const,
                title: "1 · Marque (direct)",
                sub: "Contacts internes / groupe",
              },
              {
                key: "agence" as const,
                title: primaryAgency
                  ? `2 · Agence · ${primaryAgency}`
                  : "2 · Agence",
                sub: "Mandat influence / RP",
              },
              {
                key: "autre" as const,
                title: "3 · Autres partenaires",
                sub: "One-shot / mandat annexe",
              },
            ] as const
          ).map(({ key, title, sub }) => {
            const items = grouped[key];
            return (
              <div
                key={key}
                className="overflow-hidden rounded-xl border border-gray-200 bg-white"
              >
                <div className="flex items-center justify-between border-b bg-gray-50 px-4 py-2.5">
                  <div>
                    <p className="text-sm font-semibold text-gray-900">
                      {title}
                    </p>
                    <p className="text-xs text-gray-500">{sub}</p>
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
                          <tr
                            key={rowKey(c, i)}
                            className="border-b last:border-0"
                          >
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
