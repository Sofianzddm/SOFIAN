"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { ArrowLeft, Loader2, Link2, AlertTriangle, ClipboardCheck, Gauge } from "lucide-react";
import {
  CHECKLIST_QUESTIONS,
  CHECKLIST_SECTIONS,
  isChecklistComplete,
  unsecuredQuestions,
  type ChecklistState,
  type ChecklistValue,
} from "@/lib/confirmation-checklist";

type TalentOption = {
  id: string;
  prenom: string;
  nom: string;
  commissionInbound: number | null;
};

type TalentStats = {
  total: number;
  confirmed: number;
  confirmationRate: number | null;
  avgResponseHours: number | null;
  activeConfirmed: number;
};

export default function NewConfirmationPage() {
  const router = useRouter();
  const [talents, setTalents] = useState<TalentOption[]>([]);
  const [saving, setSaving] = useState(false);
  const [talentStats, setTalentStats] = useState<TalentStats | null>(null);
  const [checklist, setChecklist] = useState<ChecklistState>({});
  const [form, setForm] = useState({
    talentId: "",
    marque: "",
    budgetBrut: "",
    commissionPercent: "20",
    livrables: "",
    dateTournage: "",
    datePublication: "",
    villeDepart: "",
    deplacement: "",
    droits: "",
    optionUntil: "",
  });

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/talents");
        if (res.ok) {
          const data = await res.json();
          const list = Array.isArray(data) ? data : data.talents || [];
          setTalents(
            list.map((t: { id: string; prenom: string; nom: string; commissionInbound?: number | null }) => ({
              id: t.id,
              prenom: t.prenom,
              nom: t.nom,
              commissionInbound: t.commissionInbound ?? null,
            }))
          );
        }
      } catch {
        /* noop */
      }
    })();
  }, []);

  const netPreview = useMemo(() => {
    const brut = Number(form.budgetBrut) || 0;
    const comm = Number(form.commissionPercent) || 0;
    return Math.round(brut * (1 - comm / 100));
  }, [form.budgetBrut, form.commissionPercent]);

  const onSelectTalent = (id: string) => {
    const t = talents.find((x) => x.id === id);
    setForm((f) => ({
      ...f,
      talentId: id,
      commissionPercent:
        t?.commissionInbound != null ? String(t.commissionInbound) : f.commissionPercent,
    }));
    setTalentStats(null);
    if (id) {
      fetch(`/api/confirmations/stats?talentId=${id}`)
        .then((r) => (r.ok ? r.json() : null))
        .then((s) => s && setTalentStats(s))
        .catch(() => {});
    }
  };

  const setAnswer = (key: string, value: ChecklistValue) =>
    setChecklist((c) => ({ ...c, [key]: { ...c[key], value } }));
  const setDetail = (key: string, detail: string) =>
    setChecklist((c) => ({ ...c, [key]: { value: c[key]?.value ?? "NA", detail } }));

  const checklistComplete = isChecklistComplete(checklist);
  const nonSecured = unsecuredQuestions(checklist);

  const canSubmit = form.talentId && form.marque.trim() && !saving;

  const submit = async () => {
    if (!canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch("/api/confirmations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, checklist }),
      });
      const json = await res.json();
      if (res.ok) {
        router.push(`/confirmations/${json.id}`);
      } else {
        alert(json.error || "Erreur");
        setSaving(false);
      }
    } catch {
      alert("Erreur");
      setSaving(false);
    }
  };

  const inputCls =
    "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/confirmations" className="flex h-10 w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
          <ArrowLeft className="h-5 w-5" />
        </Link>
        <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Nouvelle demande de confirmation</h1>
      </div>

      {/* Checklist TM — AVANT l'opportunité */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 ring-1 ring-slate-200/60">
        <div className="flex items-center gap-2">
          <ClipboardCheck className="h-5 w-5 text-glowup-rose" />
          <h2 className="font-semibold text-slate-900">Checklist TM — à vérifier avant l&apos;opportunité</h2>
        </div>
        <p className="text-sm text-slate-500 mt-1 mb-4">
          Les questions que le talent posera. Passe-les en revue avant de saisir l&apos;opportunité. Non bloquant, mais recommandé de tout vérifier.
        </p>
        <div className="space-y-5">
          {CHECKLIST_SECTIONS.map((section) => (
            <div key={section}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{section}</p>
              <div className="space-y-2">
                {CHECKLIST_QUESTIONS.filter((q) => q.section === section).map((q) => {
                  const ans = checklist[q.key];
                  return (
                    <div key={q.key} className="rounded-lg border border-slate-100 bg-slate-50/50 p-3">
                      <div className="flex items-center justify-between gap-3 flex-wrap">
                        <span className="text-sm text-slate-700">{q.label}</span>
                        <div className="flex gap-1">
                          {(["OUI", "NON", "NA"] as ChecklistValue[]).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setAnswer(q.key, v)}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border transition-colors ${
                                ans?.value === v
                                  ? v === "OUI"
                                    ? "bg-emerald-500 text-white border-emerald-500"
                                    : v === "NON"
                                    ? "bg-red-500 text-white border-red-500"
                                    : "bg-slate-400 text-white border-slate-400"
                                  : "bg-white text-slate-500 border-slate-200 hover:bg-slate-100"
                              }`}
                            >
                              {v === "NA" ? "N/A" : v === "OUI" ? "Oui" : "Non"}
                            </button>
                          ))}
                        </div>
                      </div>
                      {(ans?.value === "NON" || ans?.value === "OUI") && (
                        <input
                          type="text"
                          value={ans?.detail || ""}
                          onChange={(e) => setDetail(q.key, e.target.value)}
                          placeholder="Précision (optionnel) — ex : billets réservés par l'agence"
                          className="mt-2 w-full rounded-md border border-slate-200 px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-slate-200"
                        />
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
        {nonSecured.length > 0 && (
          <div className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-xs text-amber-800">
              {nonSecured.length} point(s) non sécurisé(s) : {nonSecured.map((q) => q.label).join(", ")}. Le talent
              risque de poser la question — sécurise-les si possible avant d&apos;envoyer.
            </p>
          </div>
        )}
      </div>

      {/* L'opportunité */}
      <div className="rounded-xl border border-slate-200 bg-white p-6 ring-1 ring-slate-200/60 space-y-5">
        <div className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-glowup-rose" />
          <h2 className="font-semibold text-slate-900">L&apos;opportunité</h2>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Talent *</label>
            <select
              value={form.talentId}
              onChange={(e) => onSelectTalent(e.target.value)}
              className={inputCls}
            >
              <option value="">— Choisir —</option>
              {talents.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.prenom} {t.nom}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Marque *</label>
            <input
              type="text"
              value={form.marque}
              onChange={(e) => setForm((f) => ({ ...f, marque: e.target.value }))}
              placeholder="Ex : Samsung"
              className={inputCls}
            />
          </div>
        </div>

        {talentStats && talentStats.total > 0 && (
          <div className="rounded-lg border border-slate-200 bg-slate-50/70 p-3">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mb-2">
              <Gauge className="h-4 w-4" /> Historique de ce talent
            </div>
            <div className="flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-600">
              <span>
                Taux de confirmation :{" "}
                <strong className="text-slate-800">
                  {talentStats.confirmationRate != null ? `${talentStats.confirmationRate}%` : "—"}
                </strong>
              </span>
              <span>
                Délai moyen :{" "}
                <strong className="text-slate-800">
                  {talentStats.avgResponseHours != null
                    ? talentStats.avgResponseHours < 48
                      ? `${talentStats.avgResponseHours} h`
                      : `${Math.round(talentStats.avgResponseHours / 24)} j`
                    : "—"}
                </strong>
              </span>
              <span>
                Confirmées :{" "}
                <strong className="text-slate-800">
                  {talentStats.confirmed}/{talentStats.total}
                </strong>
              </span>
            </div>
            {talentStats.activeConfirmed > 0 && (
              <div className="mt-2 flex items-start gap-2 text-xs text-amber-800">
                <AlertTriangle className="h-3.5 w-3.5 text-amber-600 shrink-0 mt-0.5" />
                <span>
                  Déjà <strong>{talentStats.activeConfirmed} offre(s) confirmée(s)</strong> non publiée(s) — attention
                  au surbooking.
                </span>
              </div>
            )}
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 items-end">
          <div>
            <label className="text-xs font-medium text-slate-600">Budget brut (€)</label>
            <input
              type="number"
              min="0"
              value={form.budgetBrut}
              onChange={(e) => setForm((f) => ({ ...f, budgetBrut: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Commission (%)</label>
            <input
              type="number"
              min="0"
              max="100"
              value={form.commissionPercent}
              onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value }))}
              className={inputCls}
            />
          </div>
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2">
            <p className="text-xs text-emerald-700">Net pour le talent</p>
            <p className="text-lg font-bold text-emerald-700 tabular-nums">
              {new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(netPreview)}
            </p>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Livrables</label>
          <input
            type="text"
            value={form.livrables}
            onChange={(e) => setForm((f) => ({ ...f, livrables: e.target.value }))}
            placeholder="Ex : 1 Reel + 3 Story"
            className={inputCls}
          />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label className="text-xs font-medium text-slate-600">Date de tournage</label>
            <input type="date" value={form.dateTournage} onChange={(e) => setForm((f) => ({ ...f, dateTournage: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Date de publication</label>
            <input type="date" value={form.datePublication} onChange={(e) => setForm((f) => ({ ...f, datePublication: e.target.value }))} className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Ville de départ</label>
            <input type="text" value={form.villeDepart} onChange={(e) => setForm((f) => ({ ...f, villeDepart: e.target.value }))} placeholder="Paris, Toulouse…" className={inputCls} />
          </div>
          <div>
            <label className="text-xs font-medium text-slate-600">Déplacement</label>
            <select value={form.deplacement} onChange={(e) => setForm((f) => ({ ...f, deplacement: e.target.value }))} className={inputCls}>
              <option value="">—</option>
              <option value="Pris en charge">Pris en charge</option>
              <option value="À ta charge">À ta charge</option>
              <option value="Sur place / pas de déplacement">Sur place / pas de déplacement</option>
            </select>
          </div>
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Droits / exclusivité</label>
          <input type="text" value={form.droits} onChange={(e) => setForm((f) => ({ ...f, droits: e.target.value }))} placeholder="Ex : 3 mois paid social, exclu téléphonie 30j" className={inputCls} />
        </div>

        <div>
          <label className="text-xs font-medium text-slate-600">Offre réservée jusqu&apos;au (option)</label>
          <input type="date" value={form.optionUntil} onChange={(e) => setForm((f) => ({ ...f, optionUntil: e.target.value }))} className={inputCls} />
        </div>
      </div>

      <div className="flex items-center justify-end gap-3 flex-wrap">
        {!checklistComplete && (
          <p className="text-xs text-slate-400 mr-auto">Checklist incomplète — tu peux générer quand même (recommandé de tout vérifier).</p>
        )}
        <Link href="/confirmations" className="rounded-lg border border-slate-200 px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50">
          Annuler
        </Link>
        <button
          onClick={submit}
          disabled={!canSubmit}
          className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-40"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Link2 className="h-4 w-4" />}
          Créer et générer le lien
        </button>
      </div>
    </div>
  );
}
