"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  AlertTriangle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  Send,
  Sparkles,
  X,
} from "lucide-react";

interface AnalyseIA {
  fournisseur?: string | null;
  montantTTC?: number | null;
  montantTVA?: number | null;
  tauxTVA?: number | null;
  date?: string | null;
  categorie?: string | null;
}

interface DepenseInfo {
  id: string;
  fournisseur: string | null;
  categorie: string | null;
  montantTTC: number | string;
  montantTVA: number | string | null;
  tauxTVA: number | string | null;
  dateDepense: string;
  justificatifUrl: string | null;
  analyseIA?: AnalyseIA | null;
}

interface TransactionDebit {
  id: string;
  montant: number | string;
  libelle: string | null;
  emetteur: string | null;
  dateTransaction: string;
  depense: DepenseInfo | null;
}

interface HorsBanque extends DepenseInfo {
  libelle: string | null;
}

const CATEGORIES = [
  "Logiciels & abonnements",
  "Déplacements",
  "Restauration",
  "Matériel",
  "Marketing & communication",
  "Prestataires & freelances",
  "Événements",
  "Salaires & charges",
  "Frais bancaires",
  "Impôts & taxes",
  "Loyer & bureaux",
  "Autres",
];

function toNumber(v: number | string | null | undefined): number {
  if (v === null || v === undefined) return 0;
  const n = typeof v === "number" ? v : Number(v);
  return Number.isFinite(n) ? n : 0;
}

const formatMoney = (value: number) =>
  new Intl.NumberFormat("fr-FR", {
    style: "currency",
    currency: "EUR",
  }).format(value);

const formatDate = (dateStr: string) =>
  new Date(dateStr).toLocaleDateString("fr-FR", {
    day: "numeric",
    month: "short",
  });

/**
 * Compresse une photo côté client (canvas) avant l'upload : max 1600px de
 * large, JPEG qualité 0.85. En cas d'échec (PDF, HEIC non décodable…),
 * renvoie le fichier original.
 */
async function compressImage(file: File): Promise<File> {
  if (!file.type.startsWith("image/")) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const maxWidth = 1600;
    const scale = Math.min(1, maxWidth / bitmap.width);
    if (scale === 1 && file.size < 2 * 1024 * 1024) return file;

    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/jpeg", 0.85)
    );
    if (!blob) return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".jpg", {
      type: "image/jpeg",
    });
  } catch {
    return file;
  }
}

/** Photo prise, en attente de confirmation d'envoi */
interface PendingPhoto {
  file: File;
  preview: string | null;
  /** Transaction bancaire ciblée — null pour un reçu hors banque */
  tx: TransactionDebit | null;
}

/** Dépense envoyée, en cours de vérification par l'utilisateur */
interface VerifyState {
  depense: DepenseInfo;
  /** Montant débité en banque (null pour un reçu hors banque) */
  txMontant: number | null;
  preview: string | null;
  // Champs éditables
  fournisseur: string;
  categorie: string;
  montantTTC: string;
  montantTVA: string;
}

export default function MobileDepensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionDebit[]>([]);
  const [horsBanque, setHorsBanque] = useState<HorsBanque[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [showJustifiees, setShowJustifiees] = useState(false);

  // Parcours photo : prise → aperçu (pending) → envoi → vérification (verify)
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetTx = useRef<TransactionDebit | null>(null);
  const [pending, setPending] = useState<PendingPhoto | null>(null);
  // Montant saisi à la main (secours si l'IA ne le lit pas — hors banque)
  const [pendingMontant, setPendingMontant] = useState("");
  const [sending, setSending] = useState(false);
  const [verify, setVerify] = useState<VerifyState | null>(null);
  const [verifySaving, setVerifySaving] = useState(false);

  useEffect(() => {
    if (status === "unauthenticated") {
      router.push("/login?callbackUrl=/mobile");
    }
  }, [status, router]);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch("/api/depenses?periodDays=90");
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        setError(data.error || "Erreur de chargement");
        return;
      }
      const data = await res.json();
      setTransactions(data.transactions || []);
      setHorsBanque(data.horsBanque || []);
      setError(null);
    } catch {
      setError("Erreur de chargement");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (status === "authenticated") void fetchData();
  }, [status, fetchData]);

  // Temps réel : sync Qonto silencieuse à l'ouverture de l'app, puis
  // rafraîchissement quand on revient dessus (PWA remise au premier plan).
  useEffect(() => {
    if (status !== "authenticated") return;
    let cancelled = false;

    const silentSync = async () => {
      try {
        await fetch("/api/qonto/sync", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ daysBack: 7 }),
        });
        if (!cancelled) await fetchData();
      } catch {
        // silencieux : le bouton actualiser reste disponible
      }
    };
    void silentSync();

    const onVisible = () => {
      if (document.visibilityState === "visible") void silentSync();
    };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      cancelled = true;
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [status, fetchData]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await fetch("/api/qonto/sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ daysBack: 90 }),
      }).catch(() => {});
      await fetchData();
    } finally {
      setRefreshing(false);
    }
  };

  // ——— Étape 1 : prise de photo → aperçu ———

  const takePhotoFor = (tx: TransactionDebit | null) => {
    targetTx.current = tx;
    fileInputRef.current?.click();
  };

  const onPhotoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    const tx = targetTx.current;
    e.target.value = "";
    targetTx.current = null;
    if (!file) return;
    setPending({
      file,
      preview: file.type.startsWith("image/") ? URL.createObjectURL(file) : null,
      tx,
    });
  };

  const cancelPending = () => {
    if (pending?.preview) URL.revokeObjectURL(pending.preview);
    setPending(null);
    setPendingMontant("");
    setError(null);
  };

  const retakePending = () => {
    const tx = pending?.tx ?? null;
    cancelPending();
    // Rouvrir la caméra après fermeture de l'aperçu
    setTimeout(() => takePhotoFor(tx), 50);
  };

  // ——— Étape 2 : envoi → écran de vérification ———

  const openVerify = (depense: DepenseInfo, txMontant: number | null, preview: string | null) => {
    setVerify({
      depense,
      txMontant,
      preview,
      fournisseur: depense.fournisseur ?? "",
      categorie: depense.categorie ?? "",
      montantTTC:
        toNumber(depense.montantTTC) > 0 ? String(toNumber(depense.montantTTC)) : "",
      montantTVA:
        depense.montantTVA !== null && depense.montantTVA !== ""
          ? String(toNumber(depense.montantTVA))
          : "",
    });
  };

  const sendPending = async () => {
    if (!pending) return;
    setSending(true);
    setError(null);
    try {
      const file = await compressImage(pending.file);
      const formData = new FormData();
      formData.append("file", file);

      let res: Response;
      if (pending.tx) {
        if (pending.tx.depense) {
          res = await fetch(`/api/depenses/${pending.tx.depense.id}`, {
            method: "PATCH",
            body: formData,
          });
        } else {
          formData.append("transactionId", pending.tx.id);
          res = await fetch("/api/depenses", { method: "POST", body: formData });
        }
      } else {
        // Reçu hors banque : l'IA lit montant / date / fournisseur sur la
        // photo ; le montant saisi à la main (si fourni) fait foi.
        if (pendingMontant.trim()) {
          formData.append("montantTTC", pendingMontant);
        }
        res = await fetch("/api/depenses", { method: "POST", body: formData });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'envoi");
        return;
      }

      const depense = data.depense as DepenseInfo;
      const txId = pending.tx?.id ?? null;
      if (txId) {
        setTransactions((list) =>
          list.map((t) => (t.id === txId ? { ...t, depense } : t))
        );
      } else {
        await fetchData();
      }

      // Étape vérification : montants lus par l'IA, corrigeables
      openVerify(
        depense,
        pending.tx ? Math.abs(toNumber(pending.tx.montant)) : null,
        pending.preview
      );
      setPending(null);
      setPendingMontant("");
    } catch {
      setError("Erreur lors de l'envoi");
    } finally {
      setSending(false);
    }
  };

  // ——— Étape 3 : validation (corrections éventuelles) ———

  const closeVerify = () => {
    if (verify?.preview) URL.revokeObjectURL(verify.preview);
    setVerify(null);
  };

  const saveVerify = async () => {
    if (!verify) return;
    setVerifySaving(true);
    setError(null);
    try {
      const payload: Record<string, unknown> = {
        fournisseur: verify.fournisseur,
        categorie: verify.categorie,
        montantTVA: verify.montantTVA === "" ? null : Number(verify.montantTVA.replace(",", ".")),
      };
      // Le montant TTC n'est éditable que pour un reçu hors banque
      // (pour une transaction bancaire, le débit fait foi).
      if (verify.txMontant === null && verify.montantTTC.trim()) {
        payload.montantTTC = Number(verify.montantTTC.replace(",", "."));
      }

      const res = await fetch(`/api/depenses/${verify.depense.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'enregistrement");
        return;
      }
      await fetchData();
      closeVerify();
      setToast("Dépense enregistrée ✓");
    } catch {
      setError("Erreur lors de l'enregistrement");
    } finally {
      setVerifySaving(false);
    }
  };

  // ——— Rendu ———

  if (status === "loading" || (status === "authenticated" && loading)) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-slate-400" />
      </div>
    );
  }

  if (status === "unauthenticated") return null;

  if (session?.user?.role !== "ADMIN") {
    return (
      <div className="flex min-h-screen items-center justify-center p-6">
        <div className="text-center">
          <AlertCircle className="mx-auto mb-3 h-12 w-12 text-slate-400" />
          <p className="text-lg font-semibold text-slate-800">Accès réservé</p>
          <p className="mt-1 text-sm text-slate-500">
            Cette application est réservée aux administrateurs.
          </p>
        </div>
      </div>
    );
  }

  const aJustifier = transactions.filter((t) => !t.depense?.justificatifUrl);
  const justifiees = transactions.filter((t) => t.depense?.justificatifUrl);
  const totalAJustifier = aJustifier.reduce(
    (s, t) => s + Math.abs(toNumber(t.montant)),
    0
  );

  // Écart montant lu / montant banque sur l'écran de vérification
  const montantLu = verify?.montantTTC ? Number(verify.montantTTC.replace(",", ".")) : null;
  const ecartVerify =
    verify && verify.txMontant !== null && montantLu !== null && Number.isFinite(montantLu)
      ? Math.abs(montantLu - verify.txMontant)
      : verify && verify.txMontant !== null && verify.depense.analyseIA?.montantTTC
        ? Math.abs(toNumber(verify.depense.analyseIA.montantTTC) - verify.txMontant)
        : 0;

  return (
    <div className="mx-auto max-w-lg pb-28">
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*,application/pdf"
        capture="environment"
        className="hidden"
        onChange={onPhotoPicked}
      />

      {/* Header sticky */}
      <header
        className="sticky top-0 z-20 border-b border-slate-200 bg-white/90 px-4 pb-3 backdrop-blur"
        style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}
      >
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-lg font-semibold text-slate-900">Dépenses</h1>
            <p className="text-xs text-slate-500">
              {aJustifier.length === 0
                ? "Tout est justifié 🎉"
                : `${aJustifier.length} reçu${aJustifier.length > 1 ? "s" : ""} à photographier · ${formatMoney(totalAJustifier)}`}
            </p>
          </div>
          <button
            onClick={refresh}
            disabled={refreshing}
            className="rounded-full bg-slate-100 p-2.5 text-slate-600 active:bg-slate-200 disabled:opacity-50"
            aria-label="Actualiser"
          >
            <RefreshCw className={`h-5 w-5 ${refreshing ? "animate-spin" : ""}`} />
          </button>
        </div>
      </header>

      {error && (
        <div className="mx-4 mt-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
          <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
          <span className="flex-1">{error}</span>
          <button onClick={() => setError(null)}>
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* À justifier */}
      <section className="px-4 pt-4">
        {aJustifier.length === 0 ? (
          <div className="rounded-2xl border border-slate-200 bg-white px-4 py-12 text-center">
            <CheckCircle2 className="mx-auto mb-3 h-12 w-12 text-emerald-500" />
            <p className="font-medium text-slate-900">Aucun reçu en attente</p>
            <p className="mt-1 text-sm text-slate-500">
              Toutes les dépenses des 3 derniers mois sont justifiées.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {aJustifier.map((tx) => (
              <div
                key={tx.id}
                className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate font-medium text-slate-900">
                      {tx.emetteur || tx.libelle || "—"}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {formatDate(tx.dateTransaction)}
                      {tx.emetteur && tx.libelle ? ` · ${tx.libelle}` : ""}
                    </p>
                  </div>
                  <p className="whitespace-nowrap font-semibold tabular-nums text-red-600">
                    −{formatMoney(Math.abs(toNumber(tx.montant)))}
                  </p>
                </div>
                <button
                  onClick={() => takePhotoFor(tx)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white active:bg-slate-700"
                >
                  <Camera className="h-5 w-5" />
                  Photographier le reçu
                </button>
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Reçus hors banque en attente */}
      {horsBanque.length > 0 && (
        <section className="px-4 pt-6">
          <h2 className="mb-2 px-1 text-xs font-semibold uppercase tracking-wide text-slate-500">
            Reçus hors banque ({horsBanque.length})
          </h2>
          <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
            {horsBanque.map((d) => (
              <div key={d.id} className="flex items-center gap-3 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-slate-900">
                    {d.fournisseur || d.libelle || "—"}
                  </p>
                  <p className="text-xs text-slate-500">{formatDate(d.dateDepense)}</p>
                </div>
                <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-slate-700">
                  −{formatMoney(Math.abs(toNumber(d.montantTTC)))}
                </p>
                {d.justificatifUrl && (
                  <a
                    href={d.justificatifUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="text-slate-400"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </a>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      {/* Justifiées (repliées) */}
      {justifiees.length > 0 && (
        <section className="px-4 pt-6">
          <button
            onClick={() => setShowJustifiees((v) => !v)}
            className="flex w-full items-center justify-between px-1 py-1"
          >
            <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Justifiées ({justifiees.length})
            </h2>
            {showJustifiees ? (
              <ChevronUp className="h-4 w-4 text-slate-400" />
            ) : (
              <ChevronDown className="h-4 w-4 text-slate-400" />
            )}
          </button>
          {showJustifiees && (
            <div className="mt-2 divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
              {justifiees.map((tx) => (
                <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                  <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-slate-700">
                      {tx.depense?.fournisseur || tx.emetteur || tx.libelle || "—"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(tx.dateTransaction)}
                      {tx.depense?.categorie ? ` · ${tx.depense.categorie}` : ""}
                    </p>
                  </div>
                  <p className="whitespace-nowrap text-sm tabular-nums text-slate-500">
                    −{formatMoney(Math.abs(toNumber(tx.montant)))}
                  </p>
                  {tx.depense?.justificatifUrl && (
                    <a
                      href={tx.depense.justificatifUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="text-slate-400"
                    >
                      <ExternalLink className="h-4 w-4" />
                    </a>
                  )}
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Bouton flottant : reçu hors banque (photo directe, l'IA lit tout) */}
      <button
        onClick={() => takePhotoFor(null)}
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg active:bg-slate-700"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Photographier un reçu hors banque"
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* ——— Étape 1 : aperçu avant envoi ——— */}
      {pending && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
          >
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                {pending.tx
                  ? `Reçu pour ${pending.tx.emetteur || pending.tx.libelle || "la dépense"}`
                  : "Reçu hors banque"}
              </h3>
              <button onClick={cancelPending} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            {pending.tx && (
              <p className="mb-3 text-sm text-slate-500">
                Débit bancaire :{" "}
                <span className="font-semibold text-slate-900">
                  {formatMoney(Math.abs(toNumber(pending.tx.montant)))}
                </span>{" "}
                le {formatDate(pending.tx.dateTransaction)}
              </p>
            )}

            <div className="mb-4 flex max-h-72 items-center justify-center overflow-hidden rounded-2xl bg-slate-100">
              {pending.preview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={pending.preview}
                  alt="Aperçu du reçu"
                  className="max-h-72 w-auto object-contain"
                />
              ) : (
                <p className="py-10 text-sm text-slate-500">{pending.file.name}</p>
              )}
            </div>

            {error && (
              <div className="mb-3 flex items-start gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-sm text-red-700">
                <AlertCircle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>{error}</span>
              </div>
            )}

            {/* Hors banque : montant de secours si le reçu est illisible.
                Vide = lu automatiquement sur la photo. */}
            {!pending.tx && (error || pendingMontant) && (
              <div className="mb-3">
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Montant TTC (€)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={pendingMontant}
                  onChange={(e) => setPendingMontant(e.target.value)}
                  placeholder="Ex : 44,00"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                />
              </div>
            )}

            <div className="flex gap-2">
              <button
                onClick={retakePending}
                disabled={sending}
                className="flex flex-1 items-center justify-center gap-2 rounded-xl border border-slate-200 py-3.5 text-sm font-semibold text-slate-700 active:bg-slate-50 disabled:opacity-50"
              >
                <Camera className="h-5 w-5" />
                Reprendre
              </button>
              <button
                onClick={sendPending}
                disabled={sending}
                className="flex flex-[2] items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-60"
              >
                {sending ? (
                  <>
                    <Loader2 className="h-5 w-5 animate-spin" />
                    Analyse en cours…
                  </>
                ) : (
                  <>
                    <Send className="h-5 w-5" />
                    Envoyer
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ——— Étape 2 : vérification des montants lus par l'IA ——— */}
      {verify && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div
            className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-t-3xl bg-white p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
          >
            <div className="mb-1 flex items-center justify-between">
              <h3 className="flex items-center gap-2 text-base font-semibold text-slate-900">
                <Sparkles className="h-4 w-4 text-amber-500" />
                Vérifier la dépense
              </h3>
              <button onClick={closeVerify} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Lu automatiquement sur le reçu — corrigez si besoin puis validez.
            </p>

            {verify.txMontant !== null && ecartVerify > 0.05 && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Le reçu indique un montant différent du débit bancaire (
                  {formatMoney(verify.txMontant)}). Vérifiez que c'est le bon
                  justificatif.
                </span>
              </div>
            )}

            <div className="mb-4 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Montant TTC (€)
                </label>
                {verify.txMontant !== null ? (
                  <div className="rounded-xl bg-slate-100 px-3 py-3 text-base font-semibold tabular-nums text-slate-900">
                    {formatMoney(verify.txMontant)}
                  </div>
                ) : (
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={verify.montantTTC}
                    onChange={(e) =>
                      setVerify({ ...verify, montantTTC: e.target.value })
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                  />
                )}
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  dont TVA (€)
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={verify.montantTVA}
                  onChange={(e) =>
                    setVerify({ ...verify, montantTVA: e.target.value })
                  }
                  placeholder="—"
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="mb-3">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Fournisseur
              </label>
              <input
                type="text"
                value={verify.fournisseur}
                onChange={(e) =>
                  setVerify({ ...verify, fournisseur: e.target.value })
                }
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
              />
            </div>

            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Catégorie
              </label>
              <select
                value={verify.categorie}
                onChange={(e) => setVerify({ ...verify, categorie: e.target.value })}
                className="w-full rounded-xl border border-slate-200 bg-white px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
              >
                <option value="">— Sans catégorie —</option>
                {CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <button
              onClick={saveVerify}
              disabled={verifySaving}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-60"
            >
              {verifySaving ? (
                <Loader2 className="h-5 w-5 animate-spin" />
              ) : (
                <CheckCircle2 className="h-5 w-5" />
              )}
              Valider la dépense
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
