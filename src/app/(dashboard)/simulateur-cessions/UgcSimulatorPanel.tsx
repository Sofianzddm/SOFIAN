"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import {
  CPM_BENCHMARKS_GLOWUP,
  CPM_BENCHMARK_HINT,
  formatCessionMoney,
} from "@/lib/cessions";
import {
  SIM_DEAL_MODES,
  UGC_AUDIENCE_PLATFORMS,
  UGC_EXCLUSIVITES,
  UGC_FORMATS,
  UGC_MODIFS,
  UGC_OPTION_RATES,
  UGC_TERRITOIRES,
  UGC_USAGE_CATALOG,
  UGC_USAGE_GROUPS,
  computeUgc,
  formatUgcMoney,
  resolveUgcAudienceForPlatform,
  resolveUgcProduction,
  ugcPriceFromNetCreator,
  ugcUsageById,
  type SimDealMode,
  type UgcAudiencePlatform,
  type UgcExcluId,
  type UgcFormatId,
  type UgcMediaBudgetMode,
  type UgcModifId,
  type UgcRateSource,
  type UgcTerritoireId,
  type UgcUsageDureeId,
  type UgcUsageId,
  type UgcUsageLineInput,
} from "@/lib/ugc-cessions";
import { numOrNull, type TalentEmvSource } from "@/lib/emv-simulator";
import { CessionsConfidentialNote } from "./CessionsConfidentialNote";

const inputCls =
  "w-full rounded-xl border border-gray-200/80 bg-white px-3 py-2.5 text-sm text-glowup-licorice outline-none transition focus:border-glowup-rose/40 focus:ring-2 focus:ring-glowup-rose/15";

function formatFollowers(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return new Intl.NumberFormat("fr-FR").format(Math.round(n));
}

type LineState = {
  enabled: boolean;
  dureeId: UgcUsageDureeId;
  territoire: UgcTerritoireId;
  buyoutZone: "fr" | "monde";
  budgetMode: UgcMediaBudgetMode;
  budgetAds: number | null;
  reachUnique: number | null;
  frequence: number | null;
  cpm: number | null;
  nbPointsDeVente: number | null;
  enseignes: string;
  meta: Record<string, string>;
};

function defaultLine(usageId: UgcUsageId): LineState {
  const def = ugcUsageById(usageId)!;
  const meta: Record<string, string> = {};
  for (const f of def.requiredFields ?? []) meta[f] = "";
  return {
    enabled: false,
    dureeId: def.durees[0].dureeId,
    territoire: "fr",
    buyoutZone: "fr",
    budgetMode: "contractuel",
    budgetAds: null,
    reachUnique: null,
    frequence: null,
    cpm: null,
    nbPointsDeVente: null,
    enseignes: "",
    meta,
  };
}

type Props = {
  talent: TalentEmvSource | null;
  influenceCachet?: number | null;
};

export function UgcSimulatorPanel({ talent, influenceCachet }: Props) {
  const talentUgcRate = numOrNull(talent?.tarifs?.ugcBaseRate);

  const [formatId, setFormatId] = useState<UgcFormatId>("video_standard");
  /** Mode de tarification production */
  const [rateSource, setRateSource] = useState<UgcRateSource>(() =>
    talentUgcRate != null ? "talent_custom" : "audience_auto"
  );
  const [manualProduction, setManualProduction] = useState<number | null>(null);
  const [audiencePlatform, setAudiencePlatform] =
    useState<UgcAudiencePlatform>("max");
  const [manualFollowers, setManualFollowers] = useState<number | null>(null);
  const [noAudience, setNoAudience] = useState(false);
  const [platformLockedByWhitelist, setPlatformLockedByWhitelist] =
    useState(false);

  const [hooks, setHooks] = useState(0);
  const [ctas, setCtas] = useState(0);
  const [conceptScript, setConceptScript] = useState(false);
  const [rushes, setRushes] = useState(false);
  const [revisions, setRevisions] = useState(0);
  const [urgent, setUrgent] = useState(false);
  const [declinations, setDeclinations] = useState(0);
  const [multiLieu, setMultiLieu] = useState<number | null>(null);
  const [fraisAccessoires, setFraisAccessoires] = useState<number | null>(null);
  const [fraisDeplacement, setFraisDeplacement] = useState<number | null>(null);

  const [lines, setLines] = useState<Record<string, LineState>>(() => {
    const init: Record<string, LineState> = {};
    for (const u of UGC_USAGE_CATALOG) init[u.id] = defaultLine(u.id);
    return init;
  });
  const [showAdvanced, setShowAdvanced] = useState(false);

  const [exclu, setExclu] = useState<UgcExcluId>("aucune");
  const [modif, setModif] = useState<UgcModifId>("inclus");
  const [manualAmount, setManualAmount] = useState<number | null>(null);
  const [netSouhaite, setNetSouhaite] = useState<number | null>(null);

  const talentAudiences = useMemo(
    () => ({
      instagram: numOrNull(talent?.stats?.igFollowers),
      tiktok: numOrNull(talent?.stats?.ttFollowers),
      youtube: numOrNull(talent?.stats?.ytAbonnes),
    }),
    [talent]
  );

  const whitelistEnabled = Boolean(lines.whitelisting?.enabled);

  // Défaut plateforme : WL → Instagram (compte ads) ; sinon max
  useEffect(() => {
    if (whitelistEnabled) {
      setAudiencePlatform((prev) =>
        prev === "max" ? "instagram" : prev
      );
      setPlatformLockedByWhitelist(true);
    } else {
      setPlatformLockedByWhitelist(false);
    }
  }, [whitelistEnabled]);

  // Talent changé → reset source
  useEffect(() => {
    if (talent) {
      setNoAudience(false);
      setManualFollowers(null);
      if (talentUgcRate != null) {
        setRateSource("talent_custom");
        setManualProduction(null);
      } else {
        setRateSource("audience_auto");
        setManualProduction(null);
      }
      if (!whitelistEnabled) setAudiencePlatform("max");
    } else {
      setRateSource("audience_auto");
      setManualProduction(null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talent?.id, talentUgcRate]);

  const resolvedAudience = useMemo(() => {
    if (noAudience) {
      return {
        followers: 0,
        platformUsed: "max" as UgcAudiencePlatform,
        platformLabel: "Sans audience",
      };
    }
    if (talent) {
      return resolveUgcAudienceForPlatform(talentAudiences, audiencePlatform);
    }
    return {
      followers: manualFollowers,
      platformUsed: audiencePlatform,
      platformLabel:
        UGC_AUDIENCE_PLATFORMS.find((p) => p.id === audiencePlatform)?.label ??
        "Audience",
    };
  }, [
    noAudience,
    talent,
    talentAudiences,
    audiencePlatform,
    manualFollowers,
  ]);

  const previewProduction = useMemo(
    () =>
      resolveUgcProduction({
        formatId,
        followers: resolvedAudience.followers,
        manualProduction:
          rateSource === "manual" ? manualProduction : null,
        talentUgcBaseRate:
          rateSource === "talent_custom" ? talentUgcRate : null,
        noAudience,
      }),
    [
      formatId,
      resolvedAudience.followers,
      rateSource,
      manualProduction,
      talentUgcRate,
      noAudience,
    ]
  );

  function patchLine(usageId: string, patch: Partial<LineState>) {
    setLines((prev) => ({
      ...prev,
      [usageId]: { ...prev[usageId], ...patch },
    }));
  }

  const usageLines: UgcUsageLineInput[] = useMemo(() => {
    return UGC_USAGE_CATALOG.map((u) => {
      const s = lines[u.id] ?? defaultLine(u.id);
      return {
        id: u.id,
        usageId: u.id,
        enabled: s.enabled,
        dureeId: s.dureeId,
        territoire: s.territoire,
        buyoutZone: s.buyoutZone,
        budgetMode: s.budgetMode,
        budgetAds: s.budgetAds,
        reachUnique: s.reachUnique,
        frequence: s.frequence,
        cpm: s.cpm,
        nbPointsDeVente: s.nbPointsDeVente,
        enseignes: s.enseignes || null,
        meta: s.meta,
      };
    });
  }, [lines]);

  const result = useMemo(
    () =>
      computeUgc({
        formatId,
        followers: resolvedAudience.followers,
        manualProduction:
          rateSource === "manual" ? manualProduction : null,
        talentUgcBaseRate:
          rateSource === "talent_custom" ? talentUgcRate : null,
        noAudience,
        influenceCachet,
        options: {
          hooksExtra: hooks,
          ctaExtra: ctas,
          conceptScript,
          rushesBruts: rushes,
          revisionsExtra: revisions,
          urgent,
          formatDeclinations: declinations,
          multiLieu,
          fraisAccessoires,
          fraisDeplacement,
        },
        usageLines,
        exclu,
        modif,
        manualValidatedAmount: manualAmount,
        excludeFraisFromCommission: true,
      }),
    [
      formatId,
      resolvedAudience.followers,
      rateSource,
      manualProduction,
      talentUgcRate,
      noAudience,
      influenceCachet,
      hooks,
      ctas,
      conceptScript,
      rushes,
      revisions,
      urgent,
      declinations,
      multiLieu,
      fraisAccessoires,
      fraisDeplacement,
      usageLines,
      exclu,
      modif,
      manualAmount,
    ]
  );

  const netFromPrice =
    netSouhaite != null && netSouhaite > 0
      ? ugcPriceFromNetCreator(netSouhaite)
      : null;

  function revertToAutomatic() {
    setManualProduction(null);
    setRateSource("audience_auto");
  }

  function onManualProductionChange(value: string) {
    if (value === "") {
      setManualProduction(null);
      setRateSource(
        talentUgcRate != null ? "talent_custom" : "audience_auto"
      );
      return;
    }
    const n = Number(value);
    if (!Number.isFinite(n)) return;
    setManualProduction(n);
    setRateSource("manual");
  }

  const sourceBadge =
    previewProduction.source === "manual"
      ? { label: "Prix manuel", cls: "bg-amber-100 text-amber-900" }
      : previewProduction.source === "talent_custom"
        ? {
            label: "Tarif talent personnalisé",
            cls: "bg-violet-100 text-violet-900",
          }
        : previewProduction.source === "audience_auto"
          ? {
              label: "Automatique selon l’audience",
              cls: "bg-emerald-100 text-emerald-900",
            }
          : {
              label: "Tarif générique 500 €",
              cls: "bg-gray-100 text-gray-700",
            };

  function renderUsageRow(usageId: UgcUsageId) {
    const def = ugcUsageById(usageId)!;
    const s = lines[usageId] ?? defaultLine(usageId);
    const lineRes = result.usageLineResults.find((r) => r.usageId === usageId);
    const tier = def.durees.find((d) => d.dureeId === s.dureeId) ?? def.durees[0];

    return (
      <div
        key={usageId}
        className={`rounded-xl border p-3 ${
          s.enabled
            ? "border-glowup-rose/30 bg-glowup-lace/30"
            : "border-gray-100 bg-white"
        }`}
      >
        <label className="flex items-start gap-2">
          <input
            type="checkbox"
            className="mt-1"
            checked={s.enabled}
            onChange={(e) => patchLine(usageId, { enabled: e.target.checked })}
          />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-glowup-licorice">
              {def.label}
            </p>
            <p className="text-[11px] text-gray-500">
              Support : {def.support} · {def.calcHint}
              {def.pricingMode === "sur_devis" ? " · SUR_DEVIS" : " · auto"}
              {tier.minimum != null ? ` · min ${tier.minimum} €` : ""}
              {def.indicativeMin != null
                ? ` · indicatif interne ${def.indicativeMin} €`
                : ""}
            </p>
          </div>
          {s.enabled && lineRes && (
            <p className="shrink-0 text-sm font-semibold tabular-nums">
              {lineRes.status === "SUR_DEVIS"
                ? "SUR_DEVIS"
                : lineRes.status === "MISSING_BUDGET"
                  ? `${formatUgcMoney(lineRes.amountCommercial)}*`
                  : formatUgcMoney(
                      lineRes.amountCommercial ?? lineRes.amount
                    )}
            </p>
          )}
        </label>

        {s.enabled && lineRes?.status === "MISSING_BUDGET" && (
          <p className="mt-2 text-[11px] font-medium text-red-600">
            Budget contractuel manquant — saisissez le budget ads max ou
            choisissez « Budget inconnu — minimum garanti ». Copie du tarif
            définitif bloquée.
          </p>
        )}

        {s.enabled &&
          lineRes?.influenceFloor != null &&
          lineRes.influenceFloor > 0 && (
            <p className="mt-1 text-[11px] text-gray-500">
              Floor compte Influence : {formatUgcMoney(lineRes.influenceFloor)}{" "}
              (exact) → {formatUgcMoney(lineRes.amountCommercial)} commercial
            </p>
          )}

        {s.enabled && (
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {def.durees.length > 0 && (
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
                  Durée
                </label>
                <select
                  className={inputCls}
                  value={s.dureeId}
                  onChange={(e) =>
                    patchLine(usageId, {
                      dureeId: e.target.value as UgcUsageDureeId,
                    })
                  }
                >
                  {def.durees.map((d) => (
                    <option key={d.dureeId} value={d.dureeId}>
                      {d.label}
                      {d.pct != null
                        ? ` (+${Math.round(d.pct * 100)}%)`
                        : " — SUR_DEVIS"}
                      {d.minimum != null ? ` · min ${d.minimum} €` : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {(def.applyTerritoire || usageId === "full_buyout") && (
              <div>
                <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
                  {usageId === "full_buyout" ? "Zone buyout" : "Territoire"}
                </label>
                {usageId === "full_buyout" ? (
                  <select
                    className={inputCls}
                    value={s.buyoutZone}
                    onChange={(e) =>
                      patchLine(usageId, {
                        buyoutZone: e.target.value as "fr" | "monde",
                      })
                    }
                  >
                    <option value="fr">France</option>
                    <option value="monde">Monde</option>
                  </select>
                ) : (
                  <select
                    className={inputCls}
                    value={s.territoire}
                    onChange={(e) =>
                      patchLine(usageId, {
                        territoire: e.target.value as UgcTerritoireId,
                      })
                    }
                  >
                    {UGC_TERRITOIRES.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.label} (×{String(t.mult).replace(".", ",")})
                      </option>
                    ))}
                  </select>
                )}
              </div>
            )}

            {def.pricingMode === "pct_or_budget" && (
              <>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
                    Mode budget
                  </label>
                  <select
                    className={inputCls}
                    value={s.budgetMode}
                    onChange={(e) =>
                      patchLine(usageId, {
                        budgetMode: e.target.value as UgcMediaBudgetMode,
                      })
                    }
                  >
                    <option value="contractuel">Budget contractuel</option>
                    {usageId === "paid_brand" && (
                      <option value="reach">Estimé depuis reach</option>
                    )}
                    <option value="inconnu">
                      Budget inconnu — minimum garanti
                    </option>
                  </select>
                </div>
                {s.budgetMode === "contractuel" && (
                  <div>
                    <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
                      Budget ads max (€)
                    </label>
                    <input
                      className={`${inputCls} ${
                        lineRes?.status === "MISSING_BUDGET"
                          ? "border-red-400 focus:border-red-400 focus:ring-red-200"
                          : ""
                      }`}
                      type="number"
                      min={0}
                      value={s.budgetAds ?? ""}
                      onChange={(e) =>
                        patchLine(usageId, {
                          budgetAds:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                  </div>
                )}
                {s.budgetMode === "reach" && (
                  <>
                    <input
                      className={inputCls}
                      type="number"
                      placeholder="Reach unique"
                      value={s.reachUnique ?? ""}
                      onChange={(e) =>
                        patchLine(usageId, {
                          reachUnique:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      type="number"
                      placeholder="Fréquence"
                      value={s.frequence ?? ""}
                      onChange={(e) =>
                        patchLine(usageId, {
                          frequence:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                    <input
                      className={inputCls}
                      type="number"
                      placeholder="CPM €"
                      value={s.cpm ?? ""}
                      onChange={(e) =>
                        patchLine(usageId, {
                          cpm:
                            e.target.value === ""
                              ? null
                              : Number(e.target.value),
                        })
                      }
                    />
                    <div className="sm:col-span-full">
                      <div className="flex flex-wrap gap-1.5">
                        {CPM_BENCHMARKS_GLOWUP.filter((b) => b.cpm).map((b) => (
                          <button
                            key={b.id}
                            type="button"
                            className="rounded-lg border border-gray-200 px-2 py-1 text-[10px] font-semibold"
                            onClick={() => patchLine(usageId, { cpm: b.cpm })}
                          >
                            {b.shortLabel}
                          </button>
                        ))}
                      </div>
                      <p className="mt-1 text-[10px] text-gray-500">
                        {CPM_BENCHMARK_HINT}
                      </p>
                    </div>
                  </>
                )}
              </>
            )}

            {usageId === "plv" && (
              <>
                <input
                  className={inputCls}
                  type="number"
                  placeholder="Nb points de vente"
                  value={s.nbPointsDeVente ?? ""}
                  onChange={(e) =>
                    patchLine(usageId, {
                      nbPointsDeVente:
                        e.target.value === ""
                          ? null
                          : Number(e.target.value),
                    })
                  }
                />
                <input
                  className={inputCls}
                  type="text"
                  placeholder="Enseignes concernées"
                  value={s.enseignes}
                  onChange={(e) =>
                    patchLine(usageId, { enseignes: e.target.value })
                  }
                />
              </>
            )}

            {def.requiredFields && def.requiredFields.length > 0 && (
              <div className="sm:col-span-full space-y-2">
                <p className="text-[11px] text-amber-800">
                  {def.pricingMode === "sur_devis"
                    ? "Champs obligatoires — validation direction, aucun tarif automatique."
                    : "Informations complémentaires requises."}
                  {def.indicativeMin != null
                    ? ` Minimum indicatif interne : ${def.indicativeMin} € (non facturable).`
                    : ""}
                </p>
                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                  {def.requiredFields
                    .filter(
                      (f) =>
                        f !== "nbPointsDeVente" &&
                        f !== "enseignes" &&
                        f !== "budgetMedia" &&
                        f !== "territoire"
                    )
                    .map((field) => (
                      <input
                        key={field}
                        className={inputCls}
                        type="text"
                        placeholder={field}
                        value={s.meta[field] ?? ""}
                        onChange={(e) =>
                          patchLine(usageId, {
                            meta: { ...s.meta, [field]: e.target.value },
                          })
                        }
                      />
                    ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }

  const currentGroups = UGC_USAGE_GROUPS.filter((g) =>
    UGC_USAGE_CATALOG.some((u) => u.group === g.id && !u.advanced)
  );
  const advancedUsages = UGC_USAGE_CATALOG.filter((u) => u.advanced);

  return (
    <div className="space-y-6">
      <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)] sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
        <h2 className="text-sm font-semibold text-glowup-licorice">
          Production UGC
        </h2>
        <div className="mt-1">
          <CessionsConfidentialNote compact />
        </div>
        <p className="mt-1 text-xs text-gray-500">
          Base automatique selon l’audience × multiplicateur format — sans
          coefficient de notoriété supplémentaire.
        </p>
          </div>
          <span
            className={`rounded-full px-2.5 py-1 text-[10px] font-semibold ${sourceBadge.cls}`}
          >
            {sourceBadge.label}
          </span>
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
              Format
            </label>
            <select
              className={inputCls}
              value={formatId}
              onChange={(e) => setFormatId(e.target.value as UgcFormatId)}
            >
              {UGC_FORMATS.map((f) => (
                <option key={f.id} value={f.id}>
                  {f.label} (×{String(f.formatMult).replace(".", ",")})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
              Audience utilisée pour calculer la base UGC
            </label>
            <select
              className={inputCls}
              value={audiencePlatform}
              disabled={noAudience}
              onChange={(e) =>
                setAudiencePlatform(e.target.value as UgcAudiencePlatform)
              }
            >
              {UGC_AUDIENCE_PLATFORMS.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </select>
            {platformLockedByWhitelist && (
              <p className="mt-1 text-[11px] text-amber-700">
                Whitelisting actif — utilisez l’audience du compte sur lequel la
                pub sera diffusée.
              </p>
            )}
          </div>

          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
              Production valorisée HT (€)
            </label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={
                rateSource === "manual"
                  ? (manualProduction ?? "")
                  : Math.round(previewProduction.productionValorisee)
              }
              onChange={(e) => onManualProductionChange(e.target.value)}
            />
            <div className="mt-1.5 flex flex-wrap gap-2">
              {rateSource !== "audience_auto" && (
                <button
                  type="button"
                  onClick={revertToAutomatic}
                  className="text-[11px] font-semibold text-glowup-rose hover:underline"
                >
                  Revenir au tarif automatique
                </button>
              )}
              {talentUgcRate != null && rateSource !== "talent_custom" && (
                <button
                  type="button"
                  onClick={() => {
                    setManualProduction(null);
                    setRateSource("talent_custom");
                  }}
                  className="text-[11px] font-semibold text-violet-700 hover:underline"
                >
                  Utiliser ugcBaseRate ({formatUgcMoney(talentUgcRate)})
                </button>
              )}
            </div>
          </div>
        </div>

        {!talent && (
          <div className="mt-3 flex flex-wrap items-end gap-3">
            <label className="inline-flex items-center gap-2 text-xs text-gray-700">
              <input
                type="checkbox"
                checked={noAudience}
                onChange={(e) => {
                  setNoAudience(e.target.checked);
                  if (e.target.checked) setRateSource("audience_auto");
                }}
              />
              Créateur sans audience / notoriété (base 500 €)
            </label>
            {!noAudience && (
              <div className="min-w-[10rem]">
                <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
                  Audience manuelle
                </label>
                <input
                  className={inputCls}
                  type="number"
                  min={0}
                  placeholder="Abonnés"
                  value={manualFollowers ?? ""}
                  onChange={(e) =>
                    setManualFollowers(
                      e.target.value === ""
                        ? null
                        : Number(e.target.value)
                    )
                  }
                />
              </div>
            )}
          </div>
        )}

        {/* Récap audience → production */}
        <div className="mt-4 rounded-xl border border-gray-100 bg-glowup-lace/40 px-4 py-3 text-sm text-glowup-licorice">
          <p>
            <span className="font-semibold">
              {resolvedAudience.platformLabel}
            </span>
            {noAudience
              ? " : sans audience"
              : ` : ${formatFollowers(resolvedAudience.followers)} abonnés`}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Palier UGC :{" "}
            {previewProduction.tier?.shortLabel ??
              (previewProduction.source === "talent_custom"
                ? "Tarif fiche talent"
                : previewProduction.source === "manual"
                  ? "Saisie manuelle"
                  : "—")}
            {previewProduction.standardBase != null && (
              <>
                {" "}
                · Base standard automatique :{" "}
                {formatUgcMoney(previewProduction.standardBase)}
              </>
            )}
          </p>
          <p className="mt-1 text-xs text-gray-600">
            Format {previewProduction.formatLabel} ×
            {String(previewProduction.formatMult).replace(".", ",")}
            {" → "}
            <span className="font-semibold text-glowup-licorice">
              Production valorisée :{" "}
              {previewProduction.surDevis
                ? "SUR_DEVIS"
                : `${formatUgcMoney(previewProduction.productionValorisee)} HT`}
            </span>
          </p>
          {talentUgcRate != null && (
            <p className="mt-1 text-[11px] text-violet-700">
              ugcBaseRate fiche talent : {formatUgcMoney(talentUgcRate)}{" "}
              (base standard)
            </p>
          )}
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
              Hooks (+{UGC_OPTION_RATES.hook} €)
            </label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={hooks}
              onChange={(e) => setHooks(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
              CTA (+{UGC_OPTION_RATES.cta} €)
            </label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={ctas}
              onChange={(e) => setCtas(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
              Révisions extra
            </label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={revisions}
              onChange={(e) => setRevisions(Number(e.target.value) || 0)}
            />
          </div>
          <div>
            <label className="mb-1 block text-[10px] font-medium uppercase text-gray-400">
              Déclinaisons format
            </label>
            <input
              className={inputCls}
              type="number"
              min={0}
              value={declinations}
              onChange={(e) => setDeclinations(Number(e.target.value) || 0)}
            />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-gray-700">
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={conceptScript}
              onChange={(e) => setConceptScript(e.target.checked)}
            />
            Concept / script (+{UGC_OPTION_RATES.conceptScript} €)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={rushes}
              onChange={(e) => setRushes(e.target.checked)}
            />
            Rushes (+50 %)
          </label>
          <label className="inline-flex items-center gap-2">
            <input
              type="checkbox"
              checked={urgent}
              onChange={(e) => setUrgent(e.target.checked)}
            />
            Urgent (+30 %)
          </label>
        </div>
        <div className="mt-3 grid gap-3 sm:grid-cols-3">
          <input
            className={inputCls}
            type="number"
            placeholder={`Multi-lieu (min ${UGC_OPTION_RATES.multiLieuMin} €)`}
            value={multiLieu ?? ""}
            onChange={(e) =>
              setMultiLieu(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
          <input
            className={inputCls}
            type="number"
            placeholder="Accessoires (frais)"
            value={fraisAccessoires ?? ""}
            onChange={(e) =>
              setFraisAccessoires(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
          <input
            className={inputCls}
            type="number"
            placeholder="Déplacement (frais)"
            value={fraisDeplacement ?? ""}
            onChange={(e) =>
              setFraisDeplacement(
                e.target.value === "" ? null : Number(e.target.value)
              )
            }
          />
        </div>
      </section>

      {/* Catalogue usages par groupes */}
      {currentGroups.map((g) => {
        const usages = UGC_USAGE_CATALOG.filter(
          (u) => u.group === g.id && !u.advanced
        );
        if (usages.length === 0) return null;
        return (
          <section
            key={g.id}
            className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6"
          >
            <h2 className="mb-3 text-sm font-semibold text-glowup-licorice">
              {g.label}
            </h2>
            <div className="space-y-2">
              {usages.map((u) => renderUsageRow(u.id))}
            </div>
          </section>
        );
      })}

      {/* Avancés repliable */}
      <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 sm:p-6">
        <button
          type="button"
          onClick={() => setShowAdvanced((v) => !v)}
          className="flex w-full items-center justify-between text-left"
        >
          <div>
            <h2 className="text-sm font-semibold text-glowup-licorice">
              Autres supports / usages avancés
            </h2>
            <p className="mt-0.5 text-xs text-gray-500">
              Print, PLV, press kit, salons, retail media, OOH, TV, packaging
            </p>
          </div>
          {showAdvanced ? (
            <ChevronDown className="h-5 w-5 text-gray-400" />
          ) : (
            <ChevronRight className="h-5 w-5 text-gray-400" />
          )}
        </button>
        {showAdvanced && (
          <div className="mt-4 space-y-2">
            {advancedUsages.map((u) => renderUsageRow(u.id))}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5">
          <label className="mb-2 block text-xs font-semibold">
            Exclusivité UGC
          </label>
          <select
            className={inputCls}
            value={exclu}
            onChange={(e) => setExclu(e.target.value as UgcExcluId)}
          >
            {UGC_EXCLUSIVITES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
                {e.surDevis
                  ? " — SUR_DEVIS"
                  : e.pct
                    ? ` (+${Math.round(e.pct * 100)}%)`
                    : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5">
          <label className="mb-2 block text-xs font-semibold">
            Modifications / dérivés
          </label>
          <select
            className={inputCls}
            value={modif}
            onChange={(e) => setModif(e.target.value as UgcModifId)}
          >
            {UGC_MODIFS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Résultat */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-[#1a0a0a] p-6 text-white sm:p-8">
        {result.status === "SUR_DEVIS" && (
          <div className="mb-4 flex gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 py-3 text-sm text-amber-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">SUR_DEVIS — validation direction</p>
              <ul className="mt-1 list-disc pl-4 text-amber-50/90">
                {result.surDevisReasons.map((r) => (
                  <li key={r}>{r}</li>
                ))}
              </ul>
              <div className="mt-3">
                <label className="text-[10px] uppercase tracking-wider text-amber-100/70">
                  Montant manuel validé (€)
                </label>
                <input
                  className="mt-1 w-full max-w-xs rounded-xl border border-white/20 bg-white/95 px-3 py-2 text-sm text-glowup-licorice"
                  type="number"
                  min={0}
                  value={manualAmount ?? ""}
                  onChange={(e) =>
                    setManualAmount(
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            </div>
          </div>
        )}

        {result.budgetAdsMissing && (
          <div className="mb-4 flex gap-2 rounded-xl border border-red-400/50 bg-red-500/15 px-3.5 py-3 text-sm text-red-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div>
              <p className="font-semibold">Budget contractuel manquant</p>
              <p className="mt-1 text-red-50/90">
                Saisissez le budget ads max, ou basculez en « Budget inconnu —
                minimum garanti ». La copie du tarif définitif est bloquée.
              </p>
            </div>
          </div>
        )}

        {result.alerts.map((a) => (
          <p key={a} className="mb-2 text-xs text-amber-100/80">
            {a}
          </p>
        ))}

        <p className="text-[11px] font-medium uppercase tracking-[0.18em] text-red-300">
          Confidentiel ·{" "}
          {result.budgetAdsMissing
            ? "Total UGC HT (provisoire)"
            : "Total UGC HT"}
        </p>
        <p className="mt-3 text-5xl font-bold tabular-nums">
          {result.status === "SUR_DEVIS" && !manualAmount
            ? "SUR_DEVIS"
            : formatUgcMoney(result.totalCommercial)}
        </p>

        <div className="mt-6 grid gap-3 border-t border-white/10 pt-5 text-sm sm:grid-cols-2 lg:grid-cols-3">
          <div>
            <p className="text-[10px] uppercase text-white/35">
              Production UGC générique
            </p>
            <p className="font-semibold tabular-nums">
              {formatUgcMoney(
                result.productionResolution.standardBase ??
                  result.productionBase
              )}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">
              Audience / palier
            </p>
            <p className="font-semibold tabular-nums">
              {formatFollowers(result.productionResolution.followers)}
              {result.productionResolution.tier
                ? ` · ${result.productionResolution.tier.shortLabel}`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">
              Format × mult
            </p>
            <p className="font-semibold tabular-nums">
              ×{String(result.productionResolution.formatMult).replace(".", ",")}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">
              Production valorisée
            </p>
            <p className="font-semibold tabular-nums">
              {formatUgcMoney(result.productionValorisee)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">
              Cachet Influence (floor whitelist)
            </p>
            <p className="font-semibold tabular-nums">
              {result.influenceCachetForWhitelistFloor != null
                ? formatCessionMoney(result.influenceCachetForWhitelistFloor)
                : "—"}
            </p>
            <p className="mt-0.5 text-[10px] text-white/35">
              Uniquement si pub depuis le compte talent
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">Options</p>
            <p className="font-semibold tabular-nums">
              {formatUgcMoney(result.optionsProduction)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">Droits usages</p>
            <p className="font-semibold tabular-nums">
              {formatUgcMoney(result.droitsUsages)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">Exclu / modif</p>
            <p className="font-semibold tabular-nums">
              {formatUgcMoney(result.exclusivite + result.modifPremium)}
            </p>
          </div>
          <div>
            <p className="text-[10px] uppercase text-white/35">Frais réels</p>
            <p className="font-semibold tabular-nums">
              {formatUgcMoney(result.fraisReels)}
            </p>
          </div>
        </div>

        {result.status === "OK" && result.commissionGlowUp != null && (
          <div className="mt-5 rounded-xl border border-white/10 bg-white/5 p-3 text-xs text-white/50">
            <p className="font-medium text-white/70">
              Interne Glow Up (non copié)
            </p>
            <p className="mt-1">
              Net créateur : {formatUgcMoney(result.netCreator)} · Commission 30
              % : {formatUgcMoney(result.commissionGlowUp)}
            </p>
            <div className="mt-2 flex flex-wrap items-end gap-2">
              <input
                className="w-36 rounded-lg border border-white/20 bg-white/95 px-2 py-1.5 text-glowup-licorice"
                type="number"
                placeholder="Net souhaité €"
                value={netSouhaite ?? ""}
                onChange={(e) =>
                  setNetSouhaite(
                    e.target.value === "" ? null : Number(e.target.value)
                  )
                }
              />
              {netFromPrice && (
                <span>
                  → facturer {formatUgcMoney(netFromPrice.prixFacture)}
                </span>
              )}
            </div>
          </div>
        )}

        <div className="mt-4">
          <button
            type="button"
            disabled={result.copyBlocked}
            onClick={() => {
              void navigator.clipboard?.writeText(
                `[CONFIDENTIEL — usage interne Glow Up]\nUGC : ${formatUgcMoney(result.totalCommercial)} HT`
              );
            }}
            className="rounded-xl bg-white px-4 py-2 text-xs font-semibold text-glowup-licorice disabled:cursor-not-allowed disabled:bg-white/20 disabled:text-white/50"
          >
            {result.copyBlocked
              ? result.budgetAdsMissing
                ? "Copie bloquée — budget manquant"
                : "Copie bloquée"
              : "Copier (marque)"}
          </button>
        </div>
      </section>
    </div>
  );
}

/** Logo Snapchat (fantôme — path Simple Icons). */
export function SnapchatLogo({
  className = "h-5 w-5",
  ghostClassName = "fill-current",
}: {
  className?: string;
  ghostClassName?: string;
}) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={className}
      aria-hidden
      role="img"
    >
      <path
        className={ghostClassName}
        d="M12.206.793c.99 0 4.347.276 5.93 3.821.529 1.193.403 3.219.299 4.847l-.003.06c-.012.18-.022.345-.03.51.075.045.203.09.401.09.3-.016.659-.12 1.033-.301.165-.088.344-.104.464-.104.182 0 .359.029.509.09.45.149.734.479.734.838.015.449-.39.839-1.213 1.168-.089.029-.209.075-.344.119-.45.135-1.139.36-1.333.81-.09.224-.061.524.12.868l.015.015c.06.136 1.526 3.475 4.791 4.014.255.044.435.27.42.509 0 .075-.015.149-.045.225-.24.569-1.273.988-3.146 1.271-.059.091-.12.375-.164.57-.029.179-.074.36-.134.553-.076.271-.27.405-.555.405h-.03c-.135 0-.313-.031-.538-.074-.36-.075-.765-.135-1.273-.135-.3 0-.599.015-.913.074-.6.104-1.123.464-1.723.884-.853.599-1.826 1.288-3.294 1.288-.06 0-.119-.015-.18-.015h-.149c-1.468 0-2.427-.675-3.279-1.288-.599-.42-1.107-.779-1.707-.884-.314-.045-.629-.074-.928-.074-.54 0-.958.089-1.272.149-.211.043-.391.074-.54.074-.374 0-.523-.224-.583-.42-.061-.192-.09-.389-.135-.567-.046-.181-.105-.494-.166-.57-1.918-.222-2.95-.642-3.189-1.226-.031-.063-.052-.15-.055-.225-.015-.243.165-.465.42-.509 3.264-.54 4.73-3.879 4.791-4.02l.016-.029c.18-.345.224-.645.119-.869-.195-.434-.884-.658-1.332-.809-.121-.029-.24-.074-.346-.119-1.107-.435-1.257-.93-1.197-1.273.09-.479.674-.793 1.168-.793.146 0 .27.029.383.074.42.194.789.3 1.104.3.234 0 .384-.06.465-.105l-.046-.569c-.098-1.626-.225-3.651.307-4.837C7.392 1.077 10.739.807 11.727.807l.419-.015h.06z"
      />
    </svg>
  );
}

export function SimModeSelector({
  mode,
  onChange,
}: {
  mode: SimDealMode;
  onChange: (m: SimDealMode) => void;
}) {
  return (
    <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-4 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
      <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.14em] text-red-600">
        Confidentiel · Mode simulateur
      </p>
      <div className="flex flex-wrap gap-2">
        {SIM_DEAL_MODES.map((m) => (
          <button
            key={m.id}
            type="button"
            onClick={() => onChange(m.id)}
            className={`rounded-xl px-4 py-2 text-left text-sm font-semibold transition ${
              mode === m.id
                ? m.id === "snapchat"
                  ? "bg-[#FFFC00] text-black"
                  : "bg-glowup-licorice text-white"
                : "border border-gray-200 bg-white text-glowup-licorice hover:border-glowup-rose/40"
            }`}
          >
            <span className="flex items-center gap-2">
              {m.id === "snapchat" && (
                <span
                  className={`inline-flex h-6 w-6 items-center justify-center rounded-md ${
                    mode === m.id
                      ? "bg-black text-[#FFFC00]"
                      : "bg-[#FFFC00] text-black"
                  }`}
                >
                  <SnapchatLogo className="h-3.5 w-3.5" />
                </span>
              )}
              <span className="block">{m.label}</span>
            </span>
            <span
              className={`mt-0.5 block text-[10px] font-normal ${
                mode === m.id
                  ? m.id === "snapchat"
                    ? "text-black/55"
                    : "text-white/60"
                  : "text-gray-500"
              }`}
            >
              {m.hint}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
