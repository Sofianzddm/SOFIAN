"use client";

import { useEffect, useState, useCallback } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowLeft,
  Loader2,
  AlertTriangle,
  Sparkles,
  Building2,
  Bot,
  Check,
  X,
  Play,
  UserPlus,
} from "lucide-react";

type Counts = {
  collaborations: number;
  negociations: number;
  inboundOpportunities: number;
  contactMissions: number;
  demandesGift: number;
  contacts: number;
};

type MarqueRow = {
  id: string;
  nom: string;
  slug: string;
  createdAt: string;
  counts: Counts;
};

type Group = {
  key: string;
  reason: "EXACT" | "TYPO" | "PREFIX" | "TRIGRAM";
  marques: MarqueRow[];
};

type AiSuggestion = {
  id: string;
  runId: string;
  groupKey: string;
  marquesSnapshot: Array<{
    id: string;
    nom: string;
    slug: string;
    secteur?: string | null;
    counts: Counts;
    score?: number;
  }>;
  verdict: "MERGE" | "KEEP_SEPARATE" | "NEEDS_REVIEW";
  confidence: number;
  reasoning: string;
  recommendedTargetId: string | null;
  recommendedSourceIds: string[];
  dryRun: boolean;
  createdAt: string;
};

const REASON_LABELS: Record<Group["reason"], { label: string; color: string }> = {
  EXACT: { label: "Doublon exact", color: "bg-red-100 text-red-700" },
  TYPO: { label: "Typo / faute", color: "bg-orange-100 text-orange-700" },
  PREFIX: { label: "Sous-produit", color: "bg-blue-100 text-blue-700" },
  TRIGRAM: { label: "Variante proche", color: "bg-amber-100 text-amber-700" },
};

const VERDICT_LABELS = {
  MERGE: { label: "Fusion recommandée", color: "bg-emerald-100 text-emerald-800" },
  KEEP_SEPARATE: { label: "Garder séparées", color: "bg-gray-100 text-gray-700" },
  NEEDS_REVIEW: { label: "À valider", color: "bg-amber-100 text-amber-800" },
};

type TabMode = "exact" | "fuzzy" | "ai-review";

export default function MarquesDuplicatesPage() {
  const searchParams = useSearchParams();
  const initialTab = searchParams.get("review") === "1" ? "ai-review" : "exact";

  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<Group[]>([]);
  const [totalToMerge, setTotalToMerge] = useState(0);
  const [running, setRunning] = useState(false);
  const [resultMsg, setResultMsg] = useState<string | null>(null);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [mode, setMode] = useState<TabMode>(initialTab);
  const [threshold, setThreshold] = useState(0.78);

  const [aiSuggestions, setAiSuggestions] = useState<AiSuggestion[]>([]);
  const [aiPendingCount, setAiPendingCount] = useState(0);
  // Sélection multiple (onglet IA) : ids des suggestions cochées pour la
  // fusion groupée. Seuls les groupes fusionnables (MERGE + cible) sont cochables.
  const [aiChecked, setAiChecked] = useState<Set<string>>(new Set());

  const loadDuplicates = async (m: "exact" | "fuzzy", t: number = threshold) => {
    setLoading(true);
    try {
      const res = await fetch(`/api/marques/duplicates?mode=${m}&threshold=${t}`, {
        cache: "no-store",
      });
      const data = await res.json();
      setGroups(data.groups || []);
      setTotalToMerge(data.totalMarquesAFusionner || 0);
      const next: Record<string, string> = {};
      for (const g of (data.groups || []) as Group[]) {
        next[g.key] = g.marques[0]?.id;
      }
      setSelected(next);
    } finally {
      setLoading(false);
    }
  };

  const loadAiReview = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/marques/dedupe-suggestions?status=PENDING&limit=80", {
        cache: "no-store",
      });
      const data = await res.json();
      const suggestions: AiSuggestion[] = data.suggestions || [];
      setAiSuggestions(suggestions);
      setAiPendingCount(data.statusCounts?.PENDING ?? (suggestions.length || 0));
      // Purge des coches devenues obsolètes (groupes déjà traités/refetchés).
      setAiChecked((prev) => {
        const ids = new Set(suggestions.map((s) => s.id));
        return new Set([...prev].filter((id) => ids.has(id)));
      });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetch("/api/marques/dedupe-suggestions?status=PENDING&limit=1", { cache: "no-store" })
      .then((r) => r.json())
      .then((d) => setAiPendingCount(d.statusCounts?.PENDING ?? 0))
      .catch(() => {});
  }, []);

  useEffect(() => {
    if (mode === "ai-review") loadAiReview();
    else loadDuplicates(mode === "fuzzy" ? "fuzzy" : "exact", threshold);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  const runAutoDedupe = async () => {
    if (mode !== "exact") {
      alert(
        "La fusion automatique ne s'applique qu'aux doublons exacts. Pour le mode flou, fusionne groupe par groupe."
      );
      return;
    }
    if (
      !confirm(
        `Fusionner automatiquement ${totalToMerge} doublon(s) ? La fiche avec le plus de relations sera conservée.`
      )
    )
      return;
    setRunning(true);
    setResultMsg(null);
    try {
      const res = await fetch("/api/marques/dedupe-auto", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResultMsg(`✓ ${data.merged} fusion(s) effectuée(s).`);
      await loadDuplicates("exact");
    } catch (e) {
      setResultMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
    }
  };

  const runBackfillContacts = async () => {
    if (
      !confirm(
        "Reconstruire les contacts clients à partir des inbounds, négos, missions et opportunités ? (idempotent — n'écrase rien)"
      )
    )
      return;
    setRunning(true);
    setResultMsg(null);
    try {
      const res = await fetch("/api/admin/marques/backfill-contacts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({}),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      const bySource = Object.entries(data.bySource || {})
        .map(([k, v]) => `${k}: ${(v as { created: number }).created} nouveaux`)
        .join(" · ");
      setResultMsg(
        `✓ ${data.created} contact(s) ajouté(s), ${data.skipped} déjà existants. ${bySource}`
      );
    } catch (e) {
      setResultMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
    }
  };

  const runAiJob = async () => {
    if (
      !confirm(
        "Lancer l'analyse IA maintenant ? (dry-run : crée des suggestions sans fusionner)"
      )
    )
      return;
    setRunning(true);
    setResultMsg(null);
    try {
      const res = await fetch("/api/marques/dedupe-suggestions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ dryRun: true, autoMerge: false }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      const s = data.stats;
      setResultMsg(
        `✓ Analyse terminée : ${s.analyzed} groupes, ${s.pendingReview} en revue, ${s.autoMerged} fusionnés auto.`
      );
      setMode("ai-review");
      await loadAiReview();
    } catch (e) {
      setResultMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
    }
  };

  const mergeGroup = async (group: Group) => {
    const targetId = selected[group.key];
    if (!targetId) return;
    const sources = group.marques.filter((m) => m.id !== targetId);
    if (sources.length === 0) return;
    if (
      !confirm(
        `Fusionner ${sources.length} fiche(s) dans "${group.marques.find((m) => m.id === targetId)?.nom}" ?`
      )
    )
      return;
    setRunning(true);
    setResultMsg(null);
    try {
      for (const src of sources) {
        const res = await fetch(`/api/marques/${targetId}/merge`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sourceMarqueId: src.id }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || "Erreur fusion");
      }
      setResultMsg(`✓ Groupe fusionné.`);
      if (mode === "fuzzy") await loadDuplicates("fuzzy", threshold);
      else await loadDuplicates("exact");
    } catch (e) {
      setResultMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
    }
  };

  const aiAction = async (id: string, action: "approve" | "reject") => {
    setRunning(true);
    setResultMsg(null);
    try {
      const res = await fetch(`/api/marques/dedupe-suggestions/${id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      setResultMsg(action === "approve" ? "✓ Fusion approuvée." : "✓ Groupe ignoré (ne sera plus proposé).");
      await loadAiReview();
    } catch (e) {
      setResultMsg(e instanceof Error ? e.message : "Erreur");
    } finally {
      setRunning(false);
    }
  };

  const dismissGroup = (key: string) => {
    setGroups((prev) => prev.filter((g) => g.key !== key));
  };

  const toggleAiCheck = (id: string) => {
    setAiChecked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  // Groupes fusionnables de l'onglet IA (verdict MERGE + cible recommandée).
  const aiMergeable = aiSuggestions.filter(
    (s) => s.verdict === "MERGE" && s.recommendedTargetId
  );

  const toggleAiCheckAll = () => {
    setAiChecked((prev) =>
      prev.size >= aiMergeable.length ? new Set() : new Set(aiMergeable.map((s) => s.id))
    );
  };

  // Fusion groupée : approuve les suggestions cochées une par une (chaque
  // fusion est une transaction côté serveur) avec progression affichée.
  const aiBulkApprove = async () => {
    const ids = aiMergeable.filter((s) => aiChecked.has(s.id)).map((s) => s.id);
    if (ids.length === 0) return;
    if (
      !confirm(
        `Fusionner les ${ids.length} groupe(s) sélectionné(s) ? La fiche « à garder » de chaque groupe absorbe les autres.`
      )
    )
      return;
    setRunning(true);
    setResultMsg(null);
    let done = 0;
    let failed = 0;
    try {
      for (const id of ids) {
        try {
          const res = await fetch(`/api/marques/dedupe-suggestions/${id}`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "approve" }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => ({}));
            throw new Error(data.error || "Erreur");
          }
          done += 1;
        } catch (e) {
          console.error(`Fusion suggestion ${id}:`, e);
          failed += 1;
        }
        setResultMsg(`Fusion en cours… ${done + failed}/${ids.length}`);
      }
      setResultMsg(
        failed === 0
          ? `✓ ${done} groupe(s) fusionné(s).`
          : `✓ ${done} groupe(s) fusionné(s), ${failed} en erreur (voir console).`
      );
      setAiChecked(new Set());
      await loadAiReview();
    } finally {
      setRunning(false);
    }
  };

  const switchTab = (tab: TabMode) => {
    setMode(tab);
    setResultMsg(null);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div>
          <Link
            href="/marques"
            className="text-sm text-gray-500 hover:text-glowup-rose flex items-center gap-1 mb-2"
          >
            <ArrowLeft className="w-4 h-4" /> Retour
          </Link>
          <h1 className="text-2xl font-bold text-glowup-licorice">Doublons de marques</h1>
          <p className="text-gray-500 mt-1">
            {mode === "ai-review"
              ? "Propositions du cron IA nocturne — valide ou rejette chaque groupe."
              : mode === "exact"
                ? "Marques ayant exactement le même nom normalisé."
                : "Typos, sous-produits et variantes proches (algo)."}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            type="button"
            onClick={runBackfillContacts}
            disabled={running}
            className="flex items-center gap-2 px-4 py-2 bg-sky-100 text-sky-900 rounded-xl hover:bg-sky-200 disabled:opacity-50"
            title="Reconstruit les contacts clients à partir des inbounds, négos, missions, opportunités"
          >
            {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
            Reconstruire les contacts
          </button>
          {mode === "ai-review" && (
            <button
              type="button"
              onClick={runAiJob}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl hover:bg-violet-700 disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Play className="w-4 h-4" />}
              Lancer analyse IA
            </button>
          )}
          {mode === "exact" && groups.length > 0 && (
            <button
              type="button"
              onClick={runAutoDedupe}
              disabled={running}
              className="flex items-center gap-2 px-4 py-2 bg-glowup-rose text-white rounded-xl hover:bg-glowup-rose-dark disabled:opacity-50"
            >
              {running ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
              Tout fusionner ({totalToMerge})
            </button>
          )}
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-4">
        <div className="flex items-center gap-1 bg-gray-100 rounded-xl p-1 flex-wrap">
          <button
            type="button"
            onClick={() => switchTab("exact")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              mode === "exact" ? "bg-white shadow-sm text-glowup-licorice" : "text-gray-500"
            }`}
          >
            Strict
          </button>
          <button
            type="button"
            onClick={() => switchTab("fuzzy")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium ${
              mode === "fuzzy" ? "bg-white shadow-sm text-glowup-licorice" : "text-gray-500"
            }`}
          >
            Flou
          </button>
          <button
            type="button"
            onClick={() => switchTab("ai-review")}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium flex items-center gap-1.5 ${
              mode === "ai-review" ? "bg-white shadow-sm text-glowup-licorice" : "text-gray-500"
            }`}
          >
            <Bot className="w-3.5 h-3.5" />
            IA à valider
            {aiPendingCount > 0 && (
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-violet-600 text-white">
                {aiPendingCount}
              </span>
            )}
          </button>
        </div>

        {mode === "fuzzy" && (
          <div className="flex items-center gap-3 text-sm">
            <label className="text-gray-600">
              Sensibilité : <strong>{Math.round(threshold * 100)}%</strong>
            </label>
            <input
              type="range"
              min="0.6"
              max="0.95"
              step="0.02"
              value={threshold}
              onChange={(e) => setThreshold(parseFloat(e.target.value))}
              onMouseUp={() => loadDuplicates("fuzzy", threshold)}
              onTouchEnd={() => loadDuplicates("fuzzy", threshold)}
              className="w-48"
            />
          </div>
        )}

        {mode !== "ai-review" && (
          <div className="text-sm text-gray-500 ml-auto">
            {loading ? "…" : `${groups.length} groupe(s) · ${totalToMerge} fiche(s)`}
          </div>
        )}
      </div>

      {resultMsg && (
        <div className="p-4 rounded-xl bg-emerald-50 border border-emerald-200 text-sm text-emerald-700">
          {resultMsg}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <Loader2 className="w-8 h-8 animate-spin text-glowup-rose" />
        </div>
      ) : mode === "ai-review" ? (
        aiSuggestions.length === 0 ? (
          <div className="p-12 text-center bg-white rounded-2xl border border-gray-100">
            <Bot className="w-12 h-12 text-violet-400 mx-auto mb-3" />
            <p className="text-gray-700 font-medium">Aucune proposition IA en attente</p>
            <p className="text-gray-500 text-sm mt-2">
              Le cron tourne chaque nuit à 3h (dry-run par défaut). Tu peux aussi lancer une analyse
              manuelle.
            </p>
            <button
              type="button"
              onClick={runAiJob}
              disabled={running}
              className="mt-4 inline-flex items-center gap-2 px-4 py-2 bg-violet-600 text-white rounded-xl"
            >
              <Play className="w-4 h-4" /> Lancer maintenant
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Barre de fusion groupée : coche les groupes puis fusionne d'un coup */}
            {aiMergeable.length > 0 && (
              <div className="sticky top-2 z-20 bg-white rounded-2xl border border-violet-200 shadow-sm px-5 py-3 flex flex-wrap items-center justify-between gap-3">
                <label className="flex items-center gap-2 text-sm text-gray-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={aiChecked.size >= aiMergeable.length && aiMergeable.length > 0}
                    onChange={toggleAiCheckAll}
                    className="w-4 h-4 rounded border-gray-300 accent-violet-600"
                  />
                  Tout sélectionner ({aiMergeable.length} groupe{aiMergeable.length > 1 ? "s" : ""} fusionnable{aiMergeable.length > 1 ? "s" : ""})
                </label>
                <button
                  type="button"
                  onClick={aiBulkApprove}
                  disabled={running || aiChecked.size === 0}
                  className="flex items-center gap-1.5 text-sm px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 disabled:opacity-50 font-medium"
                >
                  <Check className="w-4 h-4" />
                  Fusionner la sélection ({aiChecked.size})
                </button>
              </div>
            )}
            {aiSuggestions.map((s) => {
              const v = VERDICT_LABELS[s.verdict];
              const marques = s.marquesSnapshot || [];
              const mergeable = s.verdict === "MERGE" && Boolean(s.recommendedTargetId);
              return (
                <div
                  key={s.id}
                  className={`bg-white rounded-2xl border overflow-hidden ${
                    aiChecked.has(s.id) ? "border-emerald-400 ring-1 ring-emerald-200" : "border-violet-100"
                  }`}
                >
                  <div className="px-5 py-3 bg-violet-50 border-b border-violet-100 flex flex-wrap items-center justify-between gap-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      {mergeable && (
                        <input
                          type="checkbox"
                          checked={aiChecked.has(s.id)}
                          onChange={() => toggleAiCheck(s.id)}
                          disabled={running}
                          className="w-4 h-4 rounded border-gray-300 accent-violet-600 cursor-pointer"
                          title="Sélectionner ce groupe pour la fusion groupée"
                        />
                      )}
                      <Bot className="w-4 h-4 text-violet-600" />
                      <span
                        className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${v.color}`}
                      >
                        {v.label}
                      </span>
                      <span className="text-sm text-violet-900">
                        Confiance {Math.round(s.confidence * 100)}%
                        {s.dryRun && (
                          <span className="ml-2 text-xs text-violet-600">(dry-run)</span>
                        )}
                      </span>
                    </div>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => aiAction(s.id, "reject")}
                        disabled={running}
                        className="flex items-center gap-1 text-xs px-3 py-1.5 border border-gray-200 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                      >
                        <X className="w-3.5 h-3.5" /> Ignorer
                      </button>
                      {s.verdict === "MERGE" && s.recommendedTargetId && (
                        <button
                          type="button"
                          onClick={() => aiAction(s.id, "approve")}
                          disabled={running}
                          className="flex items-center gap-1 text-xs px-3 py-1.5 bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 disabled:opacity-50"
                        >
                          <Check className="w-3.5 h-3.5" /> Fusionner
                        </button>
                      )}
                    </div>
                  </div>
                  <p className="px-5 py-3 text-sm text-gray-700 border-b border-gray-50 italic">
                    « {s.reasoning} »
                  </p>
                  <div className="divide-y divide-gray-100">
                    {marques.map((m) => {
                      const isTarget = m.id === s.recommendedTargetId;
                      const isSource = s.recommendedSourceIds.includes(m.id);
                      const total =
                        m.counts.collaborations +
                        m.counts.negociations +
                        m.counts.inboundOpportunities +
                        m.counts.contactMissions +
                        m.counts.contacts;
                      return (
                        <div
                          key={m.id}
                          className={`flex items-center gap-3 px-5 py-3 ${
                            isTarget ? "bg-emerald-50/50" : isSource ? "bg-amber-50/30" : ""
                          }`}
                        >
                          <div className="w-10 h-10 rounded-xl bg-glowup-lace flex items-center justify-center">
                            <Building2 className="w-5 h-5 text-glowup-rose" />
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-2 flex-wrap">
                              <span className="font-medium text-glowup-licorice">{m.nom}</span>
                              {isTarget && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-600 text-white">
                                  à garder
                                </span>
                              )}
                              {isSource && (
                                <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-amber-200 text-amber-900">
                                  à fusionner
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-gray-500">
                              {m.secteur || "—"} · slug {m.slug}
                            </p>
                          </div>
                          <p className="text-xs text-gray-500">
                            <strong>{total}</strong> relation(s)
                          </p>
                        </div>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : groups.length === 0 ? (
        <div className="p-12 text-center bg-white rounded-2xl border border-gray-100">
          <Sparkles className="w-12 h-12 text-emerald-400 mx-auto mb-3" />
          <p className="text-gray-700 font-medium">Aucun doublon détecté !</p>
          {mode === "exact" && (
            <p className="text-gray-500 text-sm mt-1">
              Essaie <strong>Flou</strong> ou l&apos;onglet <strong>IA à valider</strong>.
            </p>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {groups.map((group) => {
            const reasonInfo = REASON_LABELS[group.reason];
            return (
              <div
                key={group.key}
                className="bg-white rounded-2xl border border-gray-100 overflow-hidden"
              >
                <div className="px-5 py-3 bg-amber-50 border-b border-amber-100 flex items-center justify-between gap-3 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <AlertTriangle className="w-4 h-4 text-amber-600" />
                    <span
                      className={`text-[10px] px-2 py-0.5 rounded-full font-semibold uppercase ${reasonInfo.color}`}
                    >
                      {reasonInfo.label}
                    </span>
                    <span className="text-sm font-medium text-amber-900">
                      {group.marques.length} fiches
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => dismissGroup(group.key)}
                      disabled={running}
                      className="text-xs px-3 py-1.5 bg-white border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 disabled:opacity-50"
                    >
                      Ignorer
                    </button>
                    <button
                      type="button"
                      onClick={() => mergeGroup(group)}
                      disabled={running}
                      className="text-xs px-3 py-1.5 bg-glowup-licorice text-white rounded-lg hover:opacity-90 disabled:opacity-50"
                    >
                      Fusionner ce groupe
                    </button>
                  </div>
                </div>
                <div className="divide-y divide-gray-100">
                  {group.marques.map((m, idx) => {
                    const total =
                      m.counts.collaborations +
                      m.counts.negociations +
                      m.counts.inboundOpportunities +
                      m.counts.contactMissions +
                      m.counts.demandesGift +
                      m.counts.contacts;
                    const isTarget = selected[group.key] === m.id;
                    return (
                      <label
                        key={m.id}
                        className={`flex items-center gap-3 px-5 py-3 cursor-pointer hover:bg-gray-50 ${
                          isTarget ? "bg-emerald-50/50" : ""
                        }`}
                      >
                        <input
                          type="radio"
                          name={`group-${group.key}`}
                          checked={isTarget}
                          onChange={() =>
                            setSelected((prev) => ({ ...prev, [group.key]: m.id }))
                          }
                          className="accent-emerald-600"
                        />
                        <div className="w-10 h-10 rounded-xl bg-glowup-lace flex items-center justify-center">
                          <Building2 className="w-5 h-5 text-glowup-rose" />
                        </div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-glowup-licorice">{m.nom}</span>
                            {idx === 0 && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 font-medium">
                                recommandé
                              </span>
                            )}
                            {isTarget && (
                              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-glowup-rose text-white font-medium">
                                à garder
                              </span>
                            )}
                          </div>
                          <p className="text-xs text-gray-500 mt-0.5">
                            créée le {new Date(m.createdAt).toLocaleDateString("fr-FR")}
                          </p>
                        </div>
                        <div className="text-right text-xs text-gray-500">
                          <strong className="text-glowup-licorice">{total}</strong> relation(s)
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
