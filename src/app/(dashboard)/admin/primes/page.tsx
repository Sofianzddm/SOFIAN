"use client";

import { useEffect, useMemo, useState } from "react";
import { nanoid } from "nanoid";
import { useSession } from "next-auth/react";
import { Loader2 } from "lucide-react";
import { PRIME_TYPE_LABELS, PRIME_TYPE_OPTIONS, isRetraitPrimeType, normalizePrimeMontant, type PrimeLigne, type PrimeLigneType } from "@/lib/primes";

type PrimeStatut = "BROUILLON" | "SOUMIS" | "VALIDE" | "REFUSE";
type PrimeRow = {
  id: string;
  mois: number;
  annee: number;
  lignes: PrimeLigne[];
  primeCA: number;
  statut: PrimeStatut;
  commentaireAdmin: string | null;
  lignesAdmin?: PrimeLigne[] | null;
  primeCAAdmin?: number | null;
  excelUrl?: string | null;
  excelFileName?: string | null;
  user: { prenom: string; nom: string; email: string };
};

type PrimeHeadOfSales = {
  ca: number;
  trancheBasse: number;
  trancheHaute: number;
  primeBasse: number;
  primeHaute: number;
  total: number;
};

type SalesCollab = {
  id: string;
  reference: string;
  marque: string;
  talent: string;
  montantBrut: number;
  margeTotale: number;
  margePercent: number;
  statut: string;
  createdAt: string;
  encaisse: boolean;
};

const STATUT_LABELS: Record<string, string> = {
  NEGO: "En négo",
  GAGNE: "Gagné",
  PERDU: "Perdu",
  EN_COURS: "En cours",
  PUBLIE: "Publié",
  FACTURE_RECUE: "Facture reçue",
  PAYE: "Payé",
};

const LICORICE = "#1A1110";
const OLD_ROSE = "#C08B8B";
const TEA_GREEN = "#C8F285";
const MONTHS = ["janvier","février","mars","avril","mai","juin","juillet","août","septembre","octobre","novembre","décembre"];

function eur(v: number): string {
  return `${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(v)} €`;
}

export default function AdminPrimesPage() {
  const { status, data: session } = useSession();
  const [effectiveRole, setEffectiveRole] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [primes, setPrimes] = useState<PrimeRow[]>([]);
  const [tab, setTab] = useState<"TOUTES" | "SOUMIS" | "VALIDE" | "REFUSE">("TOUTES");

  const [decisionId, setDecisionId] = useState<string | null>(null);
  const [decisionMode, setDecisionMode] = useState<"validate" | "refuse" | "edit">("refuse");
  const [commentaire, setCommentaire] = useState("");
  const [decisionLignes, setDecisionLignes] = useState<PrimeLigne[]>([]);
  const [decisionPrimeCA, setDecisionPrimeCA] = useState("0");
  const [decisionFile, setDecisionFile] = useState<File | null>(null);
  const [decisionSaving, setDecisionSaving] = useState(false);
  const [removeIndex, setRemoveIndex] = useState<number | null>(null);
  const [removeReason, setRemoveReason] = useState("");

  const now = new Date();
  const [hosMois, setHosMois] = useState(now.getUTCMonth() + 1);
  const [hosAnnee, setHosAnnee] = useState(now.getUTCFullYear());
  const [hosPrime, setHosPrime] = useState<PrimeHeadOfSales | null>(null);
  const [hosCollabs, setHosCollabs] = useState<SalesCollab[]>([]);
  const [hosLoading, setHosLoading] = useState(false);
  const [hosExporting, setHosExporting] = useState(false);
  const [hosError, setHosError] = useState<string | null>(null);

  const isAdmin = effectiveRole === "ADMIN";

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetch("/api/primes", { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Chargement impossible.");
      setPrimes(Array.isArray(d.primes) ? d.primes : []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erreur réseau.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (status !== "authenticated") return;
    fetch("/api/auth/me", { credentials: "include" })
      .then((r) => (r.ok ? r.json() : null))
      .then((m) => setEffectiveRole(typeof m?.role === "string" ? m.role : null))
      .catch(() => setEffectiveRole((session?.user as { role?: string } | undefined)?.role ?? null));
  }, [status, session?.user]);

  useEffect(() => {
    if (isAdmin) void load();
  }, [isAdmin]);

  const loadHeadOfSales = async (mois: number, annee: number) => {
    setHosLoading(true);
    setHosError(null);
    try {
      const r = await fetch(`/api/primes/head-of-sales?mois=${mois}&annee=${annee}`, { credentials: "include" });
      const d = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(typeof d.error === "string" ? d.error : "Calcul impossible.");
      setHosPrime(d.prime ?? null);
      setHosCollabs(Array.isArray(d.collabs) ? d.collabs : []);
    } catch (e) {
      setHosError(e instanceof Error ? e.message : "Erreur réseau.");
      setHosPrime(null);
      setHosCollabs([]);
    } finally {
      setHosLoading(false);
    }
  };

  const exportHeadOfSales = async () => {
    if (!hosCollabs.length) return;
    try {
      setHosExporting(true);
      const ExcelJS = (await import("exceljs")).default;
      const workbook = new ExcelJS.Workbook();
      const ws = workbook.addWorksheet("Head of Sales");
      const moisLabel = `${MONTHS[hosMois - 1]} ${hosAnnee}`;

      // Palette (ARGB)
      const C_LICORICE = "FF1A1110";
      const C_OLD_ROSE = "FFC08B8B";
      const C_TEA_GREEN = "FFC8F285";
      const C_OLD_LACE = "FFF7EFE6";
      const C_LACE_ALT = "FFFBF6F0";
      const C_WHITE = "FFFFFFFF";
      const C_BORDER = "FFEBDDCF";
      const C_RED = "FFB91C1C";
      const C_GREEN = "FF166534";
      const EUR_FMT = '#,##0.00" €"';
      const softBorder = {
        top: { style: "thin" as const, color: { argb: C_BORDER } },
        left: { style: "thin" as const, color: { argb: C_BORDER } },
        bottom: { style: "thin" as const, color: { argb: C_BORDER } },
        right: { style: "thin" as const, color: { argb: C_BORDER } },
      };
      const capitalized = MONTHS[hosMois - 1].charAt(0).toUpperCase() + MONTHS[hosMois - 1].slice(1);
      const NB_COLS = 8;

      ws.columns = [
        { key: "nom", width: 52 },
        { key: "montant", width: 15, style: { numFmt: EUR_FMT } },
        { key: "marge", width: 15, style: { numFmt: EUR_FMT } },
        { key: "prime", width: 18, style: { numFmt: EUR_FMT } },
        { key: "etat", width: 17 },
        { key: "debut", width: 20, style: { numFmt: EUR_FMT } },
        { key: "fin", width: 20, style: { numFmt: EUR_FMT } },
        { key: "reste", width: 15, style: { numFmt: EUR_FMT } },
      ];

      // --- Titre ---
      ws.mergeCells(1, 1, 1, NB_COLS);
      const titleCell = ws.getCell(1, 1);
      titleCell.value = `Prime Head of Sales — ${capitalized} ${hosAnnee}`;
      titleCell.font = { name: "Calibri", bold: true, size: 16, color: { argb: C_LICORICE } };
      titleCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(1).height = 30;

      // --- Sous-titre ---
      ws.mergeCells(2, 1, 2, NB_COLS);
      const subCell = ws.getCell(2, 1);
      subCell.value = "Prime = taux moyen (3% jusqu'à 35k € · 3,5% au-dessus) × Montant · versée 50% au début et 50% à la fin de campagne";
      subCell.font = { name: "Calibri", italic: true, size: 10, color: { argb: C_OLD_ROSE } };
      subCell.alignment = { vertical: "middle", horizontal: "left" };
      ws.getRow(2).height = 18;

      // --- En-tête ---
      const headerLabels = [
        "Nom de la campagne",
        "Montant",
        "Marge total",
        "% Marge Bénéficiaire",
        "État de la campagne",
        "50% Début de campagne",
        "50% Début de campagne",
        "RESTE À PAYER",
      ];
      const headerRow = ws.addRow(headerLabels);
      headerRow.height = 32;
      headerRow.eachCell((cell) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_LICORICE } };
        cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_WHITE } };
        cell.alignment = { vertical: "middle", horizontal: "center", wrapText: true };
        cell.border = softBorder;
      });

      // Prime de Leyna : taux moyen unique appliqué à chaque campagne.
      const SEUIL = 35000;
      const TAUX_BAS = 0.03;
      const TAUX_HAUT = 0.035;
      const totalCA = hosCollabs.reduce((s, c) => s + c.montantBrut, 0);
      const primeTotale = Math.min(totalCA, SEUIL) * TAUX_BAS + Math.max(totalCA - SEUIL, 0) * TAUX_HAUT;
      const tauxMoyen = totalCA > 0 ? primeTotale / totalCA : 0;

      let totMontant = 0;
      let totMarge = 0;
      let totPrime = 0;
      let totDebut = 0;
      let totFin = 0;
      let totReste = 0;

      hosCollabs.forEach((c, i) => {
        const prime = Math.round(c.montantBrut * tauxMoyen * 100) / 100;
        const debut = Math.round(prime * 0.5 * 100) / 100;
        const fin = Math.round((prime - debut) * 100) / 100;
        const reste = c.encaisse ? 0 : fin;

        totMontant += c.montantBrut;
        totMarge += c.margeTotale;
        totPrime += prime;
        totDebut += debut;
        totFin += fin;
        totReste += reste;

        const row = ws.addRow({
          nom: `${capitalized} ${hosAnnee} - ${c.marque} X ${c.talent}`,
          montant: c.montantBrut,
          marge: c.margeTotale,
          prime,
          etat: STATUT_LABELS[c.statut] ?? c.statut,
          debut,
          fin,
          reste,
        });
        row.height = 20;
        const fill = i % 2 === 0 ? C_WHITE : C_LACE_ALT;
        row.eachCell((cell, col) => {
          cell.border = softBorder;
          cell.font = { name: "Calibri", size: 10, color: { argb: C_LICORICE } };
          cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: fill } };
          cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : col === 5 ? "center" : "right" };
        });
        // Reste à payer : rouge si dû, vert si soldé
        const resteCell = row.getCell(8);
        resteCell.font = { name: "Calibri", size: 10, bold: true, color: { argb: reste > 0 ? C_RED : C_GREEN } };
      });

      // --- Ligne TOTAL ---
      const totalRow = ws.addRow({
        nom: `TOTAL — ${hosCollabs.length} campagne(s)`,
        montant: totMontant,
        marge: totMarge,
        prime: totPrime,
        debut: totDebut,
        fin: totFin,
        reste: totReste,
      });
      totalRow.height = 24;
      totalRow.eachCell((cell, col) => {
        cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: C_TEA_GREEN } };
        cell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_LICORICE } };
        cell.border = softBorder;
        cell.alignment = { vertical: "middle", horizontal: col === 1 ? "left" : col === 5 ? "center" : "right" };
      });

      // --- Récap ---
      ws.addRow({});
      const partBasse = Math.min(totalCA, SEUIL) * TAUX_BAS;
      const partHaute = Math.max(totalCA - SEUIL, 0) * TAUX_HAUT;
      const recap = [
        { label: "C.A du mois", value: hosPrime?.ca ?? totMontant, fmt: EUR_FMT, kind: "eur" },
        { label: "3% du C.A (0 à 35 000 €)", value: partBasse, fmt: EUR_FMT, kind: "eur" },
        { label: "3,5% du C.A au-dessus de 35 000 €", value: partHaute, fmt: EUR_FMT, kind: "eur" },
        { label: "Taux moyen appliqué", value: tauxMoyen * 100, fmt: '0.0000"%"', kind: "pct" },
        { label: "MARGE BÉNÉFICIAIRE (prime totale)", value: hosPrime?.total ?? primeTotale, fmt: EUR_FMT, kind: "prime" },
      ];
      recap.forEach((r) => {
        const row = ws.addRow({ nom: r.label, montant: r.value });
        const labelCell = row.getCell(1);
        const valueCell = row.getCell(2);
        const isPrime = r.kind === "prime";
        labelCell.font = { name: "Calibri", bold: true, size: 11, color: { argb: C_LICORICE } };
        labelCell.alignment = { vertical: "middle", horizontal: "left" };
        valueCell.numFmt = r.fmt;
        valueCell.font = { name: "Calibri", bold: true, size: isPrime ? 13 : 11, color: { argb: isPrime ? C_GREEN : C_LICORICE } };
        valueCell.alignment = { vertical: "middle", horizontal: "left" };
        valueCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: isPrime ? C_OLD_LACE : C_WHITE } };
        if (isPrime) valueCell.border = softBorder;
        row.height = isPrime ? 24 : 20;
      });

      // Gel du titre + en-tête
      ws.views = [{ state: "frozen", ySplit: 3 }];

      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([buffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `head-of-sales-${moisLabel.replace(/\s+/g, "-").toLowerCase()}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      setHosError(e instanceof Error ? e.message : "Export impossible.");
    } finally {
      setHosExporting(false);
    }
  };

  useEffect(() => {
    if (isAdmin) void loadHeadOfSales(hosMois, hosAnnee);
  }, [isAdmin, hosMois, hosAnnee]);

  const pendingCount = useMemo(() => primes.filter((p) => p.statut === "SOUMIS").length, [primes]);
  const filtered = useMemo(() => {
    if (tab === "TOUTES") return primes;
    return primes.filter((p) => p.statut === tab);
  }, [primes, tab]);

  const decide = async (
    id: string,
    action: "validate" | "refuse" | "attach-decision",
    opts?: {
      commentaireAdmin?: string;
      lignesAdmin?: PrimeLigne[];
      primeCAAdmin?: number;
      excelUrl?: string | null;
      excelFileName?: string | null;
    }
  ) => {
    const r = await fetch(`/api/primes/${id}`, {
      method: "PATCH",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action,
        commentaireAdmin: opts?.commentaireAdmin,
        ...(opts?.lignesAdmin !== undefined
          ? { lignesAdmin: opts.lignesAdmin, primeCAAdmin: opts.primeCAAdmin ?? 0 }
          : {}),
        excelUrl: opts?.excelUrl ?? undefined,
        excelFileName: opts?.excelFileName ?? undefined,
      }),
    });
    const d = await r.json().catch(() => ({}));
    if (!r.ok) {
      setError(typeof d.error === "string" ? d.error : "Action impossible.");
      return false;
    }
    await load();
    return true;
  };

  const openDecision = (p: PrimeRow, mode: "validate" | "refuse" | "edit") => {
    setDecisionId(p.id);
    setDecisionMode(mode);
    setCommentaire(mode === "refuse" ? "" : p.commentaireAdmin || "");
    const sourceLignes =
      Array.isArray(p.lignesAdmin) && p.lignesAdmin.length > 0 ? p.lignesAdmin : p.lignes || [];
    setDecisionLignes(sourceLignes.map((l) => ({ ...l, id: l.id || nanoid() })));
    const sourcePrimeCA =
      p.primeCAAdmin != null && Number.isFinite(Number(p.primeCAAdmin))
        ? Number(p.primeCAAdmin)
        : Number(p.primeCA ?? 0);
    setDecisionPrimeCA(String(sourcePrimeCA));
    setDecisionFile(null);
    setRemoveIndex(null);
    setRemoveReason("");
  };

  const applyRetraitWithReason = () => {
    if (removeIndex == null) return;
    const reason = removeReason.trim();
    if (!reason) return;
    setDecisionLignes((prev) =>
      prev.map((row, idx) => {
        if (idx !== removeIndex) return row;
        const was = Number(row.montant || 0);
        const wasLabel =
          was !== 0
            ? ` (annulé : ${new Intl.NumberFormat("fr-FR", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(was)} €)`
            : "";
        return {
          ...row,
          type: "RETRAIT_COLLABORATION" as const,
          description: `${reason}${wasLabel}`,
          // Ligne annulée : plus de crédit. Pour une déduction $, utiliser « + Retrait collaboration ».
          montant: 0,
        };
      })
    );
    setRemoveIndex(null);
    setRemoveReason("");
  };

  const confirmDecision = async () => {
    if (!decisionId) return;
    if (decisionMode === "refuse" && !commentaire.trim()) return;
    setDecisionSaving(true);
    setError(null);
    try {
      const lignesAdmin = decisionLignes
        .map((l) => ({
          ...l,
          description: (l.description || "").trim(),
          talentNom: (l.talentNom || "").trim() || undefined,
          montant: normalizePrimeMontant(l.type, Number(l.montant || 0)),
        }))
        .filter((l) => l.description && l.id);

      const primeCAAdmin = (() => {
        const n = Number(String(decisionPrimeCA).trim().replace(/\s+/g, "").replace(",", "."));
        return Number.isFinite(n) ? Math.round(n * 100) / 100 : 0;
      })();

      const action =
        decisionMode === "edit" ? "attach-decision" : decisionMode === "validate" ? "validate" : "refuse";

      const ok = await decide(decisionId, action, {
        commentaireAdmin: decisionMode === "refuse" ? commentaire.trim() : undefined,
        lignesAdmin,
        primeCAAdmin,
      });
      if (!ok) return;

      if (decisionFile) {
        const fd = new FormData();
        fd.append("file", decisionFile);
        const up = await fetch(`/api/primes/${decisionId}/excel`, {
          method: "POST",
          credentials: "include",
          body: fd,
        });
        const upJson = await up.json().catch(() => ({}));
        if (!up.ok) {
          throw new Error(
            typeof upJson.error === "string"
              ? upJson.error
              : "Décision enregistrée, mais l’upload Excel a échoué. Tu peux le joindre ensuite."
          );
        }
        await load();
      }
      setDecisionId(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Action impossible.");
    } finally {
      setDecisionSaving(false);
    }
  };

  if (status === "loading" || !effectiveRole) {
    return <div className="min-h-[40vh] flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin" style={{ color: OLD_ROSE }} /></div>;
  }
  if (!isAdmin) return <div className="p-6 text-sm">Accès refusé.</div>;

  return (
    <div className="space-y-5" style={{ fontFamily: "Switzer, sans-serif" }}>
      <h1 className="text-3xl font-semibold" style={{ color: LICORICE, fontFamily: "Spectral, serif" }}>Validation des primes</h1>

      <div className="rounded-2xl border bg-white p-4" style={{ borderColor: "#EEDFD1" }}>
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div>
            <p className="font-semibold" style={{ color: LICORICE }}>Prime Head of Sales</p>
            <p className="text-sm" style={{ color: OLD_ROSE }}>3 % du C.A de 0 à 35 000 € · 3,5 % au-dessus (C.A confirmé du mois — uniquement les collabs de la Head of Sales, hors « En négo » et « Perdu »)</p>
          </div>
          <div className="flex items-center gap-2">
            <select
              className="border rounded-lg px-2 py-1.5 text-sm"
              style={{ borderColor: "#D1D5DB", color: LICORICE }}
              value={hosMois}
              onChange={(e) => setHosMois(Number(e.target.value))}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>{m}</option>
              ))}
            </select>
            <select
              className="border rounded-lg px-2 py-1.5 text-sm"
              style={{ borderColor: "#D1D5DB", color: LICORICE }}
              value={hosAnnee}
              onChange={(e) => setHosAnnee(Number(e.target.value))}
            >
              {Array.from({ length: 5 }, (_, i) => now.getUTCFullYear() - i).map((y) => (
                <option key={y} value={y}>{y}</option>
              ))}
            </select>
            <button
              type="button"
              onClick={() => void exportHeadOfSales()}
              disabled={hosExporting || hosCollabs.length === 0}
              className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm disabled:opacity-50"
              style={{ borderColor: OLD_ROSE, color: LICORICE, backgroundColor: "#F5EBE0" }}
            >
              {hosExporting ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
              Exporter Excel
            </button>
          </div>
        </div>

        {hosError && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2 mb-3">{hosError}</div>}

        {hosLoading ? (
          <div className="py-6 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: OLD_ROSE }} /></div>
        ) : hosPrime ? (
          <table className="w-full text-sm">
            <tbody>
              <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                <td className="py-2" style={{ color: LICORICE }}>C.A du mois</td>
                <td className="py-2 text-right font-medium">{eur(hosPrime.ca)}</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                <td className="py-2" style={{ color: OLD_ROSE }}>Tranche 0 – 35 000 € × 3 % ({eur(hosPrime.trancheBasse)})</td>
                <td className="py-2 text-right">{eur(hosPrime.primeBasse)}</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                <td className="py-2" style={{ color: OLD_ROSE }}>Au-dessus de 35 000 € × 3,5 % ({eur(hosPrime.trancheHaute)})</td>
                <td className="py-2 text-right">{eur(hosPrime.primeHaute)}</td>
              </tr>
              <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                <td className="py-2 font-semibold" style={{ color: LICORICE }}>Prime totale Head of Sales</td>
                <td className="py-2 text-right font-semibold">{eur(hosPrime.total)}</td>
              </tr>
            </tbody>
          </table>
        ) : (
          <p className="text-sm" style={{ color: OLD_ROSE }}>Aucune donnée.</p>
        )}
      </div>

      <div className="flex gap-2 flex-wrap">
        {[
          { id: "TOUTES", label: "Toutes" },
          { id: "SOUMIS", label: "À valider" },
          { id: "VALIDE", label: "Validées" },
          { id: "REFUSE", label: "Refusées" },
        ].map((t) => (
          <button
            key={t.id}
            className="px-3 py-1.5 rounded-full border text-sm"
            style={{
              borderColor: tab === t.id ? OLD_ROSE : "#D1D5DB",
              color: LICORICE,
              backgroundColor: tab === t.id ? "#F5EBE0" : "white",
            }}
            onClick={() => setTab(t.id as typeof tab)}
          >
            {t.label} {t.id === "SOUMIS" && <span className="ml-1 px-1.5 py-0.5 rounded-full text-xs bg-red-600 text-white">{pendingCount}</span>}
          </button>
        ))}
      </div>

      {error && <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-lg px-3 py-2">{error}</div>}
      {loading ? (
        <div className="py-10 flex justify-center"><Loader2 className="w-6 h-6 animate-spin" style={{ color: OLD_ROSE }} /></div>
      ) : (
        <div className="space-y-4">
          {filtered.map((p) => {
            const lignesTotal = (p.lignes || []).reduce((s, l) => s + Number(l.montant || 0), 0);
            const total = lignesTotal + Number(p.primeCA || 0);
            return (
              <div key={p.id} className="rounded-2xl border bg-white p-4" style={{ borderColor: "#EEDFD1" }}>
                <div className="flex justify-between items-center mb-3">
                  <div>
                    <p className="font-semibold" style={{ color: LICORICE }}>{p.user.prenom} {p.user.nom}</p>
                    <p className="text-sm" style={{ color: OLD_ROSE }}>{MONTHS[p.mois - 1]} {p.annee}</p>
                  </div>
                  <span className="text-xs rounded-full px-2 py-1" style={{ background: p.statut === "SOUMIS" ? "#FEF3C7" : p.statut === "VALIDE" ? "#DCFCE7" : p.statut === "REFUSE" ? "#FEE2E2" : "#F3F4F6", color: p.statut === "SOUMIS" ? "#92400E" : p.statut === "VALIDE" ? "#166534" : p.statut === "REFUSE" ? "#991B1B" : "#374151" }}>
                    {p.statut}
                  </span>
                </div>
                <table className="w-full text-sm">
                  <thead><tr className="text-left" style={{ color: OLD_ROSE }}><th className="py-2">Type</th><th className="py-2">Description</th><th className="py-2">Talent</th><th className="py-2 text-right">Montant</th></tr></thead>
                  <tbody>
                    {(p.lignes || []).map((l) => (
                      <tr key={l.id} className="border-t" style={{ borderColor: "#F2E9DD", backgroundColor: l.type === "RETRAIT_COLLABORATION" ? "#FEF2F2" : undefined }}>
                        <td className="py-2">{PRIME_TYPE_LABELS[l.type] || l.type}</td>
                        <td className="py-2">{l.description}</td>
                        <td className="py-2">{l.talentNom || "—"}</td>
                        <td className="py-2 text-right" style={{ color: Number(l.montant) < 0 ? "#B91C1C" : undefined }}>{eur(Number(l.montant || 0))}</td>
                      </tr>
                    ))}
                    <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                      <td colSpan={3} className="py-2 italic" style={{ color: OLD_ROSE }}>Prime CA (5% marge pôle management)</td>
                      <td className="py-2 text-right italic">{eur(Number(p.primeCA || 0))}</td>
                    </tr>
                    <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                      <td colSpan={3} className="py-2 font-semibold" style={{ color: LICORICE }}>Total</td>
                      <td className="py-2 text-right font-semibold">{eur(total)}</td>
                    </tr>
                  </tbody>
                </table>

                {p.commentaireAdmin && <p className="mt-2 text-sm text-red-700">{p.commentaireAdmin}</p>}

                {(Array.isArray(p.lignesAdmin) && p.lignesAdmin.length > 0) || p.primeCAAdmin != null || p.excelUrl ? (
                  <div className="mt-4 rounded-xl border p-3" style={{ borderColor: TEA_GREEN, backgroundColor: "#F7FBF0" }}>
                    <p className="text-sm font-semibold mb-2" style={{ color: LICORICE }}>Tableau validé / corrigé (admin)</p>
                    {Array.isArray(p.lignesAdmin) && p.lignesAdmin.length > 0 ? (
                      <table className="w-full text-sm mb-2">
                        <tbody>
                          {p.lignesAdmin.map((l) => (
                            <tr key={l.id} className="border-t" style={{ borderColor: "#E5EED6", backgroundColor: l.type === "RETRAIT_COLLABORATION" ? "#FEF2F2" : undefined }}>
                              <td className="py-1.5">{PRIME_TYPE_LABELS[l.type] || l.type}</td>
                              <td className="py-1.5">{l.description}</td>
                              <td className="py-1.5">{l.talentNom || "—"}</td>
                              <td className="py-1.5 text-right" style={{ color: Number(l.montant) < 0 ? "#B91C1C" : undefined }}>{eur(Number(l.montant || 0))}</td>
                            </tr>
                          ))}
                          <tr className="border-t" style={{ borderColor: "#E5EED6" }}>
                            <td colSpan={3} className="py-1.5 italic" style={{ color: OLD_ROSE }}>Prime CA</td>
                            <td className="py-1.5 text-right italic">{eur(Number(p.primeCAAdmin || 0))}</td>
                          </tr>
                          <tr className="border-t" style={{ borderColor: "#E5EED6" }}>
                            <td colSpan={3} className="py-1.5 font-semibold">Total corrigé</td>
                            <td className="py-1.5 text-right font-semibold">
                              {eur(
                                (p.lignesAdmin || []).reduce((s, l) => s + Number(l.montant || 0), 0) +
                                  Number(p.primeCAAdmin || 0)
                              )}
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    ) : null}
                    {p.excelUrl ? (
                      <a
                        href={p.excelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex text-sm underline"
                        style={{ color: LICORICE }}
                      >
                        Télécharger Excel{p.excelFileName ? ` (${p.excelFileName})` : ""}
                      </a>
                    ) : null}
                  </div>
                ) : null}

                {p.statut === "SOUMIS" && (
                  <div className="mt-3 flex gap-2">
                    <button
                      className="px-3 py-1.5 rounded-lg text-sm font-medium"
                      style={{ backgroundColor: TEA_GREEN, color: LICORICE }}
                      onClick={() => openDecision(p, "validate")}
                    >
                      Valider / corriger
                    </button>
                    <button
                      className="px-3 py-1.5 rounded-lg text-sm font-medium bg-red-600 text-white"
                      onClick={() => openDecision(p, "refuse")}
                    >
                      Refuser
                    </button>
                  </div>
                )}

                {(p.statut === "REFUSE" || p.statut === "VALIDE") && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    <button
                      type="button"
                      className="px-3 py-1.5 rounded-lg border text-sm"
                      style={{ borderColor: OLD_ROSE, color: LICORICE }}
                      onClick={() => openDecision(p, "edit")}
                    >
                      Refaire le tableau du mois
                    </button>
                    <label className="inline-flex items-center gap-2 text-sm cursor-pointer px-3 py-1.5 rounded-lg border" style={{ borderColor: OLD_ROSE, color: LICORICE }}>
                      {p.excelUrl ? "Remplacer l’Excel" : "Joindre un Excel"}
                      <input
                        type="file"
                        accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                        className="hidden"
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          setError(null);
                          const fd = new FormData();
                          fd.append("file", file);
                          const up = await fetch(`/api/primes/${p.id}/excel`, {
                            method: "POST",
                            credentials: "include",
                            body: fd,
                          });
                          const upJson = await up.json().catch(() => ({}));
                          if (!up.ok) {
                            setError(typeof upJson.error === "string" ? upJson.error : "Upload impossible.");
                            return;
                          }
                          await load();
                        }}
                      />
                    </label>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {decisionId && (
        <div className="fixed inset-0 z-[120] bg-black/40 flex items-center justify-center p-4 overflow-y-auto">
          <div className="w-full max-w-3xl rounded-2xl bg-white border p-4 my-6" style={{ borderColor: "#EEDFD1" }}>
            <h3 className="text-lg font-semibold mb-1" style={{ color: LICORICE }}>
              {decisionMode === "validate"
                ? "Valider et fixer le tableau du mois"
                : decisionMode === "refuse"
                  ? "Refuser et corriger les primes"
                  : "Refaire le tableau du mois"}
            </h3>
            <p className="text-sm mb-3" style={{ color: OLD_ROSE }}>
              {decisionMode === "validate"
                ? "Ajuste si besoin les montants validés — c’est ce que Manon verra comme résultat final."
                : decisionMode === "refuse"
                  ? "Ajuste le tableau ci-dessous (ce que Manon verra comme résultat) et joins éventuellement un Excel téléchargeable."
                  : "Remplace le tableau validé / corrigé visible par Manon pour ce mois."}
            </p>

            <div className="overflow-x-auto mb-3">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left" style={{ color: OLD_ROSE }}>
                    <th className="py-2">Type</th>
                    <th className="py-2">Description</th>
                    <th className="py-2">Talent</th>
                    <th className="py-2 text-right">Montant</th>
                    <th className="py-2" />
                  </tr>
                </thead>
                <tbody>
                  {decisionLignes.map((l, i) => {
                    const isRetrait = isRetraitPrimeType(l.type);
                    return (
                    <tr key={l.id} className="border-t" style={{ borderColor: "#F2E9DD", backgroundColor: isRetrait ? "#FEF2F2" : undefined }}>
                      <td className="py-2 pr-2">
                        <select
                          className="border rounded px-2 py-1 text-xs w-full"
                          value={l.type}
                          onChange={(e) => {
                            const type = e.target.value as PrimeLigneType;
                            setDecisionLignes((prev) =>
                              prev.map((row, idx) =>
                                idx === i
                                  ? { ...row, type, montant: normalizePrimeMontant(type, Number(row.montant || 0)) }
                                  : row
                              )
                            );
                          }}
                        >
                          {PRIME_TYPE_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={l.description}
                          placeholder={isRetrait ? "Raison du retrait…" : "Description"}
                          onChange={(e) => {
                            const description = e.target.value;
                            setDecisionLignes((prev) => prev.map((row, idx) => (idx === i ? { ...row, description } : row)));
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2">
                        <input
                          className="border rounded px-2 py-1 w-full"
                          value={l.talentNom ?? ""}
                          onChange={(e) => {
                            const talentNom = e.target.value;
                            setDecisionLignes((prev) => prev.map((row, idx) => (idx === i ? { ...row, talentNom } : row)));
                          }}
                        />
                      </td>
                      <td className="py-2 pr-2 text-right">
                        <input
                          type="number"
                          step="0.01"
                          className="border rounded px-2 py-1 w-28 text-right"
                          style={{ color: isRetrait || Number(l.montant) < 0 ? "#B91C1C" : undefined }}
                          value={isRetrait ? -Math.abs(Number(l.montant || 0)) : l.montant}
                          onChange={(e) => {
                            const raw = Number(String(e.target.value || "0").replace(",", "."));
                            const montant = normalizePrimeMontant(l.type, raw);
                            setDecisionLignes((prev) => prev.map((row, idx) => (idx === i ? { ...row, montant } : row)));
                          }}
                        />
                      </td>
                      <td className="py-2">
                        {isRetrait ? (
                          <button
                            type="button"
                            className="text-xs text-red-700"
                            onClick={() => setDecisionLignes((prev) => prev.filter((_, idx) => idx !== i))}
                          >
                            Supprimer
                          </button>
                        ) : (
                          <button
                            type="button"
                            className="text-xs text-red-700"
                            onClick={() => {
                              setRemoveIndex(i);
                              setRemoveReason("");
                            }}
                          >
                            Retirer
                          </button>
                        )}
                      </td>
                    </tr>
                    );
                  })}
                  <tr className="border-t" style={{ borderColor: "#F2E9DD" }}>
                    <td colSpan={3} className="py-2 italic" style={{ color: OLD_ROSE }}>Prime CA</td>
                    <td className="py-2 text-right">
                      <input
                        type="text"
                        inputMode="decimal"
                        className="border rounded px-2 py-1 w-28 text-right"
                        value={decisionPrimeCA}
                        onChange={(e) => setDecisionPrimeCA(e.target.value)}
                      />
                    </td>
                    <td />
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap gap-2 mb-3">
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: OLD_ROSE, color: LICORICE }}
                onClick={() =>
                  setDecisionLignes((prev) => [
                    ...prev,
                    { id: nanoid(), type: "AUTRE", description: "", talentNom: "", montant: 0 },
                  ])
                }
              >
                + Ajouter une ligne
              </button>
              <button
                type="button"
                className="px-3 py-1.5 rounded-lg border text-sm"
                style={{ borderColor: "#FECACA", color: "#991B1B", backgroundColor: "#FEF2F2" }}
                onClick={() =>
                  setDecisionLignes((prev) => [
                    ...prev,
                    {
                      id: nanoid(),
                      type: "RETRAIT_COLLABORATION",
                      description: "",
                      talentNom: "",
                      montant: 0,
                    },
                  ])
                }
              >
                + Retrait collaboration
              </button>
              <label className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg border text-sm cursor-pointer" style={{ borderColor: OLD_ROSE, color: LICORICE }}>
                {decisionFile ? `Excel : ${decisionFile.name}` : "Uploader un Excel"}
                <input
                  type="file"
                  accept=".xlsx,.xls,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel"
                  className="hidden"
                  onChange={(e) => setDecisionFile(e.target.files?.[0] ?? null)}
                />
              </label>
            </div>

            {removeIndex != null && (
              <div className="mb-3 rounded-xl border p-3" style={{ borderColor: "#FECACA", backgroundColor: "#FEF2F2" }}>
                <p className="text-sm font-medium mb-2" style={{ color: "#991B1B" }}>
                  Raison du retrait (obligatoire)
                </p>
                <p className="text-xs mb-2" style={{ color: OLD_ROSE }}>
                  La ligne est annulée (0 €) avec ta raison. Pour déduire un montant (collab annulée), utilise « + Retrait collaboration ».
                </p>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 min-h-[80px] text-sm"
                  value={removeReason}
                  onChange={(e) => setRemoveReason(e.target.value)}
                  placeholder="Ex. : collaboration annulée par la marque…"
                  autoFocus
                />
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    className="px-3 py-1.5 border rounded-lg text-sm"
                    onClick={() => {
                      setRemoveIndex(null);
                      setRemoveReason("");
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    type="button"
                    className="px-3 py-1.5 rounded-lg text-sm text-white disabled:opacity-50"
                    style={{ backgroundColor: "#DC2626" }}
                    disabled={!removeReason.trim()}
                    onClick={applyRetraitWithReason}
                  >
                    Confirmer le retrait
                  </button>
                </div>
              </div>
            )}

            {decisionMode === "refuse" && (
              <textarea
                className="w-full border rounded-lg px-3 py-2 min-h-[100px]"
                value={commentaire}
                onChange={(e) => setCommentaire(e.target.value)}
                placeholder="Motif du refus (obligatoire)…"
              />
            )}
            <div className="mt-3 flex justify-end gap-2">
              <button className="px-3 py-2 border rounded-lg" disabled={decisionSaving} onClick={() => setDecisionId(null)}>Annuler</button>
              <button
                className="px-3 py-2 rounded-lg text-white disabled:opacity-50 inline-flex items-center gap-2"
                style={{
                  backgroundColor: decisionMode === "refuse" ? "#DC2626" : LICORICE,
                  color: decisionMode === "refuse" ? "white" : TEA_GREEN,
                }}
                disabled={(decisionMode === "refuse" && !commentaire.trim()) || decisionSaving}
                onClick={() => void confirmDecision()}
              >
                {decisionSaving ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                {decisionMode === "validate"
                  ? "Valider ce tableau"
                  : decisionMode === "refuse"
                    ? "Confirmer le refus"
                    : "Enregistrer le tableau"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

