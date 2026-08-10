"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useSession } from "next-auth/react";
import {
  Loader2,
  Plus,
  Trash2,
  RotateCcw,
  ChevronDown,
  ChevronUp,
  AlertTriangle,
  User,
  Lock,
  ExternalLink,
} from "lucide-react";
import {
  DEFAULT_EMV_CONFIG,
  computeLineEmv,
  formatEmvCompact,
  formatEmvMoney,
  resolveEmvConfig,
  roundEmv,
  type EmvCastingInput,
  type EmvConfig,
} from "@/lib/emv";
import {
  PACKAGE_TEMPLATES,
  SIM_FORMATS,
  castingFromTalent,
  scoreEmvRoi,
  simFormatById,
  suggestedReachForFormat,
  tarifUnitForFormat,
  type TalentEmvSource,
} from "@/lib/emv-simulator";

type SimLine = {
  id: string;
  formatId: string;
  quantity: number;
  reach: number | null;
  tarifUnit: number | null;
  mediaValue: number | null;
};

function uid() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function emptyLine(formatId = "reel"): SimLine {
  return {
    id: uid(),
    formatId,
    quantity: 1,
    reach: null,
    tarifUnit: null,
    mediaValue: null,
  };
}

function lineFromFormat(
  formatId: string,
  quantity: number,
  talent: TalentEmvSource | null
): SimLine {
  return {
    id: uid(),
    formatId,
    quantity,
    reach: suggestedReachForFormat(formatId, talent),
    tarifUnit: tarifUnitForFormat(formatId, talent?.tarifs),
    mediaValue: null,
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
  size?: "lg" | "md" | "sm";
}) {
  const sizeCls =
    size === "lg" ? "h-28 w-28 text-2xl sm:h-32 sm:w-32" : size === "md" ? "h-14 w-14 text-lg" : "h-9 w-9 text-xs";
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

export default function SimulateurEmvClient() {
  const searchParams = useSearchParams();
  const talentParam = searchParams.get("talent");
  const { data: session } = useSession();
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const role = effectiveRole ?? (session?.user as { role?: string } | undefined)?.role ?? "";
  const canEditCpm = role === "ADMIN";

  const [loadingTalents, setLoadingTalents] = useState(true);
  const [talents, setTalents] = useState<TalentEmvSource[]>([]);
  const [talentId, setTalentId] = useState<string>(talentParam || "");
  const [search, setSearch] = useState("");

  const [casting, setCasting] = useState<EmvCastingInput>({
    name: "Créateur",
    followers: 0,
    engagement: 0,
    reachInstagram: null,
    reachTiktok: null,
  });
  const [lines, setLines] = useState<SimLine[]>([emptyLine("reel"), emptyLine("story")]);
  const [emvConfig, setEmvConfig] = useState<EmvConfig>(DEFAULT_EMV_CONFIG);
  const [showCpm, setShowCpm] = useState(false);
  const [roundDisplay, setRoundDisplay] = useState(true);

  const selectedTalent = useMemo(
    () => talents.find((t) => t.id === talentId) || null,
    [talents, talentId]
  );

  const filteredTalents = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return talents;
    return talents.filter((t) => `${t.prenom} ${t.nom}`.toLowerCase().includes(q));
  }, [talents, search]);

  useEffect(() => {
    fetch("/api/auth/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((data) => {
        if (data?.role) setEffectiveRole(data.role);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoadingTalents(true);
      try {
        const res = await fetch("/api/talents");
        if (!res.ok) throw new Error("talents");
        const data = await res.json();
        const list: TalentEmvSource[] = Array.isArray(data) ? data : data.talents || [];
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

  const applyTalent = useCallback((talent: TalentEmvSource | null, keepLines: boolean) => {
    if (!talent) {
      setCasting({
        name: "Créateur",
        followers: 0,
        engagement: 0,
        reachInstagram: null,
        reachTiktok: null,
      });
      if (!keepLines) setLines([emptyLine("reel")]);
      return;
    }
    setCasting(castingFromTalent(talent));
    if (!keepLines) {
      setLines([
        lineFromFormat("reel", 1, talent),
        lineFromFormat("story", 2, talent),
      ]);
      return;
    }
    setLines((prev) =>
      prev.map((l) => ({
        ...l,
        reach: l.reach ?? suggestedReachForFormat(l.formatId, talent),
        tarifUnit: l.tarifUnit ?? tarifUnitForFormat(l.formatId, talent.tarifs),
      }))
    );
  }, []);

  useEffect(() => {
    if (!talentId || !talents.length) return;
    const t = talents.find((x) => x.id === talentId);
    if (t) applyTalent(t, false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [talents, talentId]);

  const cfg = resolveEmvConfig(emvConfig);
  const computed = useMemo(() => {
    // Pas de fallback abonnés × 60 % : l’EMV TM part uniquement de la moyenne de vues saisie.
    const castingForEmv: EmvCastingInput[] = [
      {
        ...casting,
        followers: 0,
        reachInstagram: null,
        reachTiktok: null,
      },
    ];
    return lines.map((line) => {
      const fmt = simFormatById(line.formatId);
      const emvLine = computeLineEmv(
        {
          talent: casting.name,
          format: fmt?.format,
          platform: fmt?.platform,
          quantity: line.quantity,
          reach: line.reach,
          mediaValue: line.mediaValue,
        },
        castingForEmv,
        cfg
      );
      const tarifLine =
        line.tarifUnit != null && line.tarifUnit > 0
          ? line.tarifUnit * (Number(line.quantity) || 1)
          : null;
      const emvShown = roundDisplay ? roundEmv(emvLine.retained) : Math.round(emvLine.retained);
      const roi =
        tarifLine && tarifLine > 0 && emvLine.retained > 0
          ? emvLine.retained / tarifLine
          : null;
      return { line, fmt, emvLine, tarifLine, emvShown, roi };
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lines, casting, cfg, roundDisplay]);

  const totals = useMemo(() => {
    const emv = computed.reduce((s, c) => s + c.emvLine.retained, 0);
    const emvShown = roundDisplay ? roundEmv(emv) : Math.round(emv);
    const tarif = computed.reduce((s, c) => s + (c.tarifLine || 0), 0);
    const reach = computed.reduce((s, c) => s + c.emvLine.reach, 0);
    const interactions = computed.reduce((s, c) => s + c.emvLine.interactions, 0);
    const roi = tarif > 0 && emv > 0 ? emv / tarif : null;
    const delta = emv - tarif;
    return { emv, emvShown, tarif, reach, interactions, roi, delta };
  }, [computed, roundDisplay]);

  function updateLine(id: string, patch: Partial<SimLine>) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        const next = { ...l, ...patch };
        if (patch.formatId && patch.formatId !== l.formatId) {
          if (next.reach == null) next.reach = suggestedReachForFormat(patch.formatId, selectedTalent);
          if (next.tarifUnit == null)
            next.tarifUnit = tarifUnitForFormat(patch.formatId, selectedTalent?.tarifs);
        }
        return next;
      })
    );
  }

  function onFormatChange(id: string, formatId: string) {
    setLines((prev) =>
      prev.map((l) => {
        if (l.id !== id) return l;
        return {
          ...l,
          formatId,
          reach: suggestedReachForFormat(formatId, selectedTalent),
          tarifUnit: tarifUnitForFormat(formatId, selectedTalent?.tarifs),
          mediaValue: null,
        };
      })
    );
  }

  function addLine() {
    setLines((prev) => [...prev, lineFromFormat("story", 1, selectedTalent)]);
  }

  function applyPackage(templateId: string) {
    const tpl = PACKAGE_TEMPLATES.find((p) => p.id === templateId);
    if (!tpl) return;
    setLines(tpl.lines.map((l) => lineFromFormat(l.formatId, l.quantity, selectedTalent)));
  }

  function resetAll() {
    if (selectedTalent) applyTalent(selectedTalent, false);
    else {
      setCasting({
        name: "Créateur",
        followers: 0,
        engagement: 0,
        reachInstagram: null,
        reachTiktok: null,
      });
      setLines([emptyLine("reel"), emptyLine("story")]);
    }
    setEmvConfig(DEFAULT_EMV_CONFIG);
  }

  const verdict = scoreEmvRoi(totals.roi);

  return (
    <div className="relative mx-auto max-w-6xl pb-16">
      <div
        aria-hidden
        className="pointer-events-none absolute -left-24 -top-16 h-72 w-72 rounded-full bg-glowup-rose/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-16 top-40 h-64 w-64 rounded-full bg-glowup-lace blur-3xl"
      />

      <div className="relative mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="mb-1 text-[11px] font-medium uppercase tracking-[0.18em] text-glowup-rose/80">
            Interne · Talent managers
          </p>
          <h1 className="text-3xl font-bold tracking-tight text-glowup-licorice sm:text-4xl">
            Simulateur EMV
          </h1>
          <p className="mt-2 max-w-xl text-sm leading-relaxed text-gray-500">
            Valeur média d’un package à partir des moyennes de vues (
            <span className="font-medium text-gray-700">vues ÷ 1&nbsp;000 × CPM</span>
            ), comparée au tarif commercial.
          </p>
        </div>
        <button
          type="button"
          onClick={resetAll}
          className="inline-flex items-center gap-2 rounded-xl border border-gray-200/80 bg-white/80 px-4 py-2 text-sm font-medium text-gray-600 shadow-sm backdrop-blur transition hover:bg-white hover:text-glowup-licorice"
        >
          <RotateCcw className="h-4 w-4" />
          Réinitialiser
        </button>
      </div>

      {/* Hero talent */}
      <section className="relative mb-6 overflow-hidden rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-[#1a0a0a] text-white shadow-[0_30px_80px_-40px_rgba(34,1,1,0.65)]">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-20 -top-24 h-72 w-72 rounded-full bg-glowup-rose/25 blur-3xl"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-28 left-10 h-64 w-64 rounded-full bg-glowup-rose/10 blur-3xl"
        />

        <div className="relative grid gap-8 p-6 sm:p-8 lg:grid-cols-[auto_1fr]">
          <div className="flex justify-center lg:justify-start">
            <TalentAvatar talent={selectedTalent} size="lg" />
          </div>

          <div className="min-w-0 space-y-5">
            <div className="flex flex-wrap items-start justify-between gap-3">
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
                    Ou saisir les données manuellement ci-dessous.
                  </p>
                )}
              </div>
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
                    applyTalent(t, false);
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

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Abonnés IG
                </label>
                <input
                  className="w-full rounded-lg border-0 bg-transparent p-0 text-lg font-semibold tabular-nums text-white outline-none placeholder:text-white/25"
                  type="number"
                  placeholder="—"
                  value={casting.followers || ""}
                  onChange={(e) =>
                    setCasting((c) => ({
                      ...c,
                      followers: e.target.value === "" ? 0 : Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm">
                <label className="mb-1.5 block text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Engagement %
                </label>
                <input
                  className="w-full rounded-lg border-0 bg-transparent p-0 text-lg font-semibold tabular-nums text-white outline-none placeholder:text-white/25"
                  type="number"
                  step="0.1"
                  placeholder="—"
                  value={casting.engagement || ""}
                  onChange={(e) =>
                    setCasting((c) => ({
                      ...c,
                      engagement: e.target.value === "" ? 0 : Number(e.target.value),
                    }))
                  }
                />
              </div>
              <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-3.5 py-3 backdrop-blur-sm col-span-2 sm:col-span-2">
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-white/40">
                  Base de calcul
                </p>
                <p className="mt-1.5 text-sm leading-snug text-white/65">
                  L’EMV repose sur la moyenne de vues de chaque livrable. Les abonnés
                  servent aux interactions estimées.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Packages */}
      <section className="mb-6 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)] backdrop-blur">
        <h2 className="mb-1 text-sm font-semibold text-glowup-licorice">Compositions types</h2>
        <p className="mb-3 text-xs text-gray-500">Remplace les livrables par un package prédéfini.</p>
        <div className="flex flex-wrap gap-2">
          {PACKAGE_TEMPLATES.map((p) => (
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

      {/* Lignes */}
      <section className="mb-6 rounded-[1.5rem] border border-gray-200/70 bg-white/90 p-5 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)] backdrop-blur">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-glowup-licorice">Livrables</h2>
            <p className="mt-0.5 text-xs text-gray-500">
              La moyenne de vues est requise sur chaque ligne pour calculer l’EMV.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <label className="flex items-center gap-2 text-xs text-gray-500">
              <input
                type="checkbox"
                checked={roundDisplay}
                onChange={(e) => setRoundDisplay(e.target.checked)}
                className="rounded border-gray-300 text-glowup-rose focus:ring-glowup-rose"
              />
              Arrondi présentation
            </label>
            <button
              type="button"
              onClick={addLine}
              className="inline-flex items-center gap-1.5 rounded-xl bg-glowup-licorice px-3.5 py-2 text-xs font-semibold text-white transition hover:bg-glowup-licorice/90"
            >
              <Plus className="h-3.5 w-3.5" />
              Ajouter
            </button>
          </div>
        </div>

        <div className="space-y-3">
          {computed.map(({ line, emvLine, tarifLine, emvShown, roi }) => {
            const missingViews = line.reach == null || line.reach <= 0;
            const lineVerdict = scoreEmvRoi(roi);
            return (
            <div
              key={line.id}
              className={`rounded-2xl border p-4 transition ${
                missingViews
                  ? "border-amber-200/80 bg-amber-50/50"
                  : "border-gray-100 bg-gradient-to-b from-white to-gray-50/80 shadow-sm"
              }`}
            >
              <div className="grid grid-cols-1 items-end gap-2 md:grid-cols-[1.4fr_70px_130px_110px_110px_auto]">
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Format
                  </label>
                  <select
                    className={inputCls}
                    value={line.formatId}
                    onChange={(e) => onFormatChange(line.id, e.target.value)}
                  >
                    {SIM_FORMATS.map((f) => (
                      <option key={f.id} value={f.id}>
                        {f.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Qté
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    min={1}
                    value={line.quantity}
                    onChange={(e) =>
                      updateLine(line.id, {
                        quantity: Math.max(1, Number(e.target.value) || 1),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-glowup-rose">
                    Moyenne de vues *
                  </label>
                  <input
                    className={`${inputCls} ${
                      missingViews
                        ? "border-amber-300 bg-white focus:border-amber-500 focus:ring-amber-200"
                        : ""
                    }`}
                    type="number"
                    placeholder="ex : 45 000"
                    value={line.reach ?? ""}
                    onChange={(e) =>
                      updateLine(line.id, {
                        reach: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    Tarif unitaire €
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    placeholder="—"
                    value={line.tarifUnit ?? ""}
                    onChange={(e) =>
                      updateLine(line.id, {
                        tarifUnit: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <div>
                  <label className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-gray-400">
                    EMV forcée
                  </label>
                  <input
                    className={inputCls}
                    type="number"
                    placeholder={emvLine.emv > 0 ? `auto ${Math.round(emvLine.emv)}` : "—"}
                    value={line.mediaValue ?? ""}
                    onChange={(e) =>
                      updateLine(line.id, {
                        mediaValue: e.target.value === "" ? null : Number(e.target.value),
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setLines((prev) => prev.filter((l) => l.id !== line.id))}
                  className="mb-0.5 rounded-lg p-2 text-red-500 hover:bg-red-50"
                  title="Supprimer"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-gray-200/80 pt-2.5 text-[11px] text-gray-500">
                {!missingViews || line.mediaValue != null ? (
                  <>
                    <span>
                      Vues totales ≈{" "}
                      <b className="text-gray-700">{formatEmvCompact(emvLine.reach)}</b>
                      {line.quantity > 1 ? ` (${formatEmvCompact(line.reach)} × ${line.quantity})` : ""}
                    </span>
                    <span>{emvLine.cpm} € / 1 000</span>
                    <span>
                      EMV ≈ <b className="text-gray-700">{formatEmvMoney(emvShown)}</b>
                    </span>
                    {tarifLine != null ? (
                      <span>
                        Tarif ≈ <b className="text-gray-700">{formatEmvMoney(tarifLine)}</b>
                      </span>
                    ) : (
                      <span className="text-amber-600">Tarif non renseigné</span>
                    )}
                    {lineVerdict ? (
                      <span
                        className={`rounded-full px-2 py-0.5 font-semibold ${lineVerdict.badge}`}
                      >
                        {lineVerdict.label} · ×
                        {(roi as number).toLocaleString("fr-FR", { maximumFractionDigits: 1 })}
                      </span>
                    ) : null}
                    {line.mediaValue == null && emvLine.emv > 0 ? (
                      <button
                        type="button"
                        className="font-medium text-glowup-rose hover:underline"
                        onClick={() =>
                          updateLine(line.id, { mediaValue: Math.round(emvLine.emv) })
                        }
                      >
                        Forcer cette valeur
                      </button>
                    ) : null}
                    {line.mediaValue != null ? (
                      <button
                        type="button"
                        className="font-medium text-gray-500 hover:underline"
                        onClick={() => updateLine(line.id, { mediaValue: null })}
                      >
                        Calcul automatique
                      </button>
                    ) : null}
                  </>
                ) : (
                  <span className="inline-flex items-center gap-1 font-medium text-amber-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Moyenne de vues manquante.
                  </span>
                )}
              </div>
            </div>
            );
          })}
        </div>
      </section>

      {/* Totaux */}
      <section className="relative mb-6 overflow-hidden rounded-[1.75rem] border border-glowup-licorice/10 bg-gradient-to-br from-glowup-licorice via-[#2a1212] to-gray-950 p-6 text-white shadow-[0_30px_80px_-40px_rgba(34,1,1,0.65)] sm:p-8">
        <div
          aria-hidden
          className="pointer-events-none absolute -right-16 top-0 h-56 w-56 rounded-full bg-glowup-rose/20 blur-3xl"
        />
        <div className="relative mb-6 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {selectedTalent ? <TalentAvatar talent={selectedTalent} size="sm" /> : null}
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-white/45">
                Synthèse
              </p>
              {selectedTalent ? (
                <p className="text-sm font-medium text-white/80">
                  {selectedTalent.prenom} {selectedTalent.nom}
                </p>
              ) : null}
            </div>
          </div>
          {verdict ? (
            <div className="text-right">
              <span
                className={`inline-flex items-center rounded-full px-3.5 py-1.5 text-sm font-bold ${verdict.badgeDark}`}
              >
                {verdict.label}
              </span>
              <p className="mt-1.5 max-w-xs text-[11px] text-white/45">{verdict.hint}</p>
            </div>
          ) : (
            <p className="text-xs text-white/40">
              Renseigner moyennes de vues et tarifs pour obtenir une note.
            </p>
          )}
        </div>
        <div className="relative grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-sm">
            <p className="text-xs text-white/45">Tarif total</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
              {totals.tarif > 0 ? formatEmvMoney(totals.tarif) : "—"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-sm">
            <p className="text-xs text-white/45">EMV</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight text-glowup-rose-light">
              {totals.emv > 0 ? `≈ ${formatEmvMoney(totals.emvShown)}` : "—"}
            </p>
            <p className="mt-1 text-[11px] text-white/35">
              Vues {formatEmvCompact(totals.reach)}
              {totals.interactions > 0
                ? ` · ≈ ${formatEmvCompact(totals.interactions)} interactions`
                : ""}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-sm">
            <p className="text-xs text-white/45">Ratio EMV / tarif</p>
            <p
              className={`mt-1 text-2xl font-bold tabular-nums tracking-tight ${verdict?.accent ?? "text-white/40"}`}
            >
              {totals.roi != null
                ? `×${totals.roi.toLocaleString("fr-FR", { maximumFractionDigits: 1 })}`
                : "—"}
            </p>
            <p className="mt-1 text-[11px] text-white/35">
              {verdict
                ? "≥2 Très bien · ≥1,5 Bon · ≥1 Moyen · <1 Faible"
                : "En attente des données"}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-4 backdrop-blur-sm">
            <p className="text-xs text-white/45">Écart EMV − tarif</p>
            <p className="mt-1 text-2xl font-bold tabular-nums tracking-tight">
              {totals.tarif > 0 && totals.emv > 0
                ? `${totals.delta >= 0 ? "+" : ""}${formatEmvMoney(totals.delta)}`
                : "—"}
            </p>
          </div>
        </div>
      </section>

      {/* CPM */}
      <section className="rounded-[1.5rem] border border-gray-200/70 bg-white/90 shadow-[0_8px_30px_-18px_rgba(34,1,1,0.25)] backdrop-blur">
        <button
          type="button"
          onClick={() => setShowCpm((v) => !v)}
          className="flex w-full items-center justify-between px-5 py-4 text-left"
        >
          <div>
            <h2 className="flex items-center gap-2 text-sm font-semibold text-glowup-licorice">
              Paramètres CPM
              {!canEditCpm ? <Lock className="h-3.5 w-3.5 text-gray-400" /> : null}
            </h2>
            <p className="text-xs text-gray-500">
              Grille Glowup — même base que les propositions Strategy
            </p>
          </div>
          {showCpm ? (
            <ChevronUp className="h-4 w-4 text-gray-400" />
          ) : (
            <ChevronDown className="h-4 w-4 text-gray-400" />
          )}
        </button>
        {showCpm ? (
          <div className="border-t border-gray-100 px-5 pb-5 pt-4">
            <div className="mb-4 rounded-xl border border-gray-100 bg-gray-50 px-3.5 py-3 text-xs leading-relaxed text-gray-600">
              <p>
                Le CPM représente le coût média pour 1&nbsp;000 vues, selon le format
                (story, reel, TikTok…). Il convertit une moyenne de vues en valeur
                média : <span className="font-medium text-gray-800">vues ÷ 1&nbsp;000 × CPM</span>.
              </p>
              <p className="mt-2">
                Grille marché France 2026, partagée avec les propositions Strategy
                (story plus bas, reel / TikTok plus haut, YouTube vidéo au-dessus).
                Une seule référence pour valoriser un package face à une marque.
              </p>
              {!canEditCpm ? (
                <p className="mt-2 text-gray-500">
                  Lecture seule. Modification réservée aux administrateurs.
                </p>
              ) : (
                <p className="mt-2 text-amber-700/90">
                  Droits admin : modification possible. Préférer la grille Glowup sauf
                  évolution marché documentée.
                </p>
              )}
            </div>

            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {(
                [
                  ["story", "Story"],
                  ["reel", "Reel"],
                  ["post", "Post"],
                  ["carrousel", "Carrousel"],
                  ["tiktok", "TikTok"],
                  ["ytShort", "YT Short"],
                  ["ytVideo", "Vidéo YT"],
                  ["default", "Défaut"],
                ] as const
              ).map(([k, label]) => (
                <div key={k}>
                  <label className="block text-[11px] text-gray-500">{label}</label>
                  <input
                    className={`${inputCls} ${
                      !canEditCpm ? "cursor-not-allowed bg-gray-50 text-gray-600" : ""
                    }`}
                    type="number"
                    value={cfg.formatCpm[k]}
                    disabled={!canEditCpm}
                    readOnly={!canEditCpm}
                    onChange={(e) => {
                      if (!canEditCpm) return;
                      setEmvConfig({
                        ...cfg,
                        formatCpm: {
                          ...cfg.formatCpm,
                          [k]: Number(e.target.value) || 0,
                        },
                      });
                    }}
                  />
                </div>
              ))}
            </div>

            {canEditCpm ? (
              <div className="mt-3 flex flex-wrap items-end gap-3">
                <div>
                  <label className="block text-[11px] text-gray-500">
                    Taux abonnés → reach (référence Strategy)
                  </label>
                  <input
                    className={`${inputCls} w-28`}
                    type="number"
                    step="0.05"
                    min={0}
                    max={1}
                    value={cfg.defaultReachRate}
                    onChange={(e) =>
                      setEmvConfig({
                        ...cfg,
                        defaultReachRate: Number(e.target.value) || 0,
                      })
                    }
                  />
                </div>
                <button
                  type="button"
                  onClick={() => setEmvConfig(DEFAULT_EMV_CONFIG)}
                  className="rounded-lg border border-gray-200 px-3 py-2 text-xs font-medium text-gray-600 hover:bg-gray-50"
                >
                  Restaurer les CPM Glowup
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </section>
    </div>
  );
}
