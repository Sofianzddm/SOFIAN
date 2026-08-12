"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  User,
  ExternalLink,
  AlertTriangle,
  Scale,
  BookOpen,
  Calculator,
} from "lucide-react";
import {
  CESSION_DUREES,
  CESSION_EXCLUSIVITES,
  CESSION_MODIFS,
  CESSION_OOH_DUREES,
  CESSION_OOH_ZONE_SPECIAL,
  CESSION_PACKAGES,
  CESSION_RETRO,
  CESSION_TERRITOIRES,
  CESSION_USAGES,
  BUYOUT_PAID_EXCLUSION_CLAUSE,
  BUDGET_REACH_CONTRACT_CLAUSES,
  BUDGET_REACH_DISCLAIMER,
  CPM_BENCHMARK_HINT,
  CPM_BENCHMARKS_GLOWUP,
  CPM_SOURCE_PRIORITY,
  MEDIA_BUDGET_MODES,
  cessionUsageById,
  computeCession,
  estimateBudgetFromReach,
  formatCessionMoney,
  formatCessionPct,
  resolveOohZoneMult,
  resolveOfflineAbsoluteFloor,
  hasOfflineAbsoluteFloor,
  buyoutMult,
  resolveCessionTier,
  roundCession,
  suggestedBaseCachet,
  type CessionDureeId,
  type CessionExcluId,
  type CessionLineInput,
  type CessionModifId,
  type CessionRetroId,
  type CessionTerritoireId,
  type CessionUsageId,
  type CpmBenchmarkId,
  type MediaBudgetMode,
  type OohZoneSpecialId,
} from "@/lib/cessions";
import {
  SIM_FORMATS,
  numOrNull,
  simFormatById,
  type TalentEmvSource,
} from "@/lib/emv-simulator";
import { formatEmvCompact } from "@/lib/emv";
import {
  SimModeSelector,
  UgcSimulatorPanel,
} from "./UgcSimulatorPanel";
import { SnapchatSimulatorPanel } from "./SnapchatSimulatorPanel";
import { CessionsGuidePanel } from "./CessionsGuidePanel";
import { CessionsConfidentialNote } from "./CessionsConfidentialNote";
import type { SimDealMode } from "@/lib/ugc-cessions";

type SimLine = CessionLineInput;

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLine(
  usageId: CessionUsageId = "whitelisting",
  duree: CessionDureeId = "3m",
  territoire: CessionTerritoireId = "fr",
  budgetMedia: number | null = null,
  nbAgglomerations: number | null = null
): SimLine {
  const usage = cessionUsageById(usageId);
  return {
    id: uid(),
    usageId,
    duree,
    territoire,
    budgetMedia,
    mediaBudgetMode: usage?.pricingMedia ? "aucun" : null,
    reachUnique: null,
    frequence: null,
    cpmPrevisionnel: null,
    cpmBenchmarkId: null,
    nbAgglomerations,
    oohZoneSpecial: "standard",
    oohDense: false,
  };
}

const inputCls =
  "w-full rounded-xl border border-gray-200/80 bg-white px-3 py-2.5 text-sm text-glowup-licorice outline-none transition focus:border-glowup-rose/40 focus:ring-2 focus:ring-glowup-rose/15";
const inputDarkCls =
  "w-full rounded-xl border border-white/15 bg-white/95 px-3 py-2.5 text-sm text-glowup-licorice outline-none transition focus:border-glowup-rose/50 focus:ring-2 focus:ring-glowup-rose/20";

function TalentAvatar({
  talent,
  size = "lg",
}: {
  talent: TalentEmvSource | null;
  size?: "lg" | "md";
}) {
  const sizeCls =
    size === "lg" ? "h-28 w-28 text-2xl sm:h-32 sm:w-32" : "h-14 w-14 text-lg";
  const initials = talent
    ? `${talent.prenom?.charAt(0) || ""}${talent.nom?.charAt(0) || ""}`.toUpperCase()
    : "?";
  return (
    <div
      className={`relative shrink-0 overflow-hidden rounded-[1.25rem] bg-glowup-lace ring-1 ring-white/30 shadow-[0_20px_50px_-20px_rgba(0,0,0,0.55)] ${sizeCls}`}
    >
      {talent?.photo ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={talent.photo}
          alt={talent ? `${talent.prenom} ${talent.nom}` : "Talent"}
          className="h-full w-full object-cover"
        />
      ) : (
        <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-glowup-rose/40 via-glowup-rose-dark/30 to-glowup-licorice/50 font-semibold tracking-[0.12em] text-white">
          {talent ? initials : <User className="h-8 w-8 text-white/70" />}
        </div>
      )}
    </div>
  );
}

export default function SimulateurCessionsClient() {
  const searchParams = useSearchParams();
  const talentParam = searchParams.get("talent");

  const [loadingTalents, setLoadingTalents] = useState(true);
  const [talents, setTalents] = useState<TalentEmvSource[]>([]);
  const [talentId, setTalentId] = useState<string>(talentParam || "");
  const [search, setSearch] = useState("");

  const [formatId, setFormatId] = useState("reel");
  const [baseCachet, setBaseCachet] = useState<number | null>(null);
  const [followers, setFollowers] = useState<number | null>(null);
  /** false = cachet talent personnalisé (défaut). true = tarif générique. */
  const [applyTier, setApplyTier] = useState(false);
  const [lines, setLines] = useState<SimLine[]>([
    emptyLine("whitelisting", "3m", "fr"),
  ]);
  const [exclu, setExclu] = useState<CessionExcluId>("aucune");
  const [modif, setModif] = useState<CessionModifId>("brand_safe");
  const [retro, setRetro] = useState<CessionRetroId>("avant");
  const [dealMode, setDealMode] = useState<SimDealMode>("influence");
  const [mainTab, setMainTab] = useState<"simulateur" | "guide">("simulateur");

  const selectedTalent = useMemo(
    () => talents.find((t) => t.id === talentId) || null,
    [talents, talentId]
  );

  /** Abonnés de la plateforme du livrable (Reel IG → IG, TikTok → TT). */
  const followersFromTalent = useCallback(
    (talent: TalentEmvSource | null, fmtId: string) => {
      if (!talent) return null;
      const fmt = simFormatById(fmtId);
      const ig = numOrNull(talent.stats?.igFollowers) ?? 0;
      const tt = numOrNull(talent.stats?.ttFollowers) ?? 0;
      if (fmt?.platform === "TikTok") return tt > 0 ? tt : ig > 0 ? ig : null;
      if (fmt?.platform === "YouTube") {
        // pas de ytFollowers dédié → IG en fallback info
        return ig > 0 ? ig : tt > 0 ? tt : null;
      }
      // Instagram (défaut)
      return ig > 0 ? ig : tt > 0 ? tt : null;
    },
    []
  );

  const tierInfo = useMemo(() => resolveCessionTier(followers), [followers]);
  const formatMeta = useMemo(() => simFormatById(formatId), [formatId]);
  const platformLabel = formatMeta?.platform ?? "Instagram";

  const filteredTalents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return talents;
    return talents.filter((t) =>
      `${t.prenom} ${t.nom}`.toLowerCase().includes(q)
    );
  }, [talents, search]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTalents(true);
      try {
        const res = await fetch("/api/talents");
        if (!res.ok) throw new Error("talents");
        const data = await res.json();
        const list: TalentEmvSource[] = Array.isArray(data)
          ? data
          : data.talents || [];
        if (!cancelled) setTalents(list);
      } catch {
        if (!cancelled) setTalents([]);
      } finally {
        if (!cancelled) setLoadingTalents(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const applyTalent = useCallback(
    (talent: TalentEmvSource | null) => {
      if (!talent) {
        setBaseCachet(null);
        setFollowers(null);
        return;
      }
      const suggested = suggestedBaseCachet(formatId, talent.tarifs);
      setBaseCachet(suggested);
      setFollowers(followersFromTalent(talent, formatId));
      // Cachet talent = personnalisé → pas de mult. tier
      setApplyTier(false);
    },
    [formatId, followersFromTalent]
  );

  useEffect(() => {
    if (!talentId || !talents.length) return;
    const t = talents.find((x) => x.id === talentId);
    if (t) applyTalent(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talents, talentId]);

  useEffect(() => {
    if (!selectedTalent) return;
    const suggested = suggestedBaseCachet(formatId, selectedTalent.tarifs);
    if (suggested != null) setBaseCachet(suggested);
    setFollowers(followersFromTalent(selectedTalent, formatId));
  }, [formatId, selectedTalent, followersFromTalent]);

  const result = useMemo(
    () =>
      computeCession({
        baseCachet: baseCachet ?? 0,
        followers,
        applyTier,
        lines,
        exclu,
        modif,
        retro,
      }),
    [baseCachet, followers, applyTier, lines, exclu, modif, retro]
  );

  function updateLine(id: string, patch: Partial<SimLine>) {
    setLines((prev) =>
      prev.map((l) => (l.id === id ? { ...l, ...patch } : l))
    );
  }

  function addLine() {
    setLines((prev) => [...prev, emptyLine("site_web", "12m", "fr")]);
  }

  function removeLine(id: string) {
    setLines((prev) => (prev.length <= 1 ? prev : prev.filter((l) => l.id !== id)));
  }

  function applyPackage(packageId: string) {
    const tpl = CESSION_PACKAGES.find((p) => p.id === packageId);
    if (!tpl) return;
    setLines(
      tpl.lines.map((l) => emptyLine(l.usageId, l.duree, l.territoire))
    );
    if (tpl.exclu) setExclu(tpl.exclu);
    else setExclu("aucune");
    if (tpl.modif) setModif(tpl.modif);
    else setModif("brand_safe");
    setRetro("avant");
  }

  function resetAll() {
    if (selectedTalent) applyTalent(selectedTalent);
    else {
      setBaseCachet(null);
      setFollowers(null);
    }
    setFormatId("reel");
    setLines([emptyLine("whitelisting", "3m", "fr")]);
    setExclu("aucune");
    setModif("brand_safe");
    setRetro("avant");
  }

  const base = baseCachet ?? 0;

  return (
    <div className="relative mx-auto max-w-6xl pb-28">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-glowup-rose/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-64 w-64 rounded-full bg-glowup-lace blur-3xl"
      />

      <div className="relative mb-4">
        <CessionsConfidentialNote />
      </div>

      <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-red-600">
            Confidentiel · Interne Glow Up
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-glowup-licorice sm:text-4xl">
            Simulateur cessions
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
            {mainTab === "guide"
              ? "Onglet explicatif pour comprendre toutes les différences de droits."
              : dealMode === "influence"
                ? "Cession seule HT (hors cachet organique)."
                : dealMode === "snapchat"
                  ? "Cachet de publication organique Snapchat HT (Story / Spotlight)."
                  : "Production + droits + options + frais = total UGC HT."}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            href="/simulateur-emv"
            className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-4 py-2 text-sm font-medium text-gray-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-glowup-licorice"
          >
            <Scale className="h-4 w-4" />
            Voir EMV
          </Link>
          {mainTab === "simulateur" && (
            <button
              type="button"
              onClick={resetAll}
              className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-4 py-2 text-sm font-medium text-gray-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-glowup-licorice"
            >
              <RotateCcw className="h-4 w-4" />
              Réinitialiser
            </button>
          )}
        </div>
      </div>

      <div className="relative mb-6 flex flex-wrap gap-2 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-2 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
        <button
          type="button"
          onClick={() => setMainTab("simulateur")}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
            mainTab === "simulateur"
              ? "bg-glowup-licorice text-white"
              : "text-gray-600 hover:bg-gray-50 hover:text-glowup-licorice"
          }`}
        >
          <Calculator className="h-4 w-4" />
          Simulateur
        </button>
        <button
          type="button"
          onClick={() => setMainTab("guide")}
          className={`inline-flex flex-1 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold transition sm:flex-none ${
            mainTab === "guide"
              ? "bg-glowup-licorice text-white"
              : "text-gray-600 hover:bg-gray-50 hover:text-glowup-licorice"
          }`}
        >
          <BookOpen className="h-4 w-4" />
          Guide des droits
        </button>
      </div>

      {mainTab === "guide" ? (
        <CessionsGuidePanel />
      ) : (
        <>
      <div className="relative mb-6">
        <SimModeSelector mode={dealMode} onChange={setDealMode} />
        <div className="mt-2">
          <CessionsConfidentialNote compact />
        </div>
      </div>

      {/* Hero talent + cachet */}
      <section className="relative mb-6 overflow-hidden rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-[#1a0a0a] text-white shadow-[0_30px_80px_-40px_rgba(34,1,1,0.65)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glowup-rose/25 blur-3xl"
        />

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_1fr]">
          <div className="flex justify-center lg:justify-start">
            <TalentAvatar talent={selectedTalent} size="lg" />
          </div>

          <div className="min-w-0 space-y-5">
            <div>
              <p className="text-[11px] font-medium uppercase tracking-[0.16em] text-white/40">
                {selectedTalent ? "Talent sélectionné" : "Sélection"}
              </p>
              <h2 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">
                {selectedTalent
                  ? `${selectedTalent.prenom} ${selectedTalent.nom}`
                  : "Choisir un talent"}
              </h2>
              {selectedTalent ? (
                <Link
                  href={`/talents/${selectedTalent.id}`}
                  className="mt-2 inline-flex items-center gap-1.5 text-xs font-medium text-glowup-rose-light transition hover:text-white"
                >
                  Ouvrir la fiche
                  <ExternalLink className="h-3.5 w-3.5" />
                </Link>
              ) : (
                <p className="mt-2 text-sm text-white/45">
                  {dealMode === "snapchat"
                    ? "Sélection facultative — tarification sur performances saisies."
                    : "Ou saisir le cachet manuellement."}
                </p>
              )}
            </div>

            {loadingTalents ? (
              <div className="flex items-center gap-2 text-sm text-white/50">
                <Loader2 className="h-4 w-4 animate-spin" /> Chargement…
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-[1fr_1.2fr]">
                <input
                  className={inputDarkCls}
                  placeholder="Rechercher…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <select
                  className={inputDarkCls}
                  value={talentId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setTalentId(id);
                    const t = talents.find((x) => x.id === id) || null;
                    applyTalent(t);
                  }}
                >
                  <option value="">— Saisie manuelle —</option>
                  {filteredTalents.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.prenom} {t.nom}
                      {t.stats?.igFollowers
                        ? ` · ${formatEmvCompact(Number(t.stats.igFollowers))}`
                        : ""}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {dealMode !== "snapchat" && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Format de référence
                </label>
                <select
                  className="w-full rounded-lg border-0 bg-transparent p-0 text-sm font-semibold text-white outline-none"
                  value={formatId}
                  onChange={(e) => setFormatId(e.target.value)}
                  style={{ colorScheme: "dark" }}
                >
                  {SIM_FORMATS.map((f) => (
                    <option key={f.id} value={f.id} className="text-glowup-licorice">
                      {f.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Abonnés {platformLabel}
                </label>
                <input
                  className="w-full rounded-lg border-0 bg-transparent p-0 text-lg font-semibold tabular-nums text-white outline-none placeholder:text-white/25"
                  type="number"
                  placeholder="—"
                  value={followers ?? ""}
                  onChange={(e) =>
                    setFollowers(
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
                <p className="mb-1.5 text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Tier audience
                </p>
                <p className="text-sm font-semibold text-white">
                  {tierInfo.label}
                </p>
                <label className="mt-2 flex items-start gap-2 text-[11px] leading-snug text-white/55">
                  <input
                    type="checkbox"
                    checked={applyTier}
                    onChange={(e) => setApplyTier(e.target.checked)}
                    className="mt-0.5 rounded border-white/30 bg-transparent text-glowup-rose focus:ring-glowup-rose"
                  />
                  <span>
                    Appliquer ×{tierInfo.mult.toFixed(2).replace(".", ",")}{" "}
                    <span className="text-white/35">
                      (uniquement si cachet générique)
                    </span>
                  </span>
                </label>
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Cachet de base (€ HT)
                </label>
                <input
                  className="w-full rounded-lg border-0 bg-transparent p-0 text-xl font-semibold tabular-nums text-white outline-none placeholder:text-white/25"
                  type="number"
                  placeholder="ex. 2000"
                  value={baseCachet ?? ""}
                  onChange={(e) =>
                    setBaseCachet(
                      e.target.value === "" ? null : Number(e.target.value)
                    )
                  }
                />
              </div>
            </div>
            )}

            {dealMode === "snapchat" && (
              <p className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 text-xs leading-relaxed text-white/55">
                Pas d&apos;abonnés Snapchat, pas de coefficient d&apos;audience,
                pas de stats auto. Saisir uniquement les viewers / vues moyens
                habituels ci-dessous.
              </p>
            )}
          </div>
        </div>
      </section>

      {dealMode === "influence" && (
      <>
      {/* Packages */}
      <section className="mb-6 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)] backdrop-blur">
        <h2 className="mb-1 text-sm font-semibold text-glowup-licorice">
          Packages types
        </h2>
        <div className="mb-1">
          <CessionsConfidentialNote compact />
        </div>
        <p className="mb-3 text-xs text-gray-500">
          Remplace les lignes par une composition marché courante.
        </p>
        <div className="flex flex-wrap gap-2">
          {CESSION_PACKAGES.map((p) => (
            <button
              key={p.id}
              type="button"
              title={p.hint}
              onClick={() => applyPackage(p.id)}
              className="rounded-full border border-gray-200/90 bg-glowup-lace/40 px-3.5 py-1.5 text-xs font-medium text-glowup-licorice transition hover:border-glowup-rose/30 hover:bg-glowup-lace"
            >
              {p.label}
            </button>
          ))}
        </div>
      </section>

      {/* Lignes d'usage */}
      <section className="mb-6 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)] backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-glowup-licorice">
              Lignes de cession
            </h2>
            <CessionsConfidentialNote compact />
            <p className="mt-0.5 text-xs text-gray-500">
              Paid = 30 % du budget ads (min garanti). Whitelist = 30 % du
              budget (min &gt; paid). OOH = agglomérations. Buyout = matrice
              FR/Monde.
            </p>
          </div>
          <button
            type="button"
            onClick={addLine}
            className="inline-flex items-center gap-1.5 rounded-xl bg-glowup-licorice px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-glowup-licorice/90"
          >
            <Plus className="h-3.5 w-3.5" />
            Ajouter
          </button>
        </div>

        <div className="space-y-3">
          {lines.map((line, idx) => {
            const computed = result.lines[idx];
            const disabled = computed?.disabled;
            const usageMeta = cessionUsageById(line.usageId);
            const isMedia = Boolean(usageMeta?.pricingMedia);
            const isOoh = Boolean(usageMeta?.pricingOoh);
            const isBuyout = Boolean(usageMeta?.pricingBuyout);
            const zoneInfo = resolveOohZoneMult(
              line.nbAgglomerations ?? line.nbVilles ?? 0,
              line.oohZoneSpecial ?? "standard"
            );

            return (
              <div
                key={line.id}
                className={`grid gap-3 rounded-2xl border p-3.5 sm:items-end ${
                  isOoh
                    ? "sm:grid-cols-[1.1fr_0.7fr_0.95fr_0.85fr_0.85fr_0.7fr_auto_auto]"
                    : isMedia
                      ? "sm:grid-cols-[1.1fr_0.65fr_1fr_auto_auto]"
                      : isBuyout
                        ? "sm:grid-cols-[1.3fr_0.8fr_0.9fr_auto_auto]"
                        : "sm:grid-cols-[1.4fr_0.7fr_0.9fr_auto_auto]"
                } ${
                  disabled
                    ? "border-amber-200/80 bg-amber-50/40 opacity-60"
                    : "border-gray-100 bg-glowup-lace/20"
                }`}
              >
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                    Usage
                  </label>
                  <select
                    className={inputCls}
                    value={line.usageId}
                    onChange={(e) => {
                      const nextId = e.target.value as CessionUsageId;
                      const next = cessionUsageById(nextId);
                      updateLine(line.id, {
                        usageId: nextId,
                        budgetMedia:
                          next?.pricingMedia || next?.pricingOoh
                            ? line.budgetMedia ?? null
                            : null,
                        mediaBudgetMode: next?.pricingMedia
                          ? line.mediaBudgetMode ?? "aucun"
                          : null,
                        reachUnique: next?.pricingMedia
                          ? line.reachUnique ?? null
                          : null,
                        frequence: next?.pricingMedia
                          ? line.frequence ?? null
                          : null,
                        cpmPrevisionnel: next?.pricingMedia
                          ? line.cpmPrevisionnel ?? null
                          : null,
                        cpmBenchmarkId: next?.pricingMedia
                          ? line.cpmBenchmarkId ?? null
                          : null,
                        nbAgglomerations: next?.pricingOoh
                          ? line.nbAgglomerations ?? line.nbVilles ?? 1
                          : null,
                        nbVilles: null,
                        oohZoneSpecial: next?.pricingOoh
                          ? line.oohZoneSpecial ?? "standard"
                          : "standard",
                        oohDense: next?.pricingOoh
                          ? line.oohDense ?? false
                          : false,
                        duree: next?.pricingOoh
                          ? "6m"
                          : next?.pricingMedia
                            ? "3m"
                            : line.duree === "sur_devis" && !next?.pricingBuyout
                              ? "12m"
                              : line.duree,
                      });
                    }}
                  >
                    {CESSION_USAGES.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.label} (
                        {u.pricingMedia
                          ? `${Math.round(u.coeff * 100)}% budget ads`
                          : u.pricingOoh
                            ? "agglomérations"
                            : u.pricingBuyout
                              ? "matrice"
                              : `${Math.round(u.coeff * 100)}%`}
                        )
                      </option>
                    ))}
                  </select>
                </div>

                {isMedia ? (
                  <>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Durée droits
                      </label>
                      <select
                        className={inputCls}
                        value={line.duree}
                        onChange={(e) =>
                          updateLine(line.id, {
                            duree: e.target.value as CessionDureeId,
                          })
                        }
                      >
                        {CESSION_DUREES.filter((d) => d.id !== "sur_devis").map(
                          (d) => (
                            <option key={d.id} value={d.id}>
                              {d.label}
                            </option>
                          )
                        )}
                      </select>
                    </div>
                    <div className="sm:col-span-full">
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Mode budget ads
                      </label>
                      <select
                        className={inputCls}
                        value={line.mediaBudgetMode ?? "aucun"}
                        onChange={(e) => {
                          const mode = e.target.value as MediaBudgetMode;
                          updateLine(line.id, {
                            mediaBudgetMode: mode,
                            budgetMedia:
                              mode === "contractuel"
                                ? line.budgetMedia
                                : mode === "aucun"
                                  ? null
                                  : line.budgetMedia,
                          });
                        }}
                      >
                        {MEDIA_BUDGET_MODES.map((m) => (
                          <option key={m.id} value={m.id}>
                            {m.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {
                          MEDIA_BUDGET_MODES.find(
                            (m) => m.id === (line.mediaBudgetMode ?? "aucun")
                          )?.hint
                        }
                      </p>
                    </div>

                    {(line.mediaBudgetMode ?? "aucun") === "contractuel" && (
                      <div className="sm:col-span-full sm:max-w-md">
                        <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                          Budget ads max contractuel (€)
                        </label>
                        <input
                          className={inputCls}
                          type="number"
                          min={0}
                          placeholder="ex. 20000"
                          value={line.budgetMedia ?? ""}
                          onChange={(e) =>
                            updateLine(line.id, {
                              budgetMedia:
                                e.target.value === ""
                                  ? null
                                  : Number(e.target.value),
                            })
                          }
                        />
                        <p className="mt-1 text-[11px] text-gray-500">
                          {Math.round((usageMeta?.coeff ?? 0) * 100)} % du budget
                          · min{" "}
                          {formatCessionMoney(computed?.floorAmount ?? 0)}
                          {computed?.usedFloor ? " (appliqué)" : ""}
                          {" · calcul définitif"}
                        </p>
                      </div>
                    )}

                    {(line.mediaBudgetMode ?? "aucun") === "reach" && (
                      <div className="grid gap-3 sm:col-span-full sm:grid-cols-3">
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                            Reach unique visé
                          </label>
                          <input
                            className={inputCls}
                            type="number"
                            min={0}
                            placeholder="ex. 500000"
                            value={line.reachUnique ?? ""}
                            onChange={(e) =>
                              updateLine(line.id, {
                                reachUnique:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                            Fréquence
                          </label>
                          <input
                            className={inputCls}
                            type="number"
                            min={0}
                            step={0.1}
                            placeholder="ex. 2"
                            value={line.frequence ?? ""}
                            onChange={(e) =>
                              updateLine(line.id, {
                                frequence:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                              })
                            }
                          />
                        </div>
                        <div>
                          <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                            CPM prévisionnel (€)
                          </label>
                          <input
                            className={inputCls}
                            type="number"
                            min={0}
                            step={0.1}
                            placeholder="ex. 12"
                            value={line.cpmPrevisionnel ?? ""}
                            onChange={(e) =>
                              updateLine(line.id, {
                                cpmPrevisionnel:
                                  e.target.value === ""
                                    ? null
                                    : Number(e.target.value),
                                cpmBenchmarkId: "custom",
                              })
                            }
                          />
                        </div>

                        <div className="sm:col-span-3 space-y-2">
                          <p className="text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                            Benchmark Glow Up – positionnement moyen haut
                          </p>
                          <div className="flex flex-wrap gap-2">
                            {CPM_BENCHMARKS_GLOWUP.map((b) => {
                              const active =
                                (line.cpmBenchmarkId ?? null) === b.id ||
                                (b.cpm != null &&
                                  line.cpmBenchmarkId == null &&
                                  line.cpmPrevisionnel === b.cpm);
                              return (
                                <button
                                  key={b.id}
                                  type="button"
                                  onClick={() =>
                                    updateLine(line.id, {
                                      cpmBenchmarkId: b.id,
                                      cpmPrevisionnel:
                                        b.cpm != null
                                          ? b.cpm
                                          : line.cpmPrevisionnel,
                                    })
                                  }
                                  className={`rounded-xl border px-3 py-1.5 text-xs font-semibold transition ${
                                    active
                                      ? "border-glowup-licorice bg-glowup-licorice text-white"
                                      : "border-gray-200 bg-white text-glowup-licorice hover:border-glowup-rose/40 hover:bg-glowup-lace/40"
                                  }`}
                                >
                                  {b.shortLabel}
                                </button>
                              );
                            })}
                          </div>
                          <p className="text-[11px] leading-relaxed text-gray-500">
                            {CPM_BENCHMARK_HINT}
                          </p>
                          {(() => {
                            const selected = CPM_BENCHMARKS_GLOWUP.find(
                              (b) => b.id === line.cpmBenchmarkId
                            );
                            if (!selected || selected.id === "custom") return null;
                            return (
                              <p className="text-[11px] text-gray-500">
                                {selected.label} · fourchette {selected.rangeMin}–
                                {selected.rangeMax} € · 1M impr. ≈{" "}
                                {formatCessionMoney(selected.budgetPer1M ?? 0)}
                                {" (× fréquence pour le budget total)"}
                              </p>
                            );
                          })()}
                        </div>

                        {(() => {
                          const est = estimateBudgetFromReach(
                            line.reachUnique ?? 0,
                            line.frequence ?? 0,
                            line.cpmPrevisionnel ?? 0
                          );
                          return (
                            <div className="sm:col-span-3 space-y-2 rounded-xl border border-amber-200/80 bg-amber-50/60 px-3 py-2.5 text-[11px] text-amber-950">
                              <p>
                                Impressions estimées :{" "}
                                <span className="font-semibold tabular-nums">
                                  {Math.round(est.impressions).toLocaleString(
                                    "fr-FR"
                                  )}
                                </span>
                                {" · "}
                                Budget estimé :{" "}
                                <span className="font-semibold tabular-nums">
                                  {formatCessionMoney(est.budgetEstime)}
                                </span>
                                {" → cession "}
                                {Math.round((usageMeta?.coeff ?? 0) * 100)} %{" "}
                                · min{" "}
                                {formatCessionMoney(computed?.floorAmount ?? 0)}
                                {computed?.usedFloor ? " (floor)" : ""}
                              </p>
                              <p className="leading-relaxed text-amber-900/90">
                                {BUDGET_REACH_DISCLAIMER}
                              </p>
                              <p className="text-amber-800/80">
                                CPM — priorité : {CPM_SOURCE_PRIORITY.join(" → ")}.
                              </p>
                              <p className="font-medium text-amber-950">
                                Contrat : {BUDGET_REACH_CONTRACT_CLAUSES.join(" · ")}.
                              </p>
                            </div>
                          );
                        })()}
                      </div>
                    )}

                    {(line.mediaBudgetMode ?? "aucun") === "aucun" && (
                      <div className="sm:col-span-full rounded-xl border border-gray-200 bg-white/70 px-3 py-2.5 text-[11px] text-gray-600">
                        Minimum garanti appliqué :{" "}
                        <span className="font-semibold tabular-nums text-glowup-licorice">
                          {formatCessionMoney(
                            (computed?.floorAmount ?? 0) *
                              (1 + (computed?.modifPremium ?? 0))
                          )}
                        </span>
                        {" "}
                        ({Math.round((usageMeta?.floorCachetCoeff ?? 0.2) * 100)}{" "}
                        % cachet × durée). À régulariser dès qu&apos;un budget
                        ads est connu.
                      </div>
                    )}
                  </>
                ) : isOoh ? (
                  <>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Nb agglomérations / zones
                      </label>
                      <input
                        className={inputCls}
                        type="number"
                        min={1}
                        placeholder="ex. 1"
                        value={line.nbAgglomerations ?? line.nbVilles ?? ""}
                        onChange={(e) =>
                          updateLine(line.id, {
                            nbAgglomerations:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                            nbVilles: null,
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        {zoneInfo.label}
                        {!zoneInfo.surDevis && zoneInfo.mult > 0
                          ? ` · ×${String(zoneInfo.mult).replace(".", ",")}`
                          : ""}
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Zone spéciale
                      </label>
                      <select
                        className={inputCls}
                        value={line.oohZoneSpecial ?? "standard"}
                        onChange={(e) =>
                          updateLine(line.id, {
                            oohZoneSpecial: e.target.value as OohZoneSpecialId,
                          })
                        }
                      >
                        {CESSION_OOH_ZONE_SPECIAL.map((z) => (
                          <option key={z.id} value={z.id}>
                            {z.label}
                          </option>
                        ))}
                      </select>
                      <p className="mt-1 text-[11px] text-gray-500">
                        {
                          CESSION_OOH_ZONE_SPECIAL.find(
                            (z) => z.id === (line.oohZoneSpecial ?? "standard")
                          )?.hint
                        }
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Durée affichage
                      </label>
                      <select
                        className={inputCls}
                        value={line.duree}
                        disabled={zoneInfo.surDevis}
                        onChange={(e) =>
                          updateLine(line.id, {
                            duree: e.target.value as CessionDureeId,
                          })
                        }
                      >
                        {CESSION_OOH_DUREES.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label} (×{String(d.mult).replace(".", ",")})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Budget OOH net (€)
                      </label>
                      <input
                        className={inputCls}
                        type="number"
                        min={0}
                        placeholder="si connu — obligatoire"
                        disabled={zoneInfo.surDevis}
                        value={line.budgetMedia ?? ""}
                        onChange={(e) =>
                          updateLine(line.id, {
                            budgetMedia:
                              e.target.value === ""
                                ? null
                                : Number(e.target.value),
                          })
                        }
                      />
                      <p className="mt-1 text-[11px] text-gray-500">
                        Obligatoire s&apos;il est connu · plancher 2 %
                      </p>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Hors FR
                      </label>
                      <select
                        className={inputCls}
                        value={line.territoire}
                        disabled={zoneInfo.surDevis}
                        onChange={(e) =>
                          updateLine(line.id, {
                            territoire: e.target.value as CessionTerritoireId,
                          })
                        }
                      >
                        {CESSION_TERRITOIRES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                          </option>
                        ))}
                      </select>
                    </div>
                    <label className="flex items-center gap-2 pb-2 text-xs text-gray-600 sm:col-span-full">
                      <input
                        type="checkbox"
                        checked={Boolean(line.oohDense)}
                        disabled={zoneInfo.surDevis}
                        onChange={(e) =>
                          updateLine(line.id, { oohDense: e.target.checked })
                        }
                        className="rounded border-gray-300 text-glowup-rose focus:ring-glowup-rose"
                      />
                      Plan dense (&gt;500 faces / DOOH illimité) — ×1,15
                    </label>
                  </>
                ) : (
                  <>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Durée
                      </label>
                      <select
                        className={inputCls}
                        value={line.duree}
                        onChange={(e) =>
                          updateLine(line.id, {
                            duree: e.target.value as CessionDureeId,
                          })
                        }
                      >
                        {CESSION_DUREES.map((d) => (
                          <option key={d.id} value={d.id}>
                            {d.label}
                            {isBuyout
                              ? ` · ${Math.round(
                                  buyoutMult(line.territoire, d.id) * 100
                                )} %`
                              : d.surDevis
                                ? ""
                                : ` (×${d.mult})`}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="mb-1 block text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                        Territoire
                      </label>
                      <select
                        className={inputCls}
                        value={line.territoire}
                        onChange={(e) =>
                          updateLine(line.id, {
                            territoire: e.target.value as CessionTerritoireId,
                          })
                        }
                      >
                        {CESSION_TERRITOIRES.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.label}
                            {!isBuyout ? ` (×${t.mult})` : ""}
                          </option>
                        ))}
                      </select>
                      {hasOfflineAbsoluteFloor(line.usageId) && (
                        <p className="mt-1 text-[11px] text-gray-500">
                          {
                            resolveOfflineAbsoluteFloor(
                              line.usageId,
                              line.duree,
                              line.territoire
                            ).label
                          }
                          {" · max(calcul, plancher)"}
                          {computed?.usedFloor ? " — appliqué" : ""}
                        </p>
                      )}
                    </div>
                  </>
                )}

                <div className="min-w-[5.5rem] text-right">
                  <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-gray-400">
                    Montant
                  </p>
                  <p className="text-sm font-semibold tabular-nums text-glowup-licorice">
                    {disabled
                      ? "—"
                      : computed?.status === "SUR_DEVIS"
                        ? "SUR_DEVIS"
                        : formatCessionMoney(
                            roundCession(computed?.amount ?? 0)
                          )}
                  </p>
                  {!disabled &&
                    computed &&
                    computed.status !== "SUR_DEVIS" &&
                    Math.round(computed.amount) !==
                      roundCession(computed.amount) && (
                      <p className="text-[10px] tabular-nums text-gray-400">
                        exact {Math.round(computed.amount).toLocaleString("fr-FR")} €
                      </p>
                    )}
                  {isOoh && computed?.status === "SUR_DEVIS" && (
                    <p className="text-[10px] text-amber-700">validation direction</p>
                  )}
                  {isMedia && computed?.estimationProvisoire && (
                    <p className="text-[10px] text-amber-700">estimation provisoire</p>
                  )}
                  {isOoh && computed?.usedFloor && computed.status !== "SUR_DEVIS" && (
                    <p className="text-[10px] text-amber-700">plancher budget</p>
                  )}
                  {isMedia && computed?.usedFloor && (
                    <p className="text-[10px] text-amber-700">minimum garanti</p>
                  )}
                  {!isOoh &&
                    !isMedia &&
                    !isBuyout &&
                    computed?.usedFloor &&
                    (computed.absoluteFloor ?? 0) > 0 && (
                    <p className="text-[10px] text-amber-700">plancher absolu</p>
                  )}
                  {isBuyout && computed && (
                    <p className="text-[10px] text-gray-500">
                      {Math.round(computed.dureeMult * 100)} % du cachet
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => removeLine(line.id)}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-gray-200 text-gray-400 transition hover:border-red-200 hover:bg-red-50 hover:text-red-600"
                  aria-label="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
                {disabled && (
                  <p className="col-span-full text-xs text-amber-700">
                    Désactivé : le buyout couvre déjà ce support (durée ×
                    territoire). Paid / whitelist restent à part avec budget
                    ads max.
                  </p>
                )}
                {isBuyout && !disabled && (
                  <p className="col-span-full text-xs text-amber-800">
                    {BUYOUT_PAID_EXCLUSION_CLAUSE}
                  </p>
                )}
                {isMedia &&
                  (line.mediaBudgetMode ?? "aucun") === "contractuel" &&
                  !(line.budgetMedia && line.budgetMedia > 0) &&
                  !disabled && (
                  <p className="col-span-full text-xs text-amber-700">
                    Indique le budget ads max au contrat. Toute hausse →
                    régularisation.
                  </p>
                )}
                {isMedia &&
                  (line.mediaBudgetMode ?? "aucun") === "reach" &&
                  !(
                    (line.reachUnique ?? 0) > 0 &&
                    (line.frequence ?? 0) > 0 &&
                    (line.cpmPrevisionnel ?? 0) > 0
                  ) &&
                  !disabled && (
                  <p className="col-span-full text-xs text-amber-700">
                    Saisis reach, fréquence et CPM (issu du média plan, de
                    l&apos;historique marque ou d&apos;un benchmark Glow Up —
                    jamais un CPM unique automatique).
                  </p>
                )}
                {isOoh &&
                  !(
                    (line.nbAgglomerations ?? line.nbVilles ?? 0) > 0
                  ) &&
                  (line.oohZoneSpecial ?? "standard") !== "transport" &&
                  !disabled && (
                  <p className="col-span-full text-xs text-amber-700">
                    Saisis le nombre d&apos;agglomérations / zones de diffusion.
                  </p>
                )}
                {isOoh && zoneInfo.surDevis && !disabled && (
                  <p className="col-span-full text-xs text-amber-800">
                    Statut <span className="font-semibold">SUR_DEVIS</span> —{" "}
                    {(line.oohZoneSpecial ?? "standard") === "transport"
                      ? "métro, gares ou aéroports"
                      : "plus de 10 agglomérations / national"}
                    . Aucun total calculable, copie / devis bloqués, validation
                    direction obligatoire. Ne jamais envoyer 0 € comme cession
                    gratuite.
                  </p>
                )}
                {isOoh &&
                  !zoneInfo.surDevis &&
                  (line.nbAgglomerations ?? line.nbVilles ?? 0) > 0 &&
                  !(line.budgetMedia && line.budgetMedia > 0) &&
                  !disabled && (
                  <p className="col-span-full text-xs text-gray-500">
                    Si le budget OOH est connu, renseigne-le (plancher 2 %).
                  </p>
                )}
                {isOoh &&
                  computed?.parisFloorApplied &&
                  !zoneInfo.surDevis &&
                  !disabled && (
                  <p className="col-span-full text-xs text-gray-500">
                    Plancher Paris appliqué (×{String(zoneInfo.mult).replace(".", ",")}).
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* Options globales */}
      <section className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
          <label className="mb-2 block text-xs font-semibold text-glowup-licorice">
            Exclusivité
          </label>
          <select
            className={inputCls}
            value={exclu}
            onChange={(e) => setExclu(e.target.value as CessionExcluId)}
          >
            {CESSION_EXCLUSIVITES.map((e) => (
              <option key={e.id} value={e.id}>
                {e.label}
                {e.coeff > 0 ? ` (+${Math.round(e.coeff * 100)}%)` : ""}
              </option>
            ))}
          </select>
          <p className="mt-2 text-[11px] text-gray-500">
            Coût d&apos;opportunité sur le cachet, hors multiplicateurs d&apos;usage.
          </p>
        </div>
        <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
          <label className="mb-2 block text-xs font-semibold text-glowup-licorice">
            Modification
          </label>
          <select
            className={inputCls}
            value={modif}
            onChange={(e) => setModif(e.target.value as CessionModifId)}
          >
            {CESSION_MODIFS.map((m) => (
              <option key={m.id} value={m.id}>
                {m.label}
                {m.premium > 0 ? ` (+${Math.round(m.premium * 100)}%)` : ""}
              </option>
            ))}
          </select>
        </div>
        <div className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)]">
          <label className="mb-2 block text-xs font-semibold text-glowup-licorice">
            Timing de la demande
          </label>
          <select
            className={inputCls}
            value={retro}
            onChange={(e) => setRetro(e.target.value as CessionRetroId)}
          >
            {CESSION_RETRO.map((r) => (
              <option key={r.id} value={r.id}>
                {r.label}
                {r.premium > 0 ? ` (+${Math.round(r.premium * 100)}%)` : ""}
              </option>
            ))}
          </select>
        </div>
      </section>

      {/* Montant cession uniquement */}
      <section className="relative overflow-hidden rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-[#1a0a0a] p-6 text-white shadow-[0_30px_80px_-40px_rgba(34,1,1,0.65)] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-56 w-56 rounded-full bg-glowup-rose/20 blur-3xl"
        />

        {result.alertOohNationalSurDevis && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 py-3 text-sm text-amber-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-100">
                Statut SUR_DEVIS — total non calculable
              </p>
              <p className="text-amber-50/90 leading-relaxed">
                OOH national (&gt;10), couverture nationale, ou métro / gares /
                aéroports. Aucun montant automatique, validation direction
                obligatoire. Copie / devis bloqués — ne jamais envoyer 0 €
                comme cession gratuite.
              </p>
            </div>
          </div>
        )}

        {result.alertUsageSurDevis && !result.alertOohNationalSurDevis && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 py-3 text-sm text-amber-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div className="space-y-1">
              <p className="font-semibold text-amber-100">
                Statut SUR_DEVIS — total non calculable
              </p>
              <p className="text-amber-50/90 leading-relaxed">
                Base emailing internationale ou très importante : aucun montant
                automatique. Validation direction obligatoire. Copie / devis
                bloqués.
              </p>
            </div>
          </div>
        )}

        {result.alertBudgetReachProvisoire && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 py-3 text-sm text-amber-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div className="space-y-1.5">
              <p className="font-semibold text-amber-100">
                Estimation provisoire (reach)
              </p>
              <p className="text-amber-50/90 leading-relaxed">
                {BUDGET_REACH_DISCLAIMER}
              </p>
              <p className="text-amber-100/80 text-xs leading-relaxed">
                Contrat : {BUDGET_REACH_CONTRACT_CLAUSES.join(" · ")}.
              </p>
            </div>
          </div>
        )}

        {result.alertBuyoutExcludesPaid && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/40 bg-amber-400/15 px-3.5 py-3 text-sm text-amber-50">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-200" />
            <div className="space-y-1.5">
              <p className="font-semibold text-amber-100">
                Buyout limité — hors paid / whitelist illimité
              </p>
              <p className="text-amber-50/90 leading-relaxed">
                {BUYOUT_PAID_EXCLUSION_CLAUSE}
              </p>
              {!result.hasPaidAlongsideBuyout && (
                <p className="text-amber-100/80">
                  Ajoute une ligne Paid ou Whitelisting avec le{" "}
                  <span className="font-medium">budget ads max contractuel</span>{" "}
                  si la marque prévoit de booster.
                </p>
              )}
            </div>
          </div>
        )}

        {result.alertSurDevis && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              « Sur devis » = plancher indicatif (×4–×6). À négocier
              cas par cas — pas un tarif automatique.
            </p>
          </div>
        )}

        {result.alertHigh && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Cession &gt; 5× le cachet — mieux vaut un forfait négocié.
            </p>
          </div>
        )}

        {result.alertExcluLongue && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-3 text-sm text-amber-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Exclusivité totale longue : à repricer en retainer annuel plutôt
              qu&apos;en % d&apos;un seul cachet.
            </p>
          </div>
        )}

        {result.capped && (
          <div className="relative mb-4 flex items-start gap-2 rounded-xl border border-sky-400/30 bg-sky-400/10 px-3.5 py-3 text-sm text-sky-100">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <p>
              Cap atteint ({formatCessionMoney(result.cap)}) — envisager un full
              buyout.
            </p>
          </div>
        )}

        <p className="relative text-[11px] font-bold uppercase tracking-[0.18em] text-red-300">
          Confidentiel ·{" "}
          {result.totalCalculable
            ? "Cession de droits à facturer"
            : "Cession — SUR_DEVIS"}
        </p>
        <p className="relative mt-3 text-5xl font-bold tabular-nums tracking-tight text-white sm:text-6xl">
          {result.totalCalculable
            ? formatCessionMoney(result.cession)
            : "SUR_DEVIS"}
        </p>
        <p className="relative mt-2 text-sm text-white/55">
          {result.totalCalculable
            ? "Montant commercial arrondi · HT · hors cachet organique"
            : "Aucun total facturable tant que la direction n’a pas validé"}
          {result.totalCalculable && base > 0 && result.pctDuCachet != null
            ? ` · ${formatCessionPct(result.pctDuCachet)} du cachet`
            : ""}
        </p>
        {result.totalCalculable &&
          result.cessionExact != null &&
          result.cession != null &&
          Math.round(result.cessionExact) !== result.cession && (
          <p className="relative mt-1 text-xs tabular-nums text-white/40">
            Calcul exact :{" "}
            {Math.round(result.cessionExact).toLocaleString("fr-FR")} €
          </p>
        )}
        {result.exclusivite > 0 && result.totalCalculable && (
          <p className="relative mt-1 text-xs text-white/40">
            dont exclu {formatCessionMoney(result.exclusivite)} (hors majoration
            rétro)
          </p>
        )}
        {result.alertBudgetReachProvisoire && result.totalCalculable && (
          <p className="relative mt-2 max-w-2xl text-xs leading-relaxed text-amber-100/85">
            {BUDGET_REACH_DISCLAIMER}
          </p>
        )}

        <div className="relative mt-6 grid gap-3 border-t border-white/10 pt-5 sm:grid-cols-3">
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">
              Cachet de référence
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatCessionMoney(base)}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">
              Audience {platformLabel}
            </p>
            <p className="mt-1 text-lg font-semibold">{result.tier.label}</p>
            <p className="text-[11px] tabular-nums text-white/40">
              {result.applyTier
                ? `Tier ×${result.tierApplied.toFixed(2).replace(".", ",")} appliqué`
                : "Tier non appliqué (cachet personnalisé)"}
              {result.tier.followers > 0
                ? ` · ${formatEmvCompact(result.tier.followers)}`
                : ""}
            </p>
          </div>
          <div>
            <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/35">
              Usages (avant exclu)
            </p>
            <p className="mt-1 text-lg font-semibold tabular-nums">
              {formatCessionMoney(result.sousTotalApresDegressivite)}
            </p>
          </div>
        </div>

        <p className="relative mt-6 max-w-2xl text-[11px] leading-relaxed text-white/40">
          Grille v3 — paid 30 % / whitelist 30 % du budget ads. Tier audience
          désactivé dès qu&apos;on part du vrai cachet talent. OOH 1
          agglomération ≈ 55–80 % du cachet selon la durée d&apos;affichage.
        </p>
      </section>

      </>
      )}

      {dealMode === "ugc" && (
        <div className="mb-6">
          <UgcSimulatorPanel
            talent={selectedTalent}
            influenceCachet={base}
          />
        </div>
      )}

      {dealMode === "snapchat" && (
        <div className="mb-6">
          <SnapchatSimulatorPanel
            talentLabel={
              selectedTalent
                ? `${selectedTalent.prenom} ${selectedTalent.nom}`
                : null
            }
          />
        </div>
      )}

      {dealMode === "influence" && base > 0 && result.totalCalculable && (result.cession ?? 0) > 0 && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-glowup-licorice/20 bg-glowup-licorice/95 px-4 py-3 text-white backdrop-blur-md sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-red-300">
                Confidentiel ·{" "}
                {result.alertBudgetReachProvisoire
                  ? "Cession (estimation provisoire)"
                  : "Cession de droits"}
              </p>
              <p className="text-xl font-bold tabular-nums text-glowup-rose-light">
                {formatCessionMoney(result.cession)}{" "}
                <span className="text-sm font-medium text-white/50">HT</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                const note = result.alertBudgetReachProvisoire
                  ? `\n${BUDGET_REACH_DISCLAIMER}`
                  : "";
                void navigator.clipboard?.writeText(
                  `[CONFIDENTIEL — usage interne Glow Up]\nCession de droits : ${formatCessionMoney(result.cession)} HT${note}`
                );
              }}
              className="shrink-0 rounded-xl bg-white px-4 py-2 text-xs font-semibold text-glowup-licorice transition hover:bg-glowup-lace"
            >
              Copier
            </button>
          </div>
        </div>
      )}

      {dealMode === "influence" && base > 0 && !result.totalCalculable && (
        <div className="fixed inset-x-0 bottom-0 z-40 border-t border-amber-500/40 bg-glowup-licorice/95 px-4 py-3 text-white backdrop-blur-md sm:px-6">
          <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-amber-200/80">
                Total non calculable
              </p>
              <p className="text-xl font-bold text-amber-100">SUR_DEVIS</p>
            </div>
            <button
              type="button"
              disabled
              title="Validation direction obligatoire"
              className="shrink-0 cursor-not-allowed rounded-xl bg-white/20 px-4 py-2 text-xs font-semibold text-white/50"
            >
              Copier bloqué
            </button>
          </div>
        </div>
      )}
        </>
      )}
    </div>
  );
}
