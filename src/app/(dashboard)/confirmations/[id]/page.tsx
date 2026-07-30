"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import {
  ArrowLeft,
  Loader2,
  Copy,
  Check,
  ExternalLink,
  Clock,
  Pencil,
  X,
  Link2,
  ClipboardCheck,
  MessageCircle,
  Eye,
  EyeOff,
  ShieldCheck,
  Printer,
  AlertTriangle,
  Gauge,
} from "lucide-react";
import {
  CHECKLIST_QUESTIONS,
  CHECKLIST_SECTIONS,
  type ChecklistState,
  type ChecklistValue,
} from "@/lib/confirmation-checklist";

type Confirmation = {
  id: string;
  token: string;
  marque: string;
  budgetBrut: number;
  commissionPercent: number;
  budgetNet: number;
  livrables: string | null;
  dateTournage: string | null;
  datePublication: string | null;
  villeDepart: string | null;
  deplacement: string | null;
  droits: string | null;
  optionUntil: string | null;
  checklist: Record<string, { value: string; detail?: string }> | null;
  statut: string;
  note: string | null;
  decidedAt: string | null;
  sentAt: string | null;
  openedAt: string | null;
  openCount: number;
  lastReminderAt: string | null;
  reminderCount: number;
  confirmedSnapshot: Snapshot | null;
  talent: { id: string; prenom: string; nom: string; photo: string | null; telephone: string | null } | null;
};

type Snapshot = {
  confirmedAt: string;
  marque: string;
  budgetNet: number;
  budgetBrut: number;
  commissionPercent: number;
  livrables: string | null;
  dateTournage: string | null;
  datePublication: string | null;
  villeDepart: string | null;
  deplacement: string | null;
  droits: string | null;
  priseEnCharge: string[];
};

type TalentStats = {
  total: number;
  confirmed: number;
  refused: number;
  confirmationRate: number | null;
  avgResponseHours: number | null;
  activeConfirmed: number;
};

function waLink(phone: string | null, text: string) {
  if (!phone) return null;
  let digits = phone.replace(/[^\d]/g, "");
  if (digits.startsWith("0")) digits = "33" + digits.slice(1);
  if (!digits) return null;
  return `https://wa.me/${digits}?text=${encodeURIComponent(text)}`;
}

const PEC_LABELS: Record<string, string> = {
  vhr_transport: "Transport",
  vhr_hebergement: "Hébergement",
  vhr_repas: "Repas",
  plus_un: "+1",
};

const STATUTS: Record<string, { label: string; className: string; box: string }> = {
  EN_ATTENTE: { label: "En attente", className: "bg-blue-500/10 text-blue-600", box: "border-blue-200 bg-blue-50" },
  REFUSE: { label: "Refusé", className: "bg-slate-100 text-slate-600", box: "border-slate-200 bg-slate-50" },
  SOUS_CONDITIONS: { label: "Sous conditions", className: "bg-amber-500/10 text-amber-600", box: "border-amber-200 bg-amber-50" },
  OPTION: { label: "Option (date bloquée)", className: "bg-indigo-500/10 text-indigo-600", box: "border-indigo-200 bg-indigo-50" },
  CONFIRME: { label: "Confirmé par le talent", className: "bg-emerald-500/10 text-emerald-600", box: "border-emerald-200 bg-emerald-50" },
};

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-FR", { style: "currency", currency: "EUR", minimumFractionDigits: 0 }).format(n);
}
function fmtDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  return Number.isNaN(date.getTime()) ? null : date.toLocaleDateString("fr-FR");
}

export default function ConfirmationDetailPage() {
  const params = useParams();
  const id = params.id as string;
  const [conf, setConf] = useState<Confirmation | null>(null);
  const [stats, setStats] = useState<TalentStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState<Record<string, string>>({});
  const [checklistEdit, setChecklistEdit] = useState<ChecklistState>({});

  const load = useCallback(async () => {
    const res = await fetch(`/api/confirmations/${id}`);
    if (res.ok) {
      const data: Confirmation = await res.json();
      setConf(data);
      if (data.talent?.id) {
        fetch(`/api/confirmations/stats?talentId=${data.talent.id}`)
          .then((r) => (r.ok ? r.json() : null))
          .then((s) => s && setStats(s))
          .catch(() => {});
      }
    }
    setLoading(false);
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const url =
    conf && typeof window !== "undefined"
      ? `${window.location.origin}/confirmation/${conf.token}`
      : "";

  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      alert(url);
    }
  };

  const startEdit = () => {
    if (!conf) return;
    setForm({
      marque: conf.marque,
      budgetBrut: String(conf.budgetBrut),
      commissionPercent: String(conf.commissionPercent),
      livrables: conf.livrables || "",
      dateTournage: conf.dateTournage ? conf.dateTournage.slice(0, 10) : "",
      datePublication: conf.datePublication ? conf.datePublication.slice(0, 10) : "",
      villeDepart: conf.villeDepart || "",
      deplacement: conf.deplacement || "",
      droits: conf.droits || "",
      optionUntil: conf.optionUntil ? conf.optionUntil.slice(0, 10) : "",
    });
    setChecklistEdit((conf.checklist as ChecklistState) || {});
    setEditing(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/confirmations/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...form, checklist: checklistEdit }),
      });
      if (res.ok) {
        setEditing(false);
        await load();
      } else {
        const j = await res.json();
        alert(j.error || "Erreur");
      }
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
      </div>
    );
  }
  if (!conf) {
    return (
      <div className="py-24 text-center">
        <p className="text-slate-600 font-medium">Demande non trouvée</p>
        <Link href="/confirmations" className="mt-3 inline-flex items-center gap-2 text-sm text-slate-500 hover:text-slate-800">
          <ArrowLeft className="h-4 w-4" /> Retour
        </Link>
      </div>
    );
  }

  const st = STATUTS[conf.statut] || STATUTS.EN_ATTENTE;
  const inputCls = "mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-200";

  const waMessage =
    conf.statut === "EN_ATTENTE" && (conf.reminderCount > 0 || conf.openCount > 0)
      ? `Salut ${conf.talent?.prenom || ""} ! Petit rappel pour l'offre ${conf.marque}, tu peux répondre ici : ${url}`
      : `Salut ${conf.talent?.prenom || ""} ! J'ai une proposition ${conf.marque} pour toi, réponds directement ici : ${url}`;
  const waHref = url ? waLink(conf.talent?.telephone ?? null, waMessage) : null;
  const snap = conf.confirmedSnapshot;

  const Row = ({ label, value }: { label: string; value: string | null }) =>
    value ? (
      <div className="flex justify-between gap-4 py-2 border-b border-slate-50 last:border-0">
        <span className="text-sm text-slate-500">{label}</span>
        <span className="text-sm font-medium text-slate-800 text-right">{value}</span>
      </div>
    ) : null;

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 min-w-0">
          <Link href="/confirmations" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <h1 className="text-xl font-bold text-slate-900 truncate">
            {conf.talent ? `${conf.talent.prenom} ${conf.talent.nom}` : "Talent"} × {conf.marque}
          </h1>
        </div>
        <span className={`rounded-md px-2.5 py-1 text-xs font-medium ${st.className}`}>{st.label}</span>
      </div>

      {/* Fiabilité talent + surbooking */}
      {stats && stats.total > 1 && (
        <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
          <div className="flex items-center gap-2 mb-3">
            <Gauge className="h-5 w-5 text-glowup-rose" />
            <h2 className="font-semibold text-slate-900">Fiabilité de {conf.talent?.prenom}</h2>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-400">Taux de confirmation</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">
                {stats.confirmationRate != null ? `${stats.confirmationRate}%` : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-400">Délai moyen de réponse</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">
                {stats.avgResponseHours != null
                  ? stats.avgResponseHours < 48
                    ? `${stats.avgResponseHours} h`
                    : `${Math.round(stats.avgResponseHours / 24)} j`
                  : "—"}
              </p>
            </div>
            <div className="rounded-lg bg-slate-50 px-3 py-2">
              <p className="text-xs text-slate-400">Confirmées</p>
              <p className="text-lg font-bold text-slate-800 tabular-nums">
                {stats.confirmed}/{stats.total}
              </p>
            </div>
          </div>
          {stats.activeConfirmed > 1 && (
            <div className="mt-3 rounded-lg border border-amber-200 bg-amber-50 p-3 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0 mt-0.5" />
              <p className="text-xs text-amber-800">
                Surbooking possible : {conf.talent?.prenom} a déjà{" "}
                <strong>{stats.activeConfirmed} offres confirmées</strong> non encore publiées. Vérifie sa capacité
                avant de confirmer à la marque.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Lien */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
        <div className="flex items-center gap-2 mb-3">
          <Link2 className="h-5 w-5 text-glowup-rose" />
          <h2 className="font-semibold text-slate-900">Lien à envoyer au talent</h2>
        </div>
        <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 p-2">
          <input readOnly value={url} className="flex-1 min-w-0 bg-transparent px-2 text-sm text-slate-600 focus:outline-none truncate" />
          <button onClick={copy} className="inline-flex items-center gap-1.5 rounded-md bg-slate-900 px-3 py-1.5 text-xs font-medium text-white hover:bg-slate-800">
            {copied ? <Check className="h-3.5 w-3.5" /> : <Copy className="h-3.5 w-3.5" />}
            {copied ? "Copié" : "Copier"}
          </button>
          <a href={`${url}?preview=1`} target="_blank" rel="noreferrer" className="inline-flex items-center justify-center rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-slate-500 hover:bg-slate-50" title="Prévisualiser (ne compte pas comme vu)">
            <ExternalLink className="h-3.5 w-3.5" />
          </a>
        </div>
        {waHref ? (
          <a
            href={waHref}
            target="_blank"
            rel="noreferrer"
            className="mt-3 inline-flex items-center gap-2 rounded-lg bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1ebe5b]"
          >
            <MessageCircle className="h-4 w-4" />
            {conf.statut === "EN_ATTENTE" && (conf.reminderCount > 0 || conf.openCount > 0) ? "Relancer par WhatsApp" : "Envoyer par WhatsApp"}
          </a>
        ) : (
          <p className="text-xs text-amber-600 mt-3 flex items-center gap-1.5">
            <AlertTriangle className="h-3.5 w-3.5" /> Pas de numéro renseigné pour ce talent — copie le lien et envoie-le à la main.
          </p>
        )}
        <p className="text-xs text-slate-400 mt-2">L&apos;email est envoyé automatiquement au talent (et relancé chaque jour tant qu&apos;il n&apos;a pas répondu). Rien n&apos;est transmis à la marque tant qu&apos;il n&apos;a pas confirmé.</p>
      </div>

      {/* Décision */}
      {conf.statut === "EN_ATTENTE" ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 space-y-2">
          <div className="flex items-center gap-2">
            <Clock className="h-5 w-5 text-blue-500 shrink-0" />
            <p className="text-sm text-blue-800">
              En attente de la réponse du talent{conf.sentAt ? ` — envoyé le ${fmtDate(conf.sentAt)}` : ""}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-blue-700/90 pl-7">
            {conf.openedAt ? (
              <span className="inline-flex items-center gap-1 font-medium text-emerald-700">
                <Eye className="h-3.5 w-3.5" /> Vu le {fmtDate(conf.openedAt)}
                {conf.openCount > 1 ? ` (${conf.openCount}×)` : ""}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1">
                <EyeOff className="h-3.5 w-3.5" /> Pas encore ouvert
              </span>
            )}
            <span>
              Relances email : {conf.reminderCount}
              {conf.lastReminderAt ? ` · dernière le ${fmtDate(conf.lastReminderAt)}` : ""}
            </span>
          </div>
        </div>
      ) : (
        <div className={`rounded-xl border p-4 ${st.box}`}>
          <p className="text-sm font-semibold text-slate-900">Réponse : {st.label}</p>
          {conf.decidedAt && (
            <p className="text-xs text-slate-500 mt-0.5">
              le {new Date(conf.decidedAt).toLocaleDateString("fr-FR")} à {new Date(conf.decidedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </p>
          )}
          {conf.note && <p className="text-sm text-slate-700 mt-2 italic">« {conf.note} »</p>}
          {conf.statut !== "CONFIRME" && (
            <p className="text-xs text-slate-500 mt-2">⚠️ Non confirmé → ne rien transmettre à la marque.</p>
          )}
        </div>
      )}

      {/* Preuve de confirmation horodatée */}
      {conf.statut === "CONFIRME" && snap && (
        <div className="rounded-xl border border-emerald-200 bg-white p-5 ring-1 ring-emerald-200/60 print-receipt">
          <div className="flex items-center justify-between gap-3 mb-3">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5 text-emerald-600" />
              <h2 className="font-semibold text-slate-900">Preuve de confirmation</h2>
            </div>
            <button
              onClick={() => window.print()}
              className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 print:hidden"
            >
              <Printer className="h-3.5 w-3.5" /> Imprimer / PDF
            </button>
          </div>
          <p className="text-sm text-slate-700">
            <strong>
              {conf.talent ? `${conf.talent.prenom} ${conf.talent.nom}` : "Le talent"}
            </strong>{" "}
            a confirmé ces termes exacts le{" "}
            <strong>
              {new Date(snap.confirmedAt).toLocaleDateString("fr-FR")} à{" "}
              {new Date(snap.confirmedAt).toLocaleTimeString("fr-FR", { hour: "2-digit", minute: "2-digit" })}
            </strong>
            .
          </p>
          <div className="mt-3 rounded-lg bg-emerald-50/60 border border-emerald-100 px-4 py-3">
            <Row label="Marque" value={snap.marque} />
            <Row label="Net accepté" value={fmtMoney(snap.budgetNet)} />
            <Row label="Livrables" value={snap.livrables} />
            <Row label="Tournage" value={fmtDate(snap.dateTournage)} />
            <Row label="Publication" value={fmtDate(snap.datePublication)} />
            <Row label="Ville de départ" value={snap.villeDepart} />
            <Row label="Déplacement" value={snap.deplacement} />
            <Row
              label="Pris en charge"
              value={snap.priseEnCharge?.length ? snap.priseEnCharge.map((k) => PEC_LABELS[k] || k).join(" · ") : null}
            />
            <Row label="Droits / exclusivité" value={snap.droits} />
          </div>
          <p className="text-xs text-slate-400 mt-2">
            Termes figés au moment du « Je confirme » — inchangés même si l&apos;offre est éditée ensuite. À garder
            comme preuve en cas de rétractation.
          </p>
        </div>
      )}

      {/* Offre */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
        <div className="flex items-center justify-between mb-3">
          <h2 className="font-semibold text-slate-900">L&apos;offre</h2>
          {!editing ? (
            <button onClick={startEdit} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
              <Pencil className="h-4 w-4" /> Modifier
            </button>
          ) : (
            <button onClick={() => setEditing(false)} className="inline-flex items-center gap-1.5 text-sm font-medium text-slate-500 hover:text-slate-800">
              <X className="h-4 w-4" /> Annuler
            </button>
          )}
        </div>

        {!editing ? (
          <div>
            <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-4 py-3 mb-3">
              <p className="text-xs text-emerald-700">Net pour le talent</p>
              <p className="text-2xl font-bold text-emerald-700 tabular-nums">{fmtMoney(conf.budgetNet)}</p>
              <p className="text-xs text-emerald-600/70 mt-0.5">
                Brut {fmtMoney(conf.budgetBrut)} · commission {conf.commissionPercent}%
              </p>
            </div>
            <Row label="Livrables" value={conf.livrables} />
            <Row label="Tournage" value={fmtDate(conf.dateTournage)} />
            <Row label="Publication" value={fmtDate(conf.datePublication)} />
            <Row label="Ville de départ" value={conf.villeDepart} />
            <Row label="Déplacement" value={conf.deplacement} />
            <Row label="Droits / exclusivité" value={conf.droits} />
            <Row label="Option jusqu'au" value={fmtDate(conf.optionUntil)} />
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Brut (€)</label>
                <input type="number" value={form.budgetBrut} onChange={(e) => setForm((f) => ({ ...f, budgetBrut: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Commission (%)</label>
                <input type="number" value={form.commissionPercent} onChange={(e) => setForm((f) => ({ ...f, commissionPercent: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Marque</label>
                <input type="text" value={form.marque} onChange={(e) => setForm((f) => ({ ...f, marque: e.target.value }))} className={inputCls} />
              </div>
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Livrables</label>
              <input type="text" value={form.livrables} onChange={(e) => setForm((f) => ({ ...f, livrables: e.target.value }))} className={inputCls} />
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="text-xs font-medium text-slate-600">Tournage</label>
                <input type="date" value={form.dateTournage} onChange={(e) => setForm((f) => ({ ...f, dateTournage: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Publication</label>
                <input type="date" value={form.datePublication} onChange={(e) => setForm((f) => ({ ...f, datePublication: e.target.value }))} className={inputCls} />
              </div>
              <div>
                <label className="text-xs font-medium text-slate-600">Ville de départ</label>
                <input type="text" value={form.villeDepart} onChange={(e) => setForm((f) => ({ ...f, villeDepart: e.target.value }))} className={inputCls} />
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
              <input type="text" value={form.droits} onChange={(e) => setForm((f) => ({ ...f, droits: e.target.value }))} className={inputCls} />
            </div>
            <div>
              <label className="text-xs font-medium text-slate-600">Option jusqu&apos;au</label>
              <input type="date" value={form.optionUntil} onChange={(e) => setForm((f) => ({ ...f, optionUntil: e.target.value }))} className={inputCls} />
            </div>
            <button onClick={save} disabled={saving} className="inline-flex items-center gap-2 rounded-lg bg-slate-900 px-5 py-2.5 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-50">
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />}
              Enregistrer
            </button>
          </div>
        )}
      </div>

      {/* Checklist TM */}
      <div className="rounded-xl border border-slate-200 bg-white p-5 ring-1 ring-slate-200/60">
        <div className="flex items-center gap-2 mb-3">
          <ClipboardCheck className="h-5 w-5 text-glowup-rose" />
          <h2 className="font-semibold text-slate-900">Checklist TM</h2>
        </div>
        <div className="space-y-4">
          {CHECKLIST_SECTIONS.map((section) => (
            <div key={section}>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400 mb-2">{section}</p>
              <div className="space-y-1.5">
                {CHECKLIST_QUESTIONS.filter((q) => q.section === section).map((q) => {
                  const source = editing ? checklistEdit : (conf.checklist as ChecklistState | null);
                  const ans = source?.[q.key];
                  return (
                    <div key={q.key} className="flex items-center justify-between gap-3 rounded-lg border border-slate-100 bg-slate-50/50 px-3 py-2 flex-wrap">
                      <span className="text-sm text-slate-700">{q.label}</span>
                      {editing ? (
                        <div className="flex gap-1">
                          {(["OUI", "NON", "NA"] as ChecklistValue[]).map((v) => (
                            <button
                              key={v}
                              type="button"
                              onClick={() => setChecklistEdit((c) => ({ ...c, [q.key]: { ...c[q.key], value: v } }))}
                              className={`px-2.5 py-1 rounded-md text-xs font-medium border ${
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
                      ) : (
                        <span
                          className={`text-xs font-medium px-2 py-0.5 rounded ${
                            ans?.value === "OUI"
                              ? "bg-emerald-500/10 text-emerald-600"
                              : ans?.value === "NON"
                              ? "bg-red-500/10 text-red-600"
                              : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {ans?.value ? (ans.value === "NA" ? "N/A" : ans.value === "OUI" ? "Oui" : "Non") : "—"}
                          {ans?.detail ? ` · ${ans.detail}` : ""}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
