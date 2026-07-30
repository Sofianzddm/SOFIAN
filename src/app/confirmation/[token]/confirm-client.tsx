"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Loader2,
  CheckCircle2,
  XCircle,
  Clock,
  AlertCircle,
  MapPin,
  Calendar,
  Package,
  ShieldCheck,
  Plane,
} from "lucide-react";
import { GlowUpLogo } from "@/components/ui/logo";
import { TALENT_RECAP_QUESTIONS } from "@/lib/confirmation-checklist";

type Offer = {
  talent: { prenom: string; photo: string | null };
  marque: string;
  budgetNet: number;
  livrables: string | null;
  dateTournage: string | null;
  datePublication: string | null;
  villeDepart: string | null;
  deplacement: string | null;
  droits: string | null;
  optionUntil: string | null;
  checklist: Record<string, { value: string; detail?: string }> | null;
  statut: string | null;
  decidedAt: string | null;
  note: string | null;
};

const PRISE_EN_CHARGE_LABELS: Record<string, string> = {
  vhr_transport: "Transport",
  vhr_hebergement: "Hébergement",
  vhr_repas: "Repas",
  plus_un: "+1",
};

type Statut = "REFUSE" | "SOUS_CONDITIONS" | "OPTION" | "CONFIRME";

function fmtMoney(n: number) {
  return new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
    minimumFractionDigits: 0,
  }).format(n);
}

function fmtDate(d: string | null) {
  if (!d) return null;
  const date = new Date(d);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString("fr-FR", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
}

const DECISION_META: Record<Statut, { label: string; className: string; icon: typeof CheckCircle2 }> = {
  REFUSE: { label: "Refuser", className: "border-slate-300 text-slate-700", icon: XCircle },
  SOUS_CONDITIONS: { label: "Intéressé, sous conditions", className: "border-amber-300 text-amber-700", icon: AlertCircle },
  OPTION: { label: "Option (bloque la date)", className: "border-blue-300 text-blue-700", icon: Clock },
  CONFIRME: { label: "Je confirme", className: "border-emerald-400 text-emerald-700", icon: CheckCircle2 },
};

export function ConfirmationClient({ token, preview = false }: { token: string; preview?: boolean }) {
  const [offer, setOffer] = useState<Offer | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [choice, setChoice] = useState<Statut | null>(null);
  const [note, setNote] = useState("");
  const [attested, setAttested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState<Statut | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/pub/confirmation/${token}${preview ? "?preview=1" : ""}`, { cache: "no-store" });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Lien invalide");
      setOffer(json as Offer);
      if (json.statut && json.statut !== "EN_ATTENTE") setDone(json.statut as Statut);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setLoading(false);
    }
  }, [token, preview]);

  useEffect(() => {
    load();
  }, [load]);

  const livrablesSummary = offer?.livrables?.trim() || "";

  const priseEnCharge = useMemo(() => {
    if (!offer?.checklist) return null;
    const items = Object.keys(PRISE_EN_CHARGE_LABELS)
      .filter((k) => offer.checklist?.[k]?.value === "OUI")
      .map((k) => PRISE_EN_CHARGE_LABELS[k]);
    return items.length ? items.join(" · ") : null;
  }, [offer]);

  const recap = useMemo(() => {
    if (!offer?.checklist) return [];
    return TALENT_RECAP_QUESTIONS.map((q) => {
      const ans = offer.checklist?.[q.key];
      return ans?.value ? { key: q.key, label: q.talentLabel || q.label, ...ans } : null;
    }).filter((x): x is { key: string; label: string; value: string; detail?: string } => x !== null);
  }, [offer]);

  const attestationText = useMemo(() => {
    if (!offer) return "";
    const parts: string[] = [];
    const tournage = fmtDate(offer.dateTournage);
    if (tournage) parts.push(`je suis dispo pour le tournage ${tournage}`);
    parts.push(`j'accepte ${fmtMoney(offer.budgetNet)} net`);
    if (livrablesSummary) parts.push(`pour ${livrablesSummary}`);
    if (offer.villeDepart) parts.push(`au départ de ${offer.villeDepart}`);
    return `Je confirme que ${parts.join(", ")}.`;
  }, [offer, livrablesSummary]);

  const canSubmit =
    choice === "REFUSE" ||
    choice === "OPTION" ||
    (choice === "SOUS_CONDITIONS" && note.trim().length > 0) ||
    (choice === "CONFIRME" && attested);

  const submit = async () => {
    if (!choice || !canSubmit) return;
    setSaving(true);
    try {
      const res = await fetch(`/api/pub/confirmation/${token}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ statut: choice, note: choice === "SOUS_CONDITIONS" ? note : null }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json.error || "Erreur");
      setDone(choice);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="h-8 w-8 animate-spin text-glowup-rose" />
      </div>
    );
  }

  if (error && !offer) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-3 bg-slate-50 p-6 text-center">
        <XCircle className="h-10 w-10 text-red-400" />
        <p className="font-medium text-slate-800">{error}</p>
        <p className="text-sm text-slate-500">Ce lien n&apos;est plus valide. Contacte ton agence.</p>
      </div>
    );
  }

  if (!offer) return null;

  const InfoRow = ({
    icon: Icon,
    label,
    value,
  }: {
    icon: typeof Calendar;
    label: string;
    value: string | null;
  }) =>
    value ? (
      <div className="flex items-start gap-3 py-2.5">
        <Icon className="h-4 w-4 shrink-0 text-slate-400 mt-0.5" />
        <div className="min-w-0">
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-sm font-medium text-slate-800 capitalize">{value}</p>
        </div>
      </div>
    ) : null;

  return (
    <div className="min-h-screen bg-slate-50 pb-16">
      <div className="mx-auto max-w-md px-4 pt-8">
        <div className="flex justify-center mb-6">
          <GlowUpLogo className="h-8 w-auto" />
        </div>

        {/* Décision déjà prise */}
        {done && (
          <div className="mb-5 rounded-2xl border border-slate-200 bg-white p-5 text-center shadow-sm">
            <div className="flex justify-center mb-2">
              {done === "CONFIRME" ? (
                <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              ) : done === "REFUSE" ? (
                <XCircle className="h-10 w-10 text-slate-400" />
              ) : done === "OPTION" ? (
                <Clock className="h-10 w-10 text-blue-500" />
              ) : (
                <AlertCircle className="h-10 w-10 text-amber-500" />
              )}
            </div>
            <p className="font-semibold text-slate-900">{DECISION_META[done].label}</p>
            <p className="text-sm text-slate-500 mt-1">
              Ta réponse a bien été transmise à ton agence.
            </p>
            <button
              onClick={() => {
                setDone(null);
                setChoice(null);
                setAttested(false);
                setNote("");
              }}
              className="mt-4 text-sm font-medium text-slate-500 underline underline-offset-2 hover:text-slate-700"
            >
              Modifier ma réponse
            </button>
          </div>
        )}

        {!done && (
          <>
            <h1 className="text-xl font-bold text-slate-900">
              Salut {offer.talent.prenom} 👋
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              Voici une proposition. Prends 30 secondes pour vérifier les conditions
              avant de répondre.
            </p>

            {/* L'offre */}
            <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
              <div className="bg-gradient-to-br from-glowup-rose/10 to-pink-50 px-5 py-4 border-b border-slate-100">
                <p className="text-xs font-medium uppercase tracking-wider text-glowup-rose">
                  {offer.marque}
                </p>
                <p className="text-3xl font-bold text-slate-900 tabular-nums mt-1">
                  {fmtMoney(offer.budgetNet)}
                  <span className="text-sm font-medium text-slate-400"> net pour toi</span>
                </p>
                {livrablesSummary && (
                  <p className="text-sm text-slate-600 mt-1">{livrablesSummary}</p>
                )}
              </div>
              <div className="px-5 py-1 divide-y divide-slate-50">
                <InfoRow icon={Calendar} label="Tournage" value={fmtDate(offer.dateTournage)} />
                <InfoRow icon={Calendar} label="Publication" value={fmtDate(offer.datePublication)} />
                <InfoRow icon={MapPin} label="Ville de départ" value={offer.villeDepart} />
                <InfoRow icon={Plane} label="Déplacement" value={offer.deplacement} />
                <InfoRow icon={Plane} label="Pris en charge" value={priseEnCharge} />
                <InfoRow icon={ShieldCheck} label="Droits / exclusivité" value={offer.droits} />
                {offer.optionUntil && (
                  <InfoRow
                    icon={Clock}
                    label="Cette offre t'est réservée jusqu'au"
                    value={fmtDate(offer.optionUntil)}
                  />
                )}
                {!offer.dateTournage &&
                  !offer.datePublication &&
                  !offer.villeDepart &&
                  !offer.deplacement &&
                  !offer.droits && (
                    <div className="flex items-center gap-2 py-3 text-sm text-slate-400">
                      <Package className="h-4 w-4" /> Détails à préciser par ton agence
                    </div>
                  )}
              </div>
            </div>

            {/* Récap des questions déjà répondues par l'agence */}
            {recap.length > 0 && (
              <div className="mt-5 rounded-2xl border border-slate-200 bg-white shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b border-slate-100">
                  <p className="text-sm font-semibold text-slate-900">Déjà vérifié pour toi</p>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Les points souvent oubliés, déjà cadrés par ton agence.
                  </p>
                </div>
                <div className="px-5 py-1 divide-y divide-slate-50">
                  {recap.map((r) => (
                    <div key={r.key} className="flex items-start justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="text-sm text-slate-700">{r.label}</p>
                        {r.detail ? (
                          <p className="text-xs text-slate-400 mt-0.5">{r.detail}</p>
                        ) : null}
                      </div>
                      <span
                        className={`shrink-0 text-xs font-semibold px-2 py-0.5 rounded ${
                          r.value === "OUI"
                            ? "bg-emerald-500/10 text-emerald-600"
                            : r.value === "NON"
                            ? "bg-red-500/10 text-red-600"
                            : "bg-slate-100 text-slate-500"
                        }`}
                      >
                        {r.value === "NA" ? "N/A" : r.value === "OUI" ? "Oui" : "Non"}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Décision */}
            <div className="mt-6">
              <p className="text-sm font-semibold text-slate-900 mb-3">Ta décision</p>
              <div className="grid grid-cols-1 gap-2.5">
                {(Object.keys(DECISION_META) as Statut[]).map((s) => {
                  const meta = DECISION_META[s];
                  const Icon = meta.icon;
                  const active = choice === s;
                  return (
                    <button
                      key={s}
                      onClick={() => setChoice(s)}
                      className={`flex items-center gap-3 rounded-xl border-2 bg-white px-4 py-3.5 text-left transition-all ${
                        active
                          ? `${meta.className} ring-2 ring-offset-1 ring-slate-200`
                          : "border-slate-200 text-slate-600 hover:border-slate-300"
                      }`}
                    >
                      <Icon className="h-5 w-5 shrink-0" />
                      <span className="text-sm font-medium">{meta.label}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Contexte selon le choix */}
            {choice === "SOUS_CONDITIONS" && (
              <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <label className="text-sm font-medium text-amber-900">
                  Qu&apos;est-ce qui bloque ?
                </label>
                <textarea
                  value={note}
                  onChange={(e) => setNote(e.target.value)}
                  rows={3}
                  placeholder="Ex : je dois checker mon agenda, le budget, la date de tournage…"
                  className="mt-2 w-full rounded-lg border border-amber-200 bg-white px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-amber-200"
                />
              </div>
            )}

            {choice === "OPTION" && (
              <div className="mt-4 rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-800">
                On bloque la date{offer.optionUntil ? ` jusqu'au ${fmtDate(offer.optionUntil)}` : ""}, sans
                rien confirmer à la marque. Tu confirmes définitivement plus tard.
              </div>
            )}

            {choice === "CONFIRME" && (
              <div className="mt-4 rounded-xl border-2 border-emerald-300 bg-emerald-50 p-4">
                <label className="flex items-start gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={attested}
                    onChange={(e) => setAttested(e.target.checked)}
                    className="mt-0.5 h-5 w-5 shrink-0 rounded border-emerald-300 text-emerald-600 focus:ring-emerald-400"
                  />
                  <span className="text-sm text-emerald-900">{attestationText}</span>
                </label>
              </div>
            )}

            {/* Envoyer */}
            {choice && (
              <button
                onClick={submit}
                disabled={!canSubmit || saving}
                className="mt-5 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Envoyer ma réponse
              </button>
            )}

            <p className="mt-4 text-center text-xs text-slate-400">
              Tant que tu n&apos;as pas cliqué <span className="font-semibold">Je confirme</span>,
              rien n&apos;est transmis à la marque.
            </p>
          </>
        )}
      </div>
    </div>
  );
}
