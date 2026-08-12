"use client";

import { useMemo, useState } from "react";
import { AlertTriangle } from "lucide-react";
import {
  LICENSE_DURATION_OPTIONS,
  REUSE_RIGHTS_OPTIONS,
  SECTOR_EXCLUSIVITY_OPTIONS,
  WHITELISTING_OPTIONS,
  type LicenseDurationId,
  type ReuseRightsId,
  type SectorExclusivityId,
  type WhitelistingId,
} from "@/lib/pricing-rights.config";
import {
  SNAPCHAT_MARKET_NOTE,
  SNAPCHAT_VIEWS_HINT,
  STORY_CPM,
  SPOTLIGHT_CPM,
  computeSnapchatPackage,
  formatSnapchatMoney,
  type RightsOptions,
  type SpotlightProduction,
} from "@/lib/snapchat-pricing";
import { CessionsConfidentialNote } from "./CessionsConfidentialNote";
import { SnapchatLogo } from "./UgcSimulatorPanel";

const inputCls =
  "w-full rounded-xl border border-gray-200/80 bg-white px-3 py-2.5 text-sm text-glowup-licorice outline-none transition focus:border-glowup-rose/40 focus:ring-2 focus:ring-glowup-rose/15";

type Props = {
  talentLabel?: string | null;
};

export function SnapchatSimulatorPanel({ talentLabel }: Props) {
  const [includeStory, setIncludeStory] = useState(true);
  const [includeSpotlight, setIncludeSpotlight] = useState(false);

  const [viewersMoyens, setViewersMoyens] = useState<number | null>(null);
  const [snapsCount, setSnapsCount] = useState<number | null>(3);
  const [completionRate, setCompletionRate] = useState<number | null>(null);

  const [vuesMoyennes, setVuesMoyennes] = useState<number | null>(null);
  const [durationSeconds, setDurationSeconds] = useState<number | null>(30);
  const [production, setProduction] =
    useState<SpotlightProduction>("simple");

  const [reuseRights, setReuseRights] = useState<ReuseRightsId>("none");
  const [licenseDuration, setLicenseDuration] =
    useState<LicenseDurationId>("m1");
  const [whitelisting, setWhitelisting] = useState<WhitelistingId>("none");
  const [sectorExclusivity, setSectorExclusivity] =
    useState<SectorExclusivityId>("none");
  const [linkAttachment, setLinkAttachment] = useState(false);
  const [savedStory, setSavedStory] = useState(false);
  const [spotlightRetention, setSpotlightRetention] = useState(false);
  const [rush72h, setRush72h] = useState(false);
  const [strictBrief, setStrictBrief] = useState(false);
  const [mediaBudget, setMediaBudget] = useState<number | null>(null);
  const [isLinkEligible, setIsLinkEligible] = useState(true);

  const rights: RightsOptions = useMemo(
    () => ({
      reuseRights,
      licenseDuration,
      whitelisting,
      sectorExclusivity,
      linkAttachment,
      savedStory,
      spotlightRetention,
      rush72h,
      strictBrief,
      mediaBudget,
      creator: { isLinkEligible },
    }),
    [
      reuseRights,
      licenseDuration,
      whitelisting,
      sectorExclusivity,
      linkAttachment,
      savedStory,
      spotlightRetention,
      rush72h,
      strictBrief,
      mediaBudget,
      isLinkEligible,
    ]
  );

  const result = useMemo(
    () =>
      computeSnapchatPackage({
        includeStory,
        includeSpotlight,
        story:
          includeStory && viewersMoyens != null && snapsCount != null
            ? {
                viewersMoyens,
                snapsCount,
                completionRate,
              }
            : null,
        spotlight:
          includeSpotlight &&
          vuesMoyennes != null &&
          durationSeconds != null
            ? {
                vuesMoyennes,
                durationSeconds,
                production,
              }
            : null,
        rights,
      }),
    [
      includeStory,
      includeSpotlight,
      viewersMoyens,
      snapsCount,
      completionRate,
      vuesMoyennes,
      durationSeconds,
      production,
      rights,
    ]
  );

  const storyReady =
    includeStory && viewersMoyens != null && snapsCount != null && snapsCount > 0;
  const spotlightReady =
    includeSpotlight &&
    vuesMoyennes != null &&
    durationSeconds != null &&
    durationSeconds > 0;
  const canShow =
    (includeStory && storyReady) || (includeSpotlight && spotlightReady);

  const quote = result.quote;
  const configBlocked =
    quote != null &&
    quote.upliftBreakdown.length === 0 &&
    quote.total === 0 &&
    quote.warnings.some(
      (w) =>
        /exige|indisponible|whitelist|licence|linkattachment|reuseRights/i.test(
          w
        )
    );

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
        <div className="flex items-start gap-3">
          <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[#FFFC00] text-black shadow-sm">
            <SnapchatLogo className="h-5 w-5" />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-semibold text-glowup-licorice">
              Publication Snapchat
            </h2>
            <div className="mt-1">
              <CessionsConfidentialNote compact />
            </div>
            <p className="mt-2 text-xs text-gray-500">
              Étape 1 = organique (CPM). Étape 2 = droits en uplift additif.
              {talentLabel ? (
                <>
                  {" "}
                  Talent :{" "}
                  <span className="font-medium text-glowup-licorice">
                    {talentLabel}
                  </span>
                  .
                </>
              ) : null}
            </p>
            <p className="mt-2 text-[11px] leading-snug text-gray-400">
              {SNAPCHAT_MARKET_NOTE}
            </p>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => setIncludeStory((v) => !v)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              includeStory
                ? "bg-glowup-licorice text-white"
                : "border border-gray-200 bg-white text-glowup-licorice hover:border-glowup-rose/40"
            }`}
          >
            Story Snapchat
          </button>
          <button
            type="button"
            onClick={() => setIncludeSpotlight((v) => !v)}
            className={`rounded-xl px-4 py-2 text-sm font-semibold transition ${
              includeSpotlight
                ? "bg-glowup-licorice text-white"
                : "border border-gray-200 bg-white text-glowup-licorice hover:border-glowup-rose/40"
            }`}
          >
            Spotlight Snapchat
          </button>
        </div>
      </section>

      {includeStory && (
        <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
          <h3 className="text-sm font-semibold text-glowup-licorice">
            Story Snapchat — organique
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            Viewers uniques moyens du premier Snap. Ne jamais additionner les
            vues de toutes les séquences.
          </p>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Viewers moyens
              </label>
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="ex. 10000"
                value={viewersMoyens ?? ""}
                onChange={(e) =>
                  setViewersMoyens(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                {SNAPCHAT_VIEWS_HINT}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Nombre de Snaps
              </label>
              <input
                className={inputCls}
                type="number"
                min={1}
                max={20}
                value={snapsCount ?? ""}
                onChange={(e) =>
                  setSnapsCount(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Complétion % (facultatif)
              </label>
              <input
                className={inputCls}
                type="number"
                min={0}
                max={100}
                step={0.1}
                placeholder="—"
                value={completionRate ?? ""}
                onChange={(e) =>
                  setCompletionRate(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
            </div>
          </div>
          {result.story && storyReady && (
            <PriceCard title="Story" cpm={STORY_CPM} detail={result.story} />
          )}
        </section>
      )}

      {includeSpotlight && (
        <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
          <h3 className="text-sm font-semibold text-glowup-licorice">
            Spotlight Snapchat — organique
          </h3>
          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Vues / viewers moyens
              </label>
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="ex. 100000"
                value={vuesMoyennes ?? ""}
                onChange={(e) =>
                  setVuesMoyennes(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
              <p className="mt-1.5 text-[11px] leading-snug text-gray-500">
                {SNAPCHAT_VIEWS_HINT}
              </p>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Durée (secondes)
              </label>
              <input
                className={inputCls}
                type="number"
                min={1}
                value={durationSeconds ?? ""}
                onChange={(e) =>
                  setDurationSeconds(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Production
              </label>
              <select
                className={inputCls}
                value={production}
                onChange={(e) =>
                  setProduction(e.target.value as SpotlightProduction)
                }
              >
                <option value="simple">Simple</option>
                <option value="premium">Premium / multi-scènes (+20 %)</option>
              </select>
            </div>
          </div>
          {result.spotlight && spotlightReady && (
            <PriceCard
              title="Spotlight"
              cpm={SPOTLIGHT_CPM}
              detail={result.spotlight}
            />
          )}
        </section>
      )}

      {canShow && (
        <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
          <h3 className="text-sm font-semibold text-glowup-licorice">
            Droits & options — uplift additif
          </h3>
          <p className="mt-1 text-xs text-gray-500">
            total = base × (1 + somme des uplifts). Aucune composition
            multiplicative. Le CPM n&apos;est pas modifié.
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Réutilisation
              </label>
              <select
                className={inputCls}
                value={reuseRights}
                onChange={(e) =>
                  setReuseRights(e.target.value as ReuseRightsId)
                }
              >
                {REUSE_RIGHTS_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Durée licence
              </label>
              <select
                className={inputCls}
                value={licenseDuration}
                onChange={(e) =>
                  setLicenseDuration(e.target.value as LicenseDurationId)
                }
              >
                {LICENSE_DURATION_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Whitelisting
              </label>
              <select
                className={inputCls}
                value={whitelisting}
                onChange={(e) =>
                  setWhitelisting(e.target.value as WhitelistingId)
                }
              >
                {WHITELISTING_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Exclu secteur
              </label>
              <select
                className={inputCls}
                value={sectorExclusivity}
                onChange={(e) =>
                  setSectorExclusivity(e.target.value as SectorExclusivityId)
                }
              >
                {SECTOR_EXCLUSIVITY_OPTIONS.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
                Budget média € (whitelist)
              </label>
              <input
                className={inputCls}
                type="number"
                min={0}
                placeholder="optionnel"
                value={mediaBudget ?? ""}
                onChange={(e) =>
                  setMediaBudget(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
              <p className="mt-1 text-[11px] text-gray-500">
                Si renseigné : max(uplift WL, 12 % du budget).
              </p>
            </div>
            <div className="flex flex-wrap content-end gap-3 pb-1">
              {(
                [
                  ["linkAttachment", linkAttachment, setLinkAttachment, "Lien +10 %"],
                  ["savedStory", savedStory, setSavedStory, "Story sauvée +15 %"],
                  [
                    "spotlightRetention",
                    spotlightRetention,
                    setSpotlightRetention,
                    "Rétention Spotlight +10 %",
                  ],
                  ["rush72h", rush72h, setRush72h, "Rush 72 h +20 %"],
                  ["strictBrief", strictBrief, setStrictBrief, "Brief strict +15 %"],
                  [
                    "isLinkEligible",
                    isLinkEligible,
                    setIsLinkEligible,
                    "Créateur éligible lien",
                  ],
                ] as const
              ).map(([key, val, set, label]) => (
                <label
                  key={key}
                  className="inline-flex items-center gap-2 text-xs text-glowup-licorice"
                >
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => set(e.target.checked)}
                    className="rounded border-gray-300 text-glowup-rose focus:ring-glowup-rose"
                  />
                  {label}
                </label>
              ))}
            </div>
          </div>

          {configBlocked && quote && (
            <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
              <p className="font-semibold">Configuration invalide — non chiffré</p>
              {quote.warnings.map((e) => (
                <p key={e}>{e}</p>
              ))}
            </div>
          )}
        </section>
      )}

      {canShow && quote && !configBlocked && (
        <section className="overflow-hidden rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-[#1a0a0a] p-6 text-white shadow-[0_30px_80px_-40px_rgba(34,1,1,0.65)]">
          <p className="text-[10px] font-bold uppercase tracking-[0.14em] text-red-300">
            Confidentiel · Devis Snapchat HT
          </p>

          <div className="mt-4 grid gap-3 sm:grid-cols-3">
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                Base organique
              </p>
              <p className="text-xl font-bold tabular-nums text-white/80">
                {formatSnapchatMoney(
                  quote.base > 0
                    ? quote.base
                    : quote.indicativeTotal != null && quote.upliftSum >= 0
                      ? quote.subtotal / (1 + quote.upliftSum)
                      : null
                )}
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                Somme uplifts
              </p>
              <p className="text-xl font-bold tabular-nums text-white/80">
                +{(quote.upliftSum * 100).toFixed(0)} %
              </p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                Statut
              </p>
              <p
                className={`text-xl font-bold ${
                  quote.status === "OK" ? "text-emerald-300" : "text-amber-200"
                }`}
              >
                {quote.status}
              </p>
            </div>
          </div>

          {quote.upliftBreakdown.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
              <table className="w-full text-left text-xs">
                <thead className="bg-white/5 text-[10px] uppercase tracking-[0.12em] text-white/40">
                  <tr>
                    <th className="px-3 py-2 font-medium">Ligne</th>
                    <th className="px-3 py-2 font-medium">Taux</th>
                    <th className="px-3 py-2 font-medium text-right">Montant</th>
                  </tr>
                </thead>
                <tbody>
                  {quote.upliftBreakdown.map((l) => (
                    <tr key={l.label} className="border-t border-white/10">
                      <td className="px-3 py-2 text-white/80">{l.label}</td>
                      <td className="px-3 py-2 tabular-nums text-white/60">
                        +{(l.rate * 100).toFixed(0)} %
                      </td>
                      <td className="px-3 py-2 text-right tabular-nums text-white/80">
                        {formatSnapchatMoney(l.amount)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {quote.status === "SUR_DEVIS" ? (
            <div className="mt-4 flex items-start gap-2">
              <AlertTriangle className="mt-1 h-5 w-5 shrink-0 text-amber-300" />
              <div>
                <p className="text-2xl font-bold text-amber-100">SUR_DEVIS</p>
                {quote.indicativeTotal != null && (
                  <p className="mt-1 text-sm text-white/60">
                    Indicatif : {formatSnapchatMoney(quote.indicativeTotal)}
                  </p>
                )}
                <ul className="mt-2 list-disc space-y-0.5 pl-4 text-xs text-white/50">
                  {quote.warnings.map((w) => (
                    <li key={w}>{w}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <div className="mt-4 grid gap-4 sm:grid-cols-2">
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                  Sous-total exact
                </p>
                <p className="text-2xl font-bold tabular-nums text-white/80">
                  {formatSnapchatMoney(quote.total)}
                </p>
              </div>
              <div>
                <p className="text-[10px] uppercase tracking-[0.12em] text-white/40">
                  Prix commercial
                </p>
                <p className="text-3xl font-bold tabular-nums text-glowup-rose-light">
                  {formatSnapchatMoney(quote.totalCommercial)}{" "}
                  <span className="text-sm font-medium text-white/50">HT</span>
                </p>
              </div>
            </div>
          )}

          <p className="mt-5 max-w-2xl text-[11px] leading-relaxed text-white/40">
            {result.disclaimer}
          </p>

          {quote.status === "OK" && (
            <button
              type="button"
              className="mt-4 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-glowup-licorice transition hover:bg-glowup-lace"
              onClick={() => {
                const lines = quote.upliftBreakdown
                  .map(
                    (l) =>
                      `- ${l.label} : +${(l.rate * 100).toFixed(0)} % = ${formatSnapchatMoney(l.amount)}`
                  )
                  .join("\n");
                void navigator.clipboard?.writeText(
                  `[CONFIDENTIEL — Glow Up]\nSnapchat HT\nBase : ${formatSnapchatMoney(quote.base)}\n${lines}\nTotal commercial : ${formatSnapchatMoney(quote.totalCommercial)}`
                );
              }}
            >
              Copier le devis
            </button>
          )}
        </section>
      )}
    </div>
  );
}

function PriceCard({
  title,
  cpm,
  detail,
}: {
  title: string;
  cpm: number;
  detail: {
    price: {
      status: "OK" | "SUR_DEVIS";
      exact: number | null;
      commercial: number | null;
      reason?: string;
    };
    multipliers: { label: string; value: string }[];
    volumeWarning?: boolean;
    indicativeExact?: number | null;
  };
}) {
  return (
    <div className="mt-4 rounded-xl border border-gray-100 bg-glowup-lace/30 p-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-gray-500">
            {title} · CPM {cpm} € (étage 1)
          </p>
          {detail.price.status === "SUR_DEVIS" ? (
            <div className="mt-1">
              <p className="text-lg font-bold text-amber-700">SUR_DEVIS</p>
              {detail.indicativeExact != null && (
                <p className="mt-0.5 text-xs text-amber-800/80">
                  Formule indicative :{" "}
                  {formatSnapchatMoney(detail.indicativeExact)}
                </p>
              )}
            </div>
          ) : (
            <div className="mt-1 flex flex-wrap items-baseline gap-4">
              <div>
                <span className="text-[10px] uppercase text-gray-400">Exact</span>
                <p className="text-sm font-semibold tabular-nums text-glowup-licorice">
                  {formatSnapchatMoney(detail.price.exact)}
                </p>
              </div>
              <div>
                <span className="text-[10px] uppercase text-gray-400">
                  Commercial
                </span>
                <p className="text-lg font-bold tabular-nums text-glowup-licorice">
                  {formatSnapchatMoney(detail.price.commercial)}
                </p>
              </div>
            </div>
          )}
        </div>
        <div className="flex flex-wrap gap-2">
          {detail.multipliers.map((m) => (
            <span
              key={m.label}
              className="rounded-lg border border-gray-200 bg-white px-2.5 py-1 text-[11px] text-gray-600"
            >
              <span className="font-medium text-glowup-licorice">{m.label}</span>{" "}
              {m.value}
            </span>
          ))}
        </div>
      </div>
      {detail.volumeWarning && detail.price.status === "OK" && (
        <p className="mt-2 text-xs text-amber-700">
          Volume élevé — confirmer la moyenne habituelle.
        </p>
      )}
      {detail.price.status === "SUR_DEVIS" && detail.price.reason && (
        <p className="mt-2 text-xs text-amber-700">{detail.price.reason}</p>
      )}
    </div>
  );
}
