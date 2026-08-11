"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  Building2,
  Check,
  CheckCircle2,
  Loader2,
} from "lucide-react";
import { useNomCampagneGate } from "@/components/nom-campagne-gate-provider";
import { normalizeLabel } from "@/lib/nom-campagne-gate-paths";

type PendingItem = {
  id: string;
  reference: string;
  createdAt: string;
  marqueNom: string;
  contactAgence: string | null;
  contactKind?: string | null;
  talentPrenom: string;
  talentNom: string;
};

type Draft = { nom: string; confirm: string };

export default function RattrapageMarquesPage() {
  const router = useRouter();
  const { refresh: refreshGate } = useNomCampagneGate();
  const [loading, setLoading] = useState(true);
  const [items, setItems] = useState<PendingItem[]>([]);
  const [locked, setLocked] = useState(false);
  const [drafts, setDrafts] = useState<Record<string, Draft>>({});
  const [savingId, setSavingId] = useState<string | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [doneFlash, setDoneFlash] = useState(false);

  const load = useCallback(async () => {
    const res = await fetch("/api/collaborations/pending-nom-campagne", {
      cache: "no-store",
    });
    if (!res.ok) {
      setItems([]);
      return { count: 0, locked: false };
    }
    const data = await res.json();
    const list: PendingItem[] = Array.isArray(data.items) ? data.items : [];
    setItems(list);
    setLocked(!!data.locked);
    setDrafts((prev) => {
      const next: Record<string, Draft> = {};
      for (const item of list) {
        next[item.id] = prev[item.id] || { nom: "", confirm: "" };
      }
      return next;
    });
    return {
      count: typeof data.count === "number" ? data.count : list.length,
      locked: !!data.locked,
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const result = await load();
        if (cancelled) return;
        if (result.count === 0) {
          setDoneFlash(true);
          await refreshGate();
          router.replace("/dashboard");
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load, refreshGate, router]);

  const updateDraft = (id: string, patch: Partial<Draft>) => {
    setDrafts((prev) => ({
      ...prev,
      [id]: { ...(prev[id] || { nom: "", confirm: "" }), ...patch },
    }));
    setErrors((prev) => {
      if (!prev[id]) return prev;
      const next = { ...prev };
      delete next[id];
      return next;
    });
  };

  const saveItem = async (item: PendingItem) => {
    const draft = drafts[item.id] || { nom: "", confirm: "" };
    const nom = draft.nom.trim();
    const confirm = draft.confirm.trim();
    if (!nom) {
      setErrors((e) => ({ ...e, [item.id]: "Indique le nom de la marque." }));
      return;
    }
    if (!confirm) {
      setErrors((e) => ({
        ...e,
        [item.id]: "Confirme le nom (2e saisie).",
      }));
      return;
    }
    if (normalizeLabel(nom) !== normalizeLabel(confirm)) {
      setErrors((e) => ({
        ...e,
        [item.id]: "Les deux saisies ne correspondent pas.",
      }));
      return;
    }
    if (
      item.contactAgence &&
      normalizeLabel(nom) === normalizeLabel(item.contactAgence)
    ) {
      setErrors((e) => ({
        ...e,
        [item.id]: "Le nom de marque doit être différent de l'agence.",
      }));
      return;
    }

    setSavingId(item.id);
    try {
      const res = await fetch(
        `/api/collaborations/${item.id}/corriger-marque`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ nomMarque: nom, nomMarqueConfirm: confirm }),
        }
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setErrors((e) => ({
          ...e,
          [item.id]: data.message || data.error || "Erreur",
        }));
        return;
      }

      // Retire la ligne tout de suite, puis sync serveur + gate
      setItems((prev) => prev.filter((x) => x.id !== item.id));
      const result = await load();
      await refreshGate();

      if (result.count === 0) {
        setDoneFlash(true);
        router.replace("/dashboard");
      }
    } catch {
      setErrors((e) => ({ ...e, [item.id]: "Erreur réseau" }));
    } finally {
      setSavingId(null);
    }
  };

  if (loading) {
    return (
      <div className="min-h-[50vh] flex items-center justify-center">
        <Loader2 className="w-7 h-7 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (doneFlash || items.length === 0) {
    return (
      <div className="max-w-xl mx-auto text-center py-16 space-y-4">
        <CheckCircle2 className="w-12 h-12 text-green-500 mx-auto" />
        <h1 className="text-xl font-bold text-glowup-licorice">CRM débloqué</h1>
        <p className="text-sm text-gray-500">
          Tous les noms de marque sont confirmés. Tu retrouves l&apos;accès normal.
        </p>
        <Link
          href="/dashboard"
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-glowup-licorice text-white text-sm font-medium"
        >
          Retour au dashboard
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      <div className="rounded-2xl border border-amber-200 bg-amber-50/80 p-5 flex gap-4">
        <AlertTriangle className="w-6 h-6 text-amber-600 flex-shrink-0 mt-0.5" />
        <div>
          <h1 className="text-lg font-bold text-glowup-licorice">
            Rattrapage noms de marque
          </h1>
          <p className="text-sm text-amber-900/80 mt-1">
            {locked
              ? "Saisis le nom de marque deux fois sur chaque ligne. Une fois tout validé, le CRM se débloque automatiquement."
              : "Confirme le nom de marque (saisie en double) sur chaque collab."}
          </p>
          <p className="text-sm font-semibold text-amber-900 mt-2">
            {items.length} restant{items.length > 1 ? "s" : ""}
          </p>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-gray-100 divide-y divide-gray-50 overflow-hidden">
        {items.map((item) => {
          const draft = drafts[item.id] || { nom: "", confirm: "" };
          const saving = savingId === item.id;
          return (
            <div key={item.id} className="px-5 py-4 space-y-3">
              <div className="flex items-start gap-3">
                <div className="w-10 h-10 rounded-xl bg-gray-100 flex items-center justify-center flex-shrink-0">
                  <Building2 className="w-4 h-4 text-gray-500" />
                </div>
                <div className="flex-1 min-w-0">
                  <p className="font-semibold text-glowup-licorice text-sm">
                    {item.talentPrenom} {item.talentNom} ×{" "}
                    {item.marqueNom || "—"}
                  </p>
                  <p className="text-xs text-gray-500 mt-0.5">
                    {item.reference}
                    {item.contactAgence
                      ? ` · Agence : ${item.contactAgence}`
                      : ""}
                    {" · "}
                    {new Date(item.createdAt).toLocaleDateString("fr-FR")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input
                  type="text"
                  value={draft.nom}
                  onChange={(e) =>
                    updateDraft(item.id, { nom: e.target.value })
                  }
                  placeholder="Nom de la marque"
                  autoComplete="off"
                  disabled={saving}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-licorice bg-white disabled:opacity-60"
                />
                <input
                  type="text"
                  value={draft.confirm}
                  onChange={(e) =>
                    updateDraft(item.id, { confirm: e.target.value })
                  }
                  placeholder="Confirmer le nom"
                  autoComplete="off"
                  disabled={saving}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      void saveItem(item);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:outline-none focus:border-glowup-licorice bg-white disabled:opacity-60"
                />
              </div>

              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => void saveItem(item)}
                  disabled={saving}
                  className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-glowup-licorice text-white text-xs font-medium hover:bg-glowup-licorice/90 disabled:opacity-50"
                >
                  {saving ? (
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  ) : (
                    <Check className="w-3.5 h-3.5" />
                  )}
                  Valider
                </button>
                {errors[item.id] && (
                  <p className="text-xs text-red-600">{errors[item.id]}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
