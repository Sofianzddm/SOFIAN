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
  FileText,
  Loader2,
  Plus,
  RefreshCw,
  Search,
  Send,
  Sparkles,
  Users,
  X,
} from "lucide-react";
import {
  TAUX_TVA_OPTIONS,
  TAUX_TVA_TALENT,
  TOLERANCE_POINTAGE,
  round2,
  tauxExpliquantEcart,
  totalFacturesTalent,
  tvaDepuisHT,
  tvaDepuisTTC,
  ventiler,
} from "@/lib/depenses-tva";

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
  sansJustificatif?: boolean;
  analyseIA?: AnalyseIA | null;
  // Factures talents liées (paiements Defacto / Libeo justifiés sur le web)
  facturesTalent?: Array<{ id: string }>;
  facturesTalentCycles?: Array<{ id: string }>;
}

/** Justifiée par un fichier, un OK sans ticket, ou des factures talents */
function depenseJustifiee(d: DepenseInfo | null): boolean {
  if (!d) return false;
  return (
    !!d.justificatifUrl ||
    !!d.sansJustificatif ||
    (d.facturesTalent?.length ?? 0) > 0 ||
    (d.facturesTalentCycles?.length ?? 0) > 0
  );
}

/**
 * Le montant lu sur le reçu est-il le HT du débit bancaire ? Renvoie le taux
 * qui les réconcilie, sinon null — cas fréquent des factures de prestataires,
 * où le total mis en avant est le hors taxes.
 */
function tauxRecuLuEnHT(depense: DepenseInfo, txMontant: number | null): number | null {
  if (txMontant === null) return null;
  return tauxExpliquantEcart(toNumber(depense.analyseIA?.montantTTC), txMontant);
}

function monthKey(dateStr: string): string {
  const d = new Date(dateStr);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string): string {
  const [y, m] = key.split("-").map(Number);
  const label = new Date(y, m - 1, 1).toLocaleDateString("fr-FR", {
    month: "long",
    year: "numeric",
  });
  return label.charAt(0).toUpperCase() + label.slice(1);
}

function groupByMonth<T>(items: T[], getDate: (item: T) => string) {
  const map = new Map<string, T[]>();
  for (const item of items) {
    const k = monthKey(getDate(item));
    const list = map.get(k);
    if (list) list.push(item);
    else map.set(k, [item]);
  }
  return Array.from(map.entries())
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([key, group]) => ({ key, label: monthLabel(key), items: group }));
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

interface FactureTalentCollab {
  id: string;
  reference: string;
  montantNet: number | string;
  factureTalentUrl: string | null;
  paidAt?: string | null;
  depenseId?: string | null;
  talent: { prenom: string; nom: string };
  marque: { nom: string };
}

interface FactureTalentCycle {
  id: string;
  numero: number;
  montantNet: number | string;
  factureTalentUrl: string | null;
  paidAt?: string | null;
  depenseId?: string | null;
  collaboration: {
    reference: string;
    talent: { prenom: string; nom: string };
    marque: { nom: string };
  };
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

/** Montant saisi au clavier mobile (virgule française tolérée) */
function parseMontant(v: string): number {
  const n = Number(v.replace(",", "."));
  return Number.isFinite(n) ? n : 0;
}

const formatTaux = (taux: number) =>
  taux === 0 ? "Sans TVA" : `${String(taux).replace(".", ",")} %`;

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
  /** Montant saisi, HT ou TTC selon `montantMode` (reçu hors banque) */
  montant: string;
  montantMode: "HT" | "TTC";
  /** Taux choisi via les raccourcis ; "" = TVA saisie à la main */
  tauxTVA: string;
  montantTVA: string;
}

/**
 * Ventilation courante de l'écran de vérification. Pour une transaction
 * bancaire, le débit est le TTC par définition : seule la TVA se déclare.
 */
function ventilerVerify(v: VerifyState) {
  return ventiler(
    v.txMontant ?? parseMontant(v.montant),
    v.txMontant !== null ? "TTC" : v.montantMode,
    parseMontant(v.montantTVA)
  );
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

  // Sans ticket : justifier via factures talents (Libeo / Defacto)
  const [linkTx, setLinkTx] = useState<TransactionDebit | null>(null);
  const [linkLoading, setLinkLoading] = useState(false);
  const [linkSaving, setLinkSaving] = useState(false);
  const [linkSearch, setLinkSearch] = useState("");
  const [linkCollabs, setLinkCollabs] = useState<FactureTalentCollab[]>([]);
  const [linkCycles, setLinkCycles] = useState<FactureTalentCycle[]>([]);
  const [selCollabs, setSelCollabs] = useState<Set<string>>(new Set());
  const [selCycles, setSelCycles] = useState<Set<string>>(new Set());
  // Factures dont le talent facture la TVA : montantNet étant un HT, le
  // virement vaut montantNet × 1,20 — sinon le pointage affiche un écart de 20 %.
  const [tvaCollabs, setTvaCollabs] = useState<Set<string>>(new Set());
  const [tvaCycles, setTvaCycles] = useState<Set<string>>(new Set());
  const [okSavingId, setOkSavingId] = useState<string | null>(null);
  const [collapsedMonths, setCollapsedMonths] = useState<Set<string>>(new Set());

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
    const montant = txMontant ?? toNumber(depense.montantTTC);
    // Reçu lu en HT : si le débit correspond au montant du reçu majoré d'un
    // taux courant, on préremplit ce taux plutôt que de crier au mauvais reçu.
    const tauxHT = tauxRecuLuEnHT(depense, txMontant);
    const taux = tauxHT ?? toNumber(depense.tauxTVA);
    // Une TVA lue explicitement sur le reçu fait foi ; sinon on la déduit du taux.
    const tvaLue = toNumber(depense.montantTVA);
    const tva =
      tauxHT === null && tvaLue > 0 ? tvaLue : tvaDepuisTTC(montant, taux);

    setVerify({
      depense,
      txMontant,
      preview,
      fournisseur: depense.fournisseur ?? "",
      categorie: depense.categorie ?? "",
      montant: montant > 0 ? String(montant) : "",
      montantMode: "TTC",
      tauxTVA: taux > 0 ? String(taux) : "",
      montantTVA: tva > 0 ? String(tva) : "",
    });
  };

  /** Applique un taux : la TVA est recalculée depuis le montant saisi. */
  const appliquerTaux = (taux: number) => {
    if (!verify) return;
    const montant = verify.txMontant ?? parseMontant(verify.montant);
    const tva =
      verify.montantMode === "HT" && verify.txMontant === null
        ? tvaDepuisHT(montant, taux)
        : tvaDepuisTTC(montant, taux);
    setVerify({ ...verify, tauxTVA: String(taux), montantTVA: String(tva) });
  };

  /** Montant ou base (HT / TTC) modifié : la TVA suit le taux choisi. */
  const majMontant = (patch: { montant?: string; montantMode?: "HT" | "TTC" }) => {
    if (!verify) return;
    const next = { ...verify, ...patch };
    if (next.tauxTVA !== "") {
      const taux = Number(next.tauxTVA);
      const montant = parseMontant(next.montant);
      next.montantTVA = String(
        next.montantMode === "HT"
          ? tvaDepuisHT(montant, taux)
          : tvaDepuisTTC(montant, taux)
      );
    }
    setVerify(next);
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
      const ventilation = ventilerVerify(verify);
      const payload: Record<string, unknown> = {
        fournisseur: verify.fournisseur,
        categorie: verify.categorie,
        montantTVA: verify.montantTVA === "" ? null : ventilation.tva,
        tauxTVA: verify.tauxTVA === "" ? null : Number(verify.tauxTVA),
      };
      // Le montant TTC n'est éditable que pour un reçu hors banque (pour une
      // transaction bancaire, le débit fait foi). Saisi en HT, il est converti.
      if (verify.txMontant === null && ventilation.ttc > 0) {
        payload.montantTTC = ventilation.ttc;
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

  // ——— Sans ticket : Libeo / Defacto via factures talents ———

  const openLink = async (tx: TransactionDebit) => {
    setLinkTx(tx);
    setLinkLoading(true);
    setLinkSearch("");
    try {
      const depenseId = tx.depense?.id ?? "";
      const res = await fetch(
        `/api/depenses/factures-talent${depenseId ? `?depenseId=${depenseId}` : ""}`
      );
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors du chargement des factures talents");
        setLinkTx(null);
        return;
      }
      const collabs: FactureTalentCollab[] = data.collabs || [];
      const cycles: FactureTalentCycle[] = data.cycles || [];
      setLinkCollabs(collabs);
      setLinkCycles(cycles);
      const dejaCollabs = collabs
        .filter((c) => depenseId && c.depenseId === depenseId)
        .map((c) => c.id);
      const dejaCycles = cycles
        .filter((c) => depenseId && c.depenseId === depenseId)
        .map((c) => c.id);
      setSelCollabs(new Set(dejaCollabs));
      setSelCycles(new Set(dejaCycles));
      // La TVA n'est pas mémorisée par facture : si la dépense en porte déjà,
      // on recoche tout pour ne pas l'effacer en réenregistrant.
      const avaitTVA = toNumber(tx.depense?.montantTVA) > 0;
      setTvaCollabs(new Set(avaitTVA ? dejaCollabs : []));
      setTvaCycles(new Set(avaitTVA ? dejaCycles : []));
    } catch {
      setError("Erreur lors du chargement des factures talents");
      setLinkTx(null);
    } finally {
      setLinkLoading(false);
    }
  };

  const closeLink = () => {
    setLinkTx(null);
    setLinkCollabs([]);
    setLinkCycles([]);
    setSelCollabs(new Set());
    setSelCycles(new Set());
    setTvaCollabs(new Set());
    setTvaCycles(new Set());
    setLinkSearch("");
  };

  const toggleSel = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  const sansId = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    next.delete(id);
    return next;
  };

  /** Le débit colle si toutes les factures cochées portent la TVA talent */
  const appliquerTvaPartout = () => {
    setTvaCollabs(new Set(selCollabs));
    setTvaCycles(new Set(selCycles));
  };

  const saveLink = async () => {
    if (!linkTx) return;
    if (selCollabs.size + selCycles.size === 0) {
      setError("Cochez au moins une facture talent");
      return;
    }
    setLinkSaving(true);
    setError(null);
    try {
      let depenseId = linkTx.depense?.id;
      if (!depenseId) {
        const formData = new FormData();
        formData.append("transactionId", linkTx.id);
        const res = await fetch("/api/depenses", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Erreur lors de la création de la dépense");
          return;
        }
        depenseId = data.depense.id as string;
      }

      const res = await fetch(`/api/depenses/${depenseId}/factures-talent`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          collabIds: Array.from(selCollabs),
          cycleIds: Array.from(selCycles),
          tvaCollabIds: Array.from(tvaCollabs),
          tvaCycleIds: Array.from(tvaCycles),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        setError(data.error || "Erreur lors de la liaison");
        return;
      }
      await fetchData();
      closeLink();
      setToast("Justifié via factures talents ✓");
    } catch {
      setError("Erreur lors de la liaison");
    } finally {
      setLinkSaving(false);
    }
  };

  /** Bouton OK : sort la dépense de « à justifier » sans ticket */
  const markOk = async (tx: TransactionDebit) => {
    setOkSavingId(tx.id);
    setError(null);
    try {
      if (tx.depense?.id) {
        const res = await fetch(`/api/depenses/${tx.depense.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ sansJustificatif: true }),
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Erreur");
          return;
        }
      } else {
        const formData = new FormData();
        formData.append("transactionId", tx.id);
        formData.append("sansJustificatif", "true");
        const res = await fetch("/api/depenses", { method: "POST", body: formData });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          setError(data.error || "Erreur");
          return;
        }
      }
      await fetchData();
      setToast("OK — retiré des factures manquantes");
    } catch {
      setError("Erreur lors de l'acquittement");
    } finally {
      setOkSavingId(null);
    }
  };

  const toggleMonth = (key: string) => {
    setCollapsedMonths((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
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

  const aJustifier = transactions.filter((t) => !depenseJustifiee(t.depense));
  const justifiees = transactions.filter((t) => depenseJustifiee(t.depense));
  const totalAJustifier = aJustifier.reduce(
    (s, t) => s + Math.abs(toNumber(t.montant)),
    0
  );

  // Pointage : total des factures cochées (TVA talent incluse là où elle est
  // déclarée) face au débit bancaire, qui est un TTC.
  const lignesSelection = [
    ...linkCollabs
      .filter((c) => selCollabs.has(c.id))
      .map((c) => ({ montantNet: toNumber(c.montantNet), avecTva: tvaCollabs.has(c.id) })),
    ...linkCycles
      .filter((c) => selCycles.has(c.id))
      .map((c) => ({ montantNet: toNumber(c.montantNet), avecTva: tvaCycles.has(c.id) })),
  ];
  const selection = totalFacturesTalent(lignesSelection);
  const debitLink = linkTx ? Math.abs(toNumber(linkTx.montant)) : 0;
  const ecartLink = round2(selection.ttc - debitLink);
  // Écart exactement égal à la TVA manquante → un tap pour corriger
  const suggestionTva =
    selection.ttc > 0 &&
    Math.abs(ecartLink) > TOLERANCE_POINTAGE &&
    Math.abs(
      totalFacturesTalent(lignesSelection.map((l) => ({ ...l, avecTva: true }))).ttc -
        debitLink
    ) <= TOLERANCE_POINTAGE;

  const lq = linkSearch.trim().toLowerCase();
  const matchCollab = (c: FactureTalentCollab) =>
    !lq ||
    `${c.talent.prenom} ${c.talent.nom}`.toLowerCase().includes(lq) ||
    c.marque.nom.toLowerCase().includes(lq) ||
    c.reference.toLowerCase().includes(lq);
  const matchCycle = (c: FactureTalentCycle) =>
    !lq ||
    `${c.collaboration.talent.prenom} ${c.collaboration.talent.nom}`
      .toLowerCase()
      .includes(lq) ||
    c.collaboration.marque.nom.toLowerCase().includes(lq) ||
    c.collaboration.reference.toLowerCase().includes(lq);

  // Écran de vérification : ventilation courante, et écart entre le montant lu
  // sur le reçu et le débit — sauf quand cet écart n'est que la TVA.
  const ventilationVerify = verify ? ventilerVerify(verify) : null;
  const montantLuVerify = toNumber(verify?.depense.analyseIA?.montantTTC);
  const tauxVerifyHT = verify ? tauxRecuLuEnHT(verify.depense, verify.txMontant) : null;
  const ecartVerify =
    verify && verify.txMontant !== null && montantLuVerify > 0 && tauxVerifyHT === null
      ? Math.abs(montantLuVerify - verify.txMontant)
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

      {/* À justifier — dossiers par mois */}
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
          <div className="space-y-5">
            {groupByMonth(aJustifier, (t) => t.dateTransaction).map((folder) => {
              const collapsed = collapsedMonths.has(folder.key);
              return (
                <div key={folder.key}>
                  <button
                    type="button"
                    onClick={() => toggleMonth(folder.key)}
                    className="mb-2 flex w-full items-center justify-between px-1"
                  >
                    <h2 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      {folder.label}
                      <span className="ml-2 font-normal text-slate-400">
                        ({folder.items.length})
                      </span>
                    </h2>
                    {collapsed ? (
                      <ChevronDown className="h-4 w-4 text-slate-400" />
                    ) : (
                      <ChevronUp className="h-4 w-4 text-slate-400" />
                    )}
                  </button>
                  {!collapsed && (
                    <div className="space-y-3">
                      {folder.items.map((tx) => (
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
                          <div className="mt-3 grid grid-cols-1 gap-2">
                            <button
                              onClick={() => void markOk(tx)}
                              disabled={okSavingId === tx.id}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-600 py-3.5 text-sm font-semibold text-white active:bg-emerald-700 disabled:opacity-60"
                            >
                              {okSavingId === tx.id ? (
                                <Loader2 className="h-5 w-5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-5 w-5" />
                              )}
                              OK — pas de ticket
                            </button>
                            <button
                              onClick={() => takePhotoFor(tx)}
                              className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-semibold text-white active:bg-slate-700"
                            >
                              <Camera className="h-5 w-5" />
                              Photographier le reçu
                            </button>
                            <button
                              onClick={() => void openLink(tx)}
                              className="flex w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white py-3 text-sm font-medium text-slate-700 active:bg-slate-50"
                            >
                              <Users className="h-4 w-4" />
                              Sans ticket · Libeo / Defacto
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
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

      {/* Justifiées (repliées) — dossiers par mois */}
      {justifiees.length > 0 && (
        <section className="px-4 pt-2 pb-4">
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
            <div className="mt-2 space-y-4">
              {groupByMonth(justifiees, (t) => t.dateTransaction).map((folder) => (
                <div key={folder.key}>
                  <p className="mb-1 px-1 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
                    {folder.label}
                  </p>
                  <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200 bg-white">
                    {folder.items.map((tx) => (
                      <div key={tx.id} className="flex items-center gap-3 px-4 py-3">
                        <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-emerald-500" />
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-700">
                            {tx.depense?.fournisseur || tx.emetteur || tx.libelle || "—"}
                          </p>
                          <p className="text-xs text-slate-400">
                            {formatDate(tx.dateTransaction)}
                            {tx.depense?.categorie ? ` · ${tx.depense.categorie}` : ""}
                            {tx.depense?.sansJustificatif && !tx.depense?.justificatifUrl
                              ? " · OK sans ticket"
                              : ""}
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
                <p className="mt-1 text-[11px] text-slate-400">
                  Si le reçu n'affiche que le HT, la TVA se précise à l'étape
                  suivante.
                </p>
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

            {verify.txMontant !== null && ecartVerify > TOLERANCE_POINTAGE && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2.5 text-sm text-amber-800">
                <AlertTriangle className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Le reçu indique un montant différent du débit bancaire (
                  {formatMoney(verify.txMontant)}). Vérifiez que c'est le bon
                  justificatif.
                </span>
              </div>
            )}

            {tauxVerifyHT !== null && verify.txMontant !== null && (
              <div className="mb-4 flex items-start gap-2 rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-sm text-sky-800">
                <Sparkles className="mt-0.5 h-4 w-4 flex-shrink-0" />
                <span>
                  Le reçu affiche {formatMoney(montantLuVerify)} hors taxes ; le
                  débit de {formatMoney(verify.txMontant)} inclut{" "}
                  {formatTaux(tauxVerifyHT)} de TVA. Taux prérempli — choisissez
                  « Sans TVA » si le fournisseur n'est pas assujetti.
                </span>
              </div>
            )}

            <div className="mb-4 rounded-2xl border border-slate-200 p-3">
              {verify.txMontant !== null ? (
                <>
                  <p className="text-xs font-medium text-slate-600">
                    Débit bancaire (TTC)
                  </p>
                  <p className="mt-0.5 text-xl font-semibold tabular-nums text-slate-900">
                    {formatMoney(verify.txMontant)}
                  </p>
                </>
              ) : (
                <>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label className="text-xs font-medium text-slate-600">
                      Montant du reçu (€)
                    </label>
                    <div className="flex gap-0.5 rounded-lg bg-slate-100 p-0.5">
                      {(["TTC", "HT"] as const).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => majMontant({ montantMode: mode })}
                          className={`rounded-md px-3 py-1 text-xs font-semibold ${
                            verify.montantMode === mode
                              ? "bg-white text-slate-900 shadow-sm"
                              : "text-slate-500"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>
                  <input
                    type="number"
                    inputMode="decimal"
                    step="0.01"
                    value={verify.montant}
                    onChange={(e) => majMontant({ montant: e.target.value })}
                    className="w-full rounded-xl border border-slate-200 px-3 py-3 text-base focus:border-slate-400 focus:outline-none"
                  />
                </>
              )}

              <p className="mb-1.5 mt-3 text-xs font-medium text-slate-600">TVA</p>
              <div className="flex flex-wrap items-center gap-1.5">
                {TAUX_TVA_OPTIONS.map((taux) => (
                  <button
                    key={taux}
                    type="button"
                    onClick={() => appliquerTaux(taux)}
                    className={`rounded-full px-3 py-1.5 text-xs font-semibold ${
                      verify.tauxTVA === String(taux)
                        ? "bg-slate-900 text-white"
                        : "border border-slate-200 text-slate-600 active:bg-slate-50"
                    }`}
                  >
                    {formatTaux(taux)}
                  </button>
                ))}
                <input
                  type="number"
                  inputMode="decimal"
                  step="0.01"
                  value={verify.montantTVA}
                  onChange={(e) =>
                    setVerify({ ...verify, montantTVA: e.target.value, tauxTVA: "" })
                  }
                  placeholder="TVA €"
                  aria-label="Montant de TVA en euros"
                  className="w-24 rounded-full border border-slate-200 px-3 py-1.5 text-xs tabular-nums focus:border-slate-400 focus:outline-none"
                />
              </div>

              {ventilationVerify && ventilationVerify.ttc > 0 && (
                <p className="mt-2.5 text-xs tabular-nums text-slate-500">
                  HT {formatMoney(ventilationVerify.ht)} · TVA{" "}
                  {formatMoney(ventilationVerify.tva)} ·{" "}
                  <span className="font-semibold text-slate-700">
                    TTC {formatMoney(ventilationVerify.ttc)}
                  </span>
                </p>
              )}
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

      {/* Sans ticket : lier des factures talents (Libeo / Defacto) */}
      {linkTx && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60">
          <div
            className="flex max-h-[90vh] w-full max-w-lg flex-col rounded-t-3xl bg-white"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          >
            <div className="border-b border-slate-100 px-5 pb-3 pt-5">
              <div className="mb-1 flex items-center justify-between">
                <h3 className="text-base font-semibold text-slate-900">
                  Sans ticket · Libeo / Defacto
                </h3>
                <button onClick={closeLink} className="text-slate-400">
                  <X className="h-5 w-5" />
                </button>
              </div>
              <p className="text-sm text-slate-500">
                Débit{" "}
                <span className="font-semibold text-slate-800">
                  {formatMoney(Math.abs(toNumber(linkTx.montant)))}
                </span>{" "}
                — cochez les factures talents déjà uploadées (pas de photo).
              </p>
              <div className="relative mt-3">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  type="search"
                  placeholder="Talent, marque, référence…"
                  value={linkSearch}
                  onChange={(e) => setLinkSearch(e.target.value)}
                  className="w-full rounded-xl border border-slate-200 py-2.5 pl-9 pr-3 text-sm focus:border-slate-400 focus:outline-none"
                />
              </div>
            </div>

            <div className="flex-1 overflow-y-auto px-3 py-2">
              {linkLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="h-7 w-7 animate-spin text-slate-400" />
                </div>
              ) : linkCollabs.length === 0 && linkCycles.length === 0 ? (
                <p className="px-2 py-10 text-center text-sm text-slate-500">
                  Aucune facture talent disponible. Elles apparaissent ici dès
                  qu&apos;un talent dépose sa facture sur une collab.
                </p>
              ) : (
                <div className="space-y-0.5">
                  {linkCollabs.filter(matchCollab).map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3 active:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selCollabs.has(c.id)}
                        onChange={() => {
                          setSelCollabs((s) => toggleSel(s, c.id));
                          setTvaCollabs((s) => sansId(s, c.id));
                        }}
                        className="h-5 w-5 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {c.talent.prenom} {c.talent.nom}
                          <span className="font-normal text-slate-500">
                            {" "}
                            · {c.marque.nom}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400">{c.reference}</p>
                      </div>
                      {c.factureTalentUrl && (
                        <a
                          href={c.factureTalentUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-400"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      )}
                      {selCollabs.has(c.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setTvaCollabs((s) => toggleSel(s, c.id));
                          }}
                          className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${
                            tvaCollabs.has(c.id)
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 text-slate-500"
                          }`}
                        >
                          TVA {TAUX_TVA_TALENT} %
                        </button>
                      )}
                      <div className="whitespace-nowrap text-right">
                        <span className="block text-sm font-semibold tabular-nums text-slate-700">
                          {formatMoney(
                            toNumber(c.montantNet) +
                              (tvaCollabs.has(c.id)
                                ? tvaDepuisHT(toNumber(c.montantNet), TAUX_TVA_TALENT)
                                : 0)
                          )}
                        </span>
                        {tvaCollabs.has(c.id) && (
                          <span className="block text-[10px] tabular-nums text-slate-400">
                            HT {formatMoney(toNumber(c.montantNet))}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                  {linkCycles.filter(matchCycle).map((c) => (
                    <label
                      key={c.id}
                      className="flex cursor-pointer items-center gap-3 rounded-xl px-2 py-3 active:bg-slate-50"
                    >
                      <input
                        type="checkbox"
                        checked={selCycles.has(c.id)}
                        onChange={() => {
                          setSelCycles((s) => toggleSel(s, c.id));
                          setTvaCycles((s) => sansId(s, c.id));
                        }}
                        className="h-5 w-5 rounded border-slate-300"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-medium text-slate-900">
                          {c.collaboration.talent.prenom}{" "}
                          {c.collaboration.talent.nom}
                          <span className="font-normal text-slate-500">
                            {" "}
                            · {c.collaboration.marque.nom} — c.{c.numero}
                          </span>
                        </p>
                        <p className="text-xs text-slate-400">
                          {c.collaboration.reference}
                        </p>
                      </div>
                      {c.factureTalentUrl && (
                        <a
                          href={c.factureTalentUrl}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="text-slate-400"
                        >
                          <FileText className="h-4 w-4" />
                        </a>
                      )}
                      {selCycles.has(c.id) && (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.preventDefault();
                            setTvaCycles((s) => toggleSel(s, c.id));
                          }}
                          className={`whitespace-nowrap rounded-full px-2 py-1 text-[10px] font-semibold ${
                            tvaCycles.has(c.id)
                              ? "bg-slate-900 text-white"
                              : "border border-slate-200 text-slate-500"
                          }`}
                        >
                          TVA {TAUX_TVA_TALENT} %
                        </button>
                      )}
                      <div className="whitespace-nowrap text-right">
                        <span className="block text-sm font-semibold tabular-nums text-slate-700">
                          {formatMoney(
                            toNumber(c.montantNet) +
                              (tvaCycles.has(c.id)
                                ? tvaDepuisHT(toNumber(c.montantNet), TAUX_TVA_TALENT)
                                : 0)
                          )}
                        </span>
                        {tvaCycles.has(c.id) && (
                          <span className="block text-[10px] tabular-nums text-slate-400">
                            HT {formatMoney(toNumber(c.montantNet))}
                          </span>
                        )}
                      </div>
                    </label>
                  ))}
                </div>
              )}
            </div>

            <div className="border-t border-slate-100 px-5 py-4">
              <div className="flex items-center justify-between text-sm">
                <span className="text-slate-500">Sélection</span>
                <span
                  className={`font-semibold tabular-nums ${
                    Math.abs(ecartLink) <= TOLERANCE_POINTAGE
                      ? "text-emerald-600"
                      : "text-slate-900"
                  }`}
                >
                  {formatMoney(selection.ttc)} / {formatMoney(debitLink)}
                </span>
              </div>
              <p className="mb-3 mt-0.5 text-right text-xs tabular-nums text-slate-400">
                {selection.tva > 0
                  ? `HT ${formatMoney(selection.ht)} · dont TVA ${formatMoney(selection.tva)}`
                  : "aucune TVA déclarée"}
              </p>
              {suggestionTva && (
                <button
                  type="button"
                  onClick={appliquerTvaPartout}
                  className="mb-3 flex w-full items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50 py-2.5 text-xs font-semibold text-sky-800 active:bg-sky-100"
                >
                  <Sparkles className="h-3.5 w-3.5" />
                  Le débit colle avec {formatTaux(TAUX_TVA_TALENT)} de TVA — appliquer
                </button>
              )}
              {selection.ttc > 0 &&
                Math.abs(ecartLink) > TOLERANCE_POINTAGE &&
                !suggestionTva && (
                  <p className="mb-3 flex items-start gap-1.5 text-xs text-amber-600">
                    <AlertTriangle className="mt-0.5 h-3.5 w-3.5 flex-shrink-0" />
                    <span>
                      Écart de {formatMoney(Math.abs(ecartLink))} — TVA d'un talent
                      assujetti ou frais Libeo / Defacto ?
                    </span>
                  </p>
                )}
              <button
                onClick={() => void saveLink()}
                disabled={linkSaving || linkLoading || selCollabs.size + selCycles.size === 0}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-slate-900 py-3.5 text-sm font-semibold text-white active:bg-slate-700 disabled:opacity-50"
              >
                {linkSaving ? (
                  <Loader2 className="h-5 w-5 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-5 w-5" />
                )}
                Justifier
                {selCollabs.size + selCycles.size > 0
                  ? ` (${selCollabs.size + selCycles.size})`
                  : ""}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
