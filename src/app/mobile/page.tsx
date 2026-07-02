"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useSession } from "next-auth/react";
import { useRouter } from "next/navigation";
import {
  AlertCircle,
  Camera,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Loader2,
  Plus,
  RefreshCw,
  X,
} from "lucide-react";

interface DepenseInfo {
  id: string;
  categorie: string | null;
  justificatifUrl: string | null;
}

interface TransactionDebit {
  id: string;
  montant: number | string;
  libelle: string | null;
  emetteur: string | null;
  dateTransaction: string;
  depense: (DepenseInfo & Record<string, unknown>) | null;
}

interface HorsBanque {
  id: string;
  fournisseur: string | null;
  libelle: string | null;
  montantTTC: number | string;
  dateDepense: string;
  justificatifUrl: string | null;
}

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

export default function MobileDepensesPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [transactions, setTransactions] = useState<TransactionDebit[]>([]);
  const [horsBanque, setHorsBanque] = useState<HorsBanque[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);
  const [uploadingId, setUploadingId] = useState<string | null>(null);
  const [showJustifiees, setShowJustifiees] = useState(false);

  // Photo d'une transaction : input caché déclenché depuis la carte
  const fileInputRef = useRef<HTMLInputElement>(null);
  const targetTx = useRef<TransactionDebit | null>(null);

  // Modale "reçu hors banque"
  const [showHorsBanqueForm, setShowHorsBanqueForm] = useState(false);
  const [hbFile, setHbFile] = useState<File | null>(null);
  const [hbPreview, setHbPreview] = useState<string | null>(null);
  const [hbMontant, setHbMontant] = useState("");
  const [hbFournisseur, setHbFournisseur] = useState("");
  const [hbDate, setHbDate] = useState(() =>
    new Date().toISOString().slice(0, 10)
  );
  const [hbSubmitting, setHbSubmitting] = useState(false);
  const hbFileInputRef = useRef<HTMLInputElement>(null);

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

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), 2500);
    return () => clearTimeout(t);
  }, [toast]);

  const refresh = async () => {
    setRefreshing(true);
    try {
      // Sync Qonto d'abord pour récupérer les derniers débits
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

  const takePhotoFor = (tx: TransactionDebit) => {
    targetTx.current = tx;
    fileInputRef.current?.click();
  };

  const onPhotoPicked = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.files?.[0];
    const tx = targetTx.current;
    e.target.value = "";
    targetTx.current = null;
    if (!raw || !tx) return;

    setUploadingId(tx.id);
    setError(null);
    try {
      const file = await compressImage(raw);
      const formData = new FormData();
      formData.append("file", file);

      let res: Response;
      if (tx.depense) {
        res = await fetch(`/api/depenses/${tx.depense.id}`, {
          method: "PATCH",
          body: formData,
        });
      } else {
        formData.append("transactionId", tx.id);
        res = await fetch("/api/depenses", { method: "POST", body: formData });
      }

      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'envoi");
        return;
      }
      setTransactions((list) =>
        list.map((t) => (t.id === tx.id ? { ...t, depense: data.depense } : t))
      );
      setToast("Reçu envoyé ✓");
    } catch {
      setError("Erreur lors de l'envoi");
    } finally {
      setUploadingId(null);
    }
  };

  const onHbPhotoPicked = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setHbFile(file);
    if (hbPreview) URL.revokeObjectURL(hbPreview);
    setHbPreview(file.type.startsWith("image/") ? URL.createObjectURL(file) : null);
  };

  const resetHbForm = () => {
    setShowHorsBanqueForm(false);
    setHbFile(null);
    if (hbPreview) URL.revokeObjectURL(hbPreview);
    setHbPreview(null);
    setHbMontant("");
    setHbFournisseur("");
    setHbDate(new Date().toISOString().slice(0, 10));
  };

  const submitHorsBanque = async () => {
    if (!hbFile || !hbMontant) return;
    setHbSubmitting(true);
    setError(null);
    try {
      const file = await compressImage(hbFile);
      const formData = new FormData();
      formData.append("file", file);
      formData.append("montantTTC", hbMontant);
      formData.append("dateDepense", hbDate);
      if (hbFournisseur.trim()) formData.append("fournisseur", hbFournisseur.trim());

      const res = await fetch("/api/depenses", { method: "POST", body: formData });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de l'envoi");
        return;
      }
      resetHbForm();
      setToast("Reçu enregistré ✓");
      await fetchData();
    } catch {
      setError("Erreur lors de l'envoi");
    } finally {
      setHbSubmitting(false);
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
            {aJustifier.map((tx) => {
              const isUploading = uploadingId === tx.id;
              return (
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
                    disabled={isUploading}
                    className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-60"
                  >
                    {isUploading ? (
                      <>
                        <Loader2 className="h-5 w-5 animate-spin" />
                        Envoi en cours…
                      </>
                    ) : (
                      <>
                        <Camera className="h-5 w-5" />
                        Photographier le reçu
                      </>
                    )}
                  </button>
                </div>
              );
            })}
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
                      {tx.emetteur || tx.libelle || "—"}
                    </p>
                    <p className="text-xs text-slate-400">
                      {formatDate(tx.dateTransaction)}
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

      {/* Bouton flottant : reçu hors banque */}
      <button
        onClick={() => setShowHorsBanqueForm(true)}
        className="fixed bottom-6 right-5 z-30 flex h-14 w-14 items-center justify-center rounded-full bg-slate-900 text-white shadow-lg active:bg-slate-700"
        style={{ marginBottom: "env(safe-area-inset-bottom)" }}
        aria-label="Ajouter un reçu hors banque"
      >
        <Plus className="h-7 w-7" />
      </button>

      {/* Toast */}
      {toast && (
        <div className="fixed bottom-24 left-1/2 z-40 -translate-x-1/2 rounded-full bg-slate-900 px-4 py-2 text-sm font-medium text-white shadow-lg">
          {toast}
        </div>
      )}

      {/* Modale reçu hors banque */}
      {showHorsBanqueForm && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40">
          <div
            className="w-full max-w-lg rounded-t-3xl bg-white p-5"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}
          >
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-base font-semibold text-slate-900">
                Reçu hors banque
              </h3>
              <button onClick={resetHbForm} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>
            <p className="mb-4 text-xs text-slate-500">
              Pour un paiement pas encore visible en banque (espèces, carte
              perso…). Il sera rapproché ensuite depuis le dashboard.
            </p>

            <input
              ref={hbFileInputRef}
              type="file"
              accept="image/*,application/pdf"
              capture="environment"
              className="hidden"
              onChange={onHbPhotoPicked}
            />

            <button
              onClick={() => hbFileInputRef.current?.click()}
              className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-slate-300 py-6 text-sm font-medium text-slate-600 active:bg-slate-50"
            >
              {hbPreview ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={hbPreview}
                  alt="Aperçu du reçu"
                  className="max-h-40 rounded-lg object-contain"
                />
              ) : hbFile ? (
                <span className="text-emerald-600">{hbFile.name}</span>
              ) : (
                <>
                  <Camera className="h-5 w-5" />
                  Prendre le reçu en photo
                </>
              )}
            </button>

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Montant TTC (€) *
                </label>
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={hbMontant}
                  onChange={(e) => setHbMontant(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                  placeholder="0,00"
                />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">
                  Date
                </label>
                <input
                  type="date"
                  value={hbDate}
                  onChange={(e) => setHbDate(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                />
              </div>
            </div>
            <div className="mb-5">
              <label className="mb-1 block text-xs font-medium text-slate-600">
                Fournisseur
              </label>
              <input
                type="text"
                value={hbFournisseur}
                onChange={(e) => setHbFournisseur(e.target.value)}
                className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                placeholder="Ex : SNCF, Apple…"
              />
            </div>

            <button
              onClick={submitHorsBanque}
              disabled={!hbFile || !hbMontant || hbSubmitting}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-40"
            >
              {hbSubmitting && <Loader2 className="h-5 w-5 animate-spin" />}
              Enregistrer le reçu
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
