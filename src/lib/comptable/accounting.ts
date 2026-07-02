/**
 * 📊 MOTEUR COMPTABLE — Glow Up Agence
 *
 * Transforme les pièces de la plateforme (factures, avoirs, encaissements Qonto)
 * en données exploitables par un expert-comptable :
 *   - Écritures en PARTIE DOUBLE (base du FEC et des journaux)
 *   - Journal des ventes / Journal de banque
 *   - Récapitulatif TVA (préparation CA3)
 *   - Balance auxiliaire clients (créances, compte 411)
 *
 * Sources comptables (et NON les "collaborations" marketing) :
 *   - Document (type FACTURE / AVOIR)  → journal des ventes
 *   - TransactionQonto (encaissements) → journal de banque
 *   - TransactionDocumentMatch         → lettrage client
 */

import prisma from "@/lib/prisma";

// ============================================================
// PLAN COMPTABLE (PCG simplifié, prestations de services)
// ============================================================

export const PLAN_COMPTABLE = {
  CLIENT: { num: "411000", lib: "Clients" },
  VENTES: { num: "706000", lib: "Prestations de services" },
  TVA_COLLECTEE: { num: "445710", lib: "TVA collectée" },
  BANQUE: { num: "512000", lib: "Banque - Qonto" },
  ATTENTE: { num: "471000", lib: "Compte d'attente à classer" },
} as const;

export const JOURNAUX = {
  VENTES: { code: "VT", lib: "Journal des ventes" },
  BANQUE: { code: "BQ", lib: "Journal de banque" },
} as const;

// Statuts de documents réellement comptabilisables (on exclut brouillons / annulés / refusés)
const STATUTS_COMPTABILISABLES = ["ENVOYE", "VALIDE", "PAYE"] as const;

// ============================================================
// TYPES
// ============================================================

export interface Periode {
  dateDebut: Date;
  dateFin: Date;
}

/** Une ligne d'écriture au format FEC (18 colonnes réglementaires). */
export interface FecLine {
  JournalCode: string;
  JournalLib: string;
  EcritureNum: string;
  EcritureDate: string; // AAAAMMJJ
  CompteNum: string;
  CompteLib: string;
  CompAuxNum: string;
  CompAuxLib: string;
  PieceRef: string;
  PieceDate: string; // AAAAMMJJ
  EcritureLib: string;
  Debit: number;
  Credit: number;
  EcritureLet: string;
  DateLet: string; // AAAAMMJJ ou vide
  ValidDate: string; // AAAAMMJJ
  Montantdevise: string;
  Idevise: string;
}

export interface VenteRow {
  date: Date;
  reference: string;
  type: "FACTURE" | "AVOIR";
  client: string;
  clientCompteAux: string;
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  regimeTVA: string;
  statut: string;
  echeance: Date | null;
  paiement: Date | null;
  encaisse: number;
  restantDu: number;
  lettrage: string;
}

export interface BanqueRow {
  date: Date;
  libelle: string;
  emetteur: string;
  reference: string;
  montant: number;
  statut: string;
  facturesRapprochees: string[];
  rapproche: boolean;
  horsPlateforme: boolean;
}

export interface TvaRow {
  taux: number;
  regime: string;
  baseHT: number;
  montantTVA: number;
  nbPieces: number;
}

export interface CreanceRow {
  client: string;
  clientCompteAux: string;
  totalFacture: number;
  totalEncaisse: number;
  restantDu: number;
  nbFactures: number;
  enRetard: number;
}

export interface ComptaSummary {
  periode: { dateDebut: string; dateFin: string };
  caHT: number;
  tvaCollectee: number;
  caTTC: number;
  totalAvoirsHT: number;
  nbFactures: number;
  nbAvoirs: number;
  encaissementsBanque: number;
  encaissementsRapproches: number;
  encaissementsNonRapproches: number;
  creancesClients: number;
  creancesEnRetard: number;
  nbEcritures: number;
  tvaParTaux: TvaRow[];
  // TVA sur encaissements (régime services)
  tvaExigibleEncaissement: number;
  tvaEncaissementParTaux: TvaEncaissementRow[];
  encaissementsNonLettres: number;
  // Contrôles
  nbAnomalies: number;
  nbAnomaliesBloquantes: number;
}

interface DocumentCompta {
  id: string;
  reference: string;
  type: string;
  statut: string;
  dateEmission: Date;
  dateEcheance: Date | null;
  datePaiement: Date | null;
  montantHT: number;
  tauxTVA: number;
  montantTVA: number;
  montantTTC: number;
  devise: string;
  typeTVA: string;
  clientNom: string;
  clientCompteAux: string;
  clientSiret: string | null;
  clientTVA: string | null;
  hasPdf: boolean;
  encaisse: number;
}

interface MatchCompta {
  montant: number;
  documentId: string;
  reference: string;
  tauxTVA: number;
  typeTVA: string;
  docType: string;
}

interface TransactionCompta {
  id: string;
  montant: number;
  devise: string;
  libelle: string;
  emetteur: string;
  reference: string;
  dateTransaction: Date;
  statut: string;
  horsPlateforme: boolean;
  matches: MatchCompta[];
}

export interface ComptaData {
  documents: DocumentCompta[];
  transactions: TransactionCompta[];
  lettrageParDocument: Map<string, string>;
  dateLetParDocument: Map<string, Date>;
}

// ---- TVA sur encaissements (services) ----
export interface TvaEncaissementRow {
  taux: number;
  regime: string;
  baseEncaisseeHT: number;
  tvaExigible: number;
  nbReglements: number;
}

// ---- Grand livre ----
export interface GrandLivreLigne {
  date: string; // AAAAMMJJ
  journal: string;
  piece: string;
  libelle: string;
  compAux: string;
  debit: number;
  credit: number;
  solde: number;
  lettrage: string;
}

export interface GrandLivreCompte {
  compteNum: string;
  compteLib: string;
  lignes: GrandLivreLigne[];
  totalDebit: number;
  totalCredit: number;
  solde: number;
}

// ---- Balance générale ----
export interface BalanceLigne {
  compteNum: string;
  compteLib: string;
  debit: number;
  credit: number;
  soldeDebiteur: number;
  soldeCrediteur: number;
}

// ---- Contrôles / anomalies ----
export type AnomalieGravite = "error" | "warning";

export interface Anomalie {
  gravite: AnomalieGravite;
  categorie: string;
  message: string;
  reference: string | null;
  montant: number | null;
}

// ============================================================
// HELPERS
// ============================================================

function n(value: unknown): number {
  const num = Number(value ?? 0);
  return Number.isFinite(num) ? num : 0;
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/** Date au format FEC AAAAMMJJ. */
export function fecDate(date: Date | null): string {
  if (!date) return "";
  const d = new Date(date);
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}${m}${day}`;
}

/** Libellé lisible du régime de TVA. */
export function regimeTVALabel(typeTVA: string): string {
  switch (typeTVA) {
    case "FRANCE":
      return "TVA France";
    case "EU_INTRACOM":
      return "Autoliquidation intracom. (art. 283-2 CGI)";
    case "EU_SANS_TVA":
      return "Exonération UE";
    case "HORS_EU":
      return "Exonération hors UE (art. 259 B CGI)";
    default:
      return typeTVA;
  }
}

/** Code de compte auxiliaire client stable et lisible à partir du nom. */
export function clientAuxCode(nom: string | null | undefined): string {
  const base = (nom || "DIVERS")
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^A-Z0-9]/g, "");
  return (base || "DIVERS").slice(0, 12).padEnd(3, "X");
}

/** Génère un code de lettrage alphabétique (AAA, AAB, …, ABA …). */
export function lettrageCode(index: number): string {
  let i = index;
  let code = "";
  for (let p = 0; p < 3; p++) {
    code = String.fromCharCode(65 + (i % 26)) + code;
    i = Math.floor(i / 26);
  }
  return code;
}

// ============================================================
// CHARGEMENT DES DONNÉES
// ============================================================

export async function getComptaData(periode: Periode): Promise<ComptaData> {
  const { dateDebut, dateFin } = periode;

  const docs = await prisma.document.findMany({
    where: {
      type: { in: ["FACTURE", "AVOIR"] },
      statut: { in: [...STATUTS_COMPTABILISABLES] },
      dateEmission: { gte: dateDebut, lte: dateFin },
    },
    select: {
      id: true,
      reference: true,
      type: true,
      statut: true,
      dateEmission: true,
      dateEcheance: true,
      datePaiement: true,
      montantHT: true,
      tauxTVA: true,
      montantTVA: true,
      montantTTC: true,
      devise: true,
      typeTVA: true,
      clientNom: true,
      fichierUrl: true,
      signedDocumentUrl: true,
      collaboration: {
        select: {
          marque: { select: { nom: true, siret: true, numeroTVA: true } },
        },
      },
      transactionMatches: { select: { montant: true } },
    },
    orderBy: { dateEmission: "asc" },
  });

  // Liste des documents disposant d'un PDF en base (sans charger le contenu base64)
  const docIds = docs.map((d) => d.id);
  const pdfRows = docIds.length
    ? await prisma.document.findMany({
        where: { id: { in: docIds }, NOT: { pdfBase64: null } },
        select: { id: true },
      })
    : [];
  const idsAvecPdfBase64 = new Set(pdfRows.map((r) => r.id));

  const documents: DocumentCompta[] = docs.map((d) => {
    const clientNom =
      d.collaboration?.marque?.nom?.trim() ||
      d.clientNom?.trim() ||
      "Client divers";
    const encaisse = d.transactionMatches.reduce(
      (s, m) => s + n(m.montant),
      0
    );
    const hasPdf =
      Boolean(d.fichierUrl) ||
      Boolean(d.signedDocumentUrl) ||
      idsAvecPdfBase64.has(d.id);
    // Les avoirs peuvent être stockés avec des montants positifs OU négatifs selon
    // la saisie. Le sens comptable (débit/crédit) est porté par le type du document,
    // donc on normalise systématiquement les montants en valeur absolue.
    return {
      id: d.id,
      reference: d.reference,
      type: d.type,
      statut: d.statut,
      dateEmission: d.dateEmission,
      dateEcheance: d.dateEcheance,
      datePaiement: d.datePaiement,
      montantHT: Math.abs(n(d.montantHT)),
      tauxTVA: Math.abs(n(d.tauxTVA)),
      montantTVA: Math.abs(n(d.montantTVA)),
      montantTTC: Math.abs(n(d.montantTTC)),
      devise: d.devise || "EUR",
      typeTVA: d.typeTVA,
      clientNom,
      clientCompteAux: clientAuxCode(clientNom),
      clientSiret: d.collaboration?.marque?.siret?.trim() || null,
      clientTVA: d.collaboration?.marque?.numeroTVA?.trim() || null,
      hasPdf,
      encaisse: round2(encaisse),
    };
  });

  const txs = await prisma.transactionQonto.findMany({
    where: {
      dateTransaction: { gte: dateDebut, lte: dateFin },
      // Journal de banque ventes : encaissements uniquement (les débits
      // sont gérés par le module Dépenses).
      side: "credit",
    },
    select: {
      id: true,
      montant: true,
      devise: true,
      libelle: true,
      emetteur: true,
      reference: true,
      dateTransaction: true,
      statut: true,
      horsPlateforme: true,
      matches: {
        select: {
          montant: true,
          documentId: true,
          document: {
            select: {
              reference: true,
              tauxTVA: true,
              typeTVA: true,
              type: true,
            },
          },
        },
      },
    },
    orderBy: { dateTransaction: "asc" },
  });

  const transactions: TransactionCompta[] = txs.map((t) => ({
    id: t.id,
    montant: n(t.montant),
    devise: t.devise || "EUR",
    libelle: t.libelle || "Encaissement",
    emetteur: t.emetteur || "",
    reference: t.reference || "",
    dateTransaction: t.dateTransaction,
    statut: t.statut,
    horsPlateforme: t.horsPlateforme,
    matches: t.matches.map((m) => ({
      montant: n(m.montant),
      documentId: m.documentId,
      reference: m.document?.reference || "",
      tauxTVA: Math.abs(n(m.document?.tauxTVA)),
      typeTVA: m.document?.typeTVA || "FRANCE",
      docType: m.document?.type || "FACTURE",
    })),
  }));

  // Lettrage : on lettre les factures dont le total rapproché ≈ TTC (lettrage équilibré).
  const lettrageParDocument = new Map<string, string>();
  const dateLetParDocument = new Map<string, Date>();
  const dateMatchParDoc = new Map<string, Date>();
  for (const t of transactions) {
    for (const m of t.matches) {
      const prev = dateMatchParDoc.get(m.documentId);
      if (!prev || t.dateTransaction > prev) {
        dateMatchParDoc.set(m.documentId, t.dateTransaction);
      }
    }
  }

  let letterIndex = 0;
  for (const doc of documents) {
    if (doc.type !== "FACTURE") continue;
    if (doc.encaisse <= 0) continue;
    if (Math.abs(doc.encaisse - doc.montantTTC) <= 0.01) {
      lettrageParDocument.set(doc.id, lettrageCode(letterIndex++));
      const dl = dateMatchParDoc.get(doc.id) || doc.datePaiement;
      if (dl) dateLetParDocument.set(doc.id, dl);
    }
  }

  return { documents, transactions, lettrageParDocument, dateLetParDocument };
}

// ============================================================
// CONSTRUCTION DES ÉCRITURES (PARTIE DOUBLE → FEC)
// ============================================================

export function buildEcritures(data: ComptaData): FecLine[] {
  const lines: FecLine[] = [];
  const validDate = fecDate(new Date());

  // ---- Journal des ventes ----
  let numVente = 0;
  for (const doc of data.documents) {
    numVente += 1;
    const ecritureNum = `VT${String(numVente).padStart(5, "0")}`;
    const date = fecDate(doc.dateEmission);
    const isAvoir = doc.type === "AVOIR";
    const sens = isAvoir ? -1 : 1;
    const libelle = `${isAvoir ? "Avoir" : "Facture"} ${doc.reference} - ${doc.clientNom}`;
    const let_ = data.lettrageParDocument.get(doc.id) || "";
    const dateLet = data.dateLetParDocument.get(doc.id);

    // Le compte client porte HT + TVA pour garantir l'équilibre de l'écriture
    // (évite les écarts d'arrondi si le TTC stocké ≠ HT + TVA).
    const ttcClient = round2(doc.montantHT + doc.montantTVA);

    // 411 Client : débit TTC (crédit si avoir)
    lines.push(
      makeLine({
        journal: JOURNAUX.VENTES,
        ecritureNum,
        ecritureDate: date,
        compteNum: PLAN_COMPTABLE.CLIENT.num,
        compteLib: PLAN_COMPTABLE.CLIENT.lib,
        compAuxNum: doc.clientCompteAux,
        compAuxLib: doc.clientNom,
        pieceRef: doc.reference,
        pieceDate: date,
        libelle,
        debit: sens > 0 ? ttcClient : 0,
        credit: sens > 0 ? 0 : ttcClient,
        let_,
        dateLet: let_ ? fecDate(dateLet || null) : "",
        validDate,
        devise: doc.devise,
      })
    );

    // 706 Ventes : crédit HT (débit si avoir)
    lines.push(
      makeLine({
        journal: JOURNAUX.VENTES,
        ecritureNum,
        ecritureDate: date,
        compteNum: PLAN_COMPTABLE.VENTES.num,
        compteLib: PLAN_COMPTABLE.VENTES.lib,
        compAuxNum: "",
        compAuxLib: "",
        pieceRef: doc.reference,
        pieceDate: date,
        libelle,
        debit: sens > 0 ? 0 : doc.montantHT,
        credit: sens > 0 ? doc.montantHT : 0,
        let_: "",
        dateLet: "",
        validDate,
        devise: doc.devise,
      })
    );

    // 44571 TVA collectée : crédit TVA (débit si avoir) — uniquement si TVA > 0
    if (doc.montantTVA > 0.005) {
      lines.push(
        makeLine({
          journal: JOURNAUX.VENTES,
          ecritureNum,
          ecritureDate: date,
          compteNum: PLAN_COMPTABLE.TVA_COLLECTEE.num,
          compteLib: PLAN_COMPTABLE.TVA_COLLECTEE.lib,
          compAuxNum: "",
          compAuxLib: "",
          pieceRef: doc.reference,
          pieceDate: date,
          libelle: `${libelle} - TVA ${doc.tauxTVA}%`,
          debit: sens > 0 ? 0 : doc.montantTVA,
          credit: sens > 0 ? doc.montantTVA : 0,
          let_: "",
          dateLet: "",
          validDate,
          devise: doc.devise,
        })
      );
    }
  }

  // ---- Journal de banque ----
  let numBanque = 0;
  for (const tx of data.transactions) {
    if (round2(tx.montant) <= 0) continue;
    numBanque += 1;
    const ecritureNum = `BQ${String(numBanque).padStart(5, "0")}`;
    const date = fecDate(tx.dateTransaction);
    const baseLib = tx.emetteur
      ? `Encaissement ${tx.emetteur}`
      : tx.libelle || "Encaissement";

    // 512 Banque : débit du montant encaissé
    lines.push(
      makeLine({
        journal: JOURNAUX.BANQUE,
        ecritureNum,
        ecritureDate: date,
        compteNum: PLAN_COMPTABLE.BANQUE.num,
        compteLib: PLAN_COMPTABLE.BANQUE.lib,
        compAuxNum: "",
        compAuxLib: "",
        pieceRef: tx.reference || tx.id.slice(0, 10),
        pieceDate: date,
        libelle: baseLib,
        debit: round2(tx.montant),
        credit: 0,
        let_: "",
        dateLet: "",
        validDate,
        devise: tx.devise,
      })
    );

    // Contreparties
    const totalMatch = round2(tx.matches.reduce((s, m) => s + m.montant, 0));

    for (const m of tx.matches) {
      const doc = data.documents.find((d) => d.id === m.documentId);
      const clientNom = doc?.clientNom || "Client";
      const let_ = data.lettrageParDocument.get(m.documentId) || "";
      const dateLet = data.dateLetParDocument.get(m.documentId);
      lines.push(
        makeLine({
          journal: JOURNAUX.BANQUE,
          ecritureNum,
          ecritureDate: date,
          compteNum: PLAN_COMPTABLE.CLIENT.num,
          compteLib: PLAN_COMPTABLE.CLIENT.lib,
          compAuxNum: doc?.clientCompteAux || clientAuxCode(clientNom),
          compAuxLib: clientNom,
          pieceRef: m.reference || tx.reference || tx.id.slice(0, 10),
          pieceDate: date,
          libelle: `Règlement ${m.reference || ""} ${clientNom}`.trim(),
          debit: 0,
          credit: round2(m.montant),
          let_,
          dateLet: let_ ? fecDate(dateLet || tx.dateTransaction) : "",
          validDate,
          devise: tx.devise,
        })
      );
    }

    // Reliquat non rapproché → compte d'attente à classer.
    // reliquat > 0 : part non rapprochée (crédit 471).
    // reliquat < 0 : sur-allocation des rapprochements (débit 471 pour rééquilibrer).
    const reliquat = round2(tx.montant - totalMatch);
    if (Math.abs(reliquat) > 0.005) {
      lines.push(
        makeLine({
          journal: JOURNAUX.BANQUE,
          ecritureNum,
          ecritureDate: date,
          compteNum: PLAN_COMPTABLE.ATTENTE.num,
          compteLib: PLAN_COMPTABLE.ATTENTE.lib,
          compAuxNum: "",
          compAuxLib: "",
          pieceRef: tx.reference || tx.id.slice(0, 10),
          pieceDate: date,
          libelle: tx.horsPlateforme
            ? `${baseLib} (hors plateforme - à classer)`
            : `${baseLib} (à rapprocher)`,
          debit: reliquat < 0 ? -reliquat : 0,
          credit: reliquat > 0 ? reliquat : 0,
          let_: "",
          dateLet: "",
          validDate,
          devise: tx.devise,
        })
      );
    }
  }

  return lines;
}

function makeLine(opts: {
  journal: { code: string; lib: string };
  ecritureNum: string;
  ecritureDate: string;
  compteNum: string;
  compteLib: string;
  compAuxNum: string;
  compAuxLib: string;
  pieceRef: string;
  pieceDate: string;
  libelle: string;
  debit: number;
  credit: number;
  let_: string;
  dateLet: string;
  validDate: string;
  devise: string;
}): FecLine {
  return {
    JournalCode: opts.journal.code,
    JournalLib: opts.journal.lib,
    EcritureNum: opts.ecritureNum,
    EcritureDate: opts.ecritureDate,
    CompteNum: opts.compteNum,
    CompteLib: opts.compteLib,
    CompAuxNum: opts.compAuxNum,
    CompAuxLib: opts.compAuxLib,
    PieceRef: opts.pieceRef,
    PieceDate: opts.pieceDate,
    EcritureLib: opts.libelle,
    Debit: round2(opts.debit),
    Credit: round2(opts.credit),
    EcritureLet: opts.let_,
    DateLet: opts.dateLet,
    ValidDate: opts.validDate,
    Montantdevise: opts.devise && opts.devise !== "EUR" ? String(round2(opts.debit || opts.credit)) : "",
    Idevise: opts.devise && opts.devise !== "EUR" ? opts.devise : "",
  };
}

// ============================================================
// JOURNAUX & SYNTHÈSES (pour affichage et exports tabulaires)
// ============================================================

export function buildJournalVentes(data: ComptaData): VenteRow[] {
  return data.documents.map((doc) => {
    const restantDu = round2(doc.montantTTC - doc.encaisse);
    return {
      date: doc.dateEmission,
      reference: doc.reference,
      type: doc.type as "FACTURE" | "AVOIR",
      client: doc.clientNom,
      clientCompteAux: doc.clientCompteAux,
      montantHT: doc.montantHT,
      tauxTVA: doc.tauxTVA,
      montantTVA: doc.montantTVA,
      montantTTC: doc.montantTTC,
      regimeTVA: regimeTVALabel(doc.typeTVA),
      statut: doc.statut,
      echeance: doc.dateEcheance,
      paiement: doc.datePaiement,
      encaisse: doc.encaisse,
      restantDu,
      lettrage: data.lettrageParDocument.get(doc.id) || "",
    };
  });
}

export function buildJournalBanque(data: ComptaData): BanqueRow[] {
  return data.transactions
    .filter((t) => t.montant > 0)
    .map((t) => ({
      date: t.dateTransaction,
      libelle: t.libelle,
      emetteur: t.emetteur,
      reference: t.reference,
      montant: round2(t.montant),
      statut: t.statut,
      facturesRapprochees: t.matches.map((m) => m.reference).filter(Boolean),
      rapproche: t.matches.length > 0,
      horsPlateforme: t.horsPlateforme,
    }));
}

export function buildTvaSummary(data: ComptaData): TvaRow[] {
  const map = new Map<string, TvaRow>();
  for (const doc of data.documents) {
    const sens = doc.type === "AVOIR" ? -1 : 1;
    const key = `${doc.typeTVA}-${doc.tauxTVA}`;
    const current =
      map.get(key) || {
        taux: doc.tauxTVA,
        regime: regimeTVALabel(doc.typeTVA),
        baseHT: 0,
        montantTVA: 0,
        nbPieces: 0,
      };
    current.baseHT = round2(current.baseHT + sens * doc.montantHT);
    current.montantTVA = round2(current.montantTVA + sens * doc.montantTVA);
    current.nbPieces += 1;
    map.set(key, current);
  }
  return Array.from(map.values()).sort((a, b) => b.taux - a.taux);
}

export function buildBalanceClients(data: ComptaData): CreanceRow[] {
  const now = new Date();
  const map = new Map<string, CreanceRow>();
  for (const doc of data.documents) {
    const sens = doc.type === "AVOIR" ? -1 : 1;
    const current =
      map.get(doc.clientCompteAux) || {
        client: doc.clientNom,
        clientCompteAux: doc.clientCompteAux,
        totalFacture: 0,
        totalEncaisse: 0,
        restantDu: 0,
        nbFactures: 0,
        enRetard: 0,
      };
    current.totalFacture = round2(current.totalFacture + sens * doc.montantTTC);
    current.totalEncaisse = round2(current.totalEncaisse + sens * doc.encaisse);
    if (doc.type === "FACTURE") current.nbFactures += 1;
    const reste = round2(sens * (doc.montantTTC - doc.encaisse));
    current.restantDu = round2(current.restantDu + reste);
    if (
      doc.type === "FACTURE" &&
      reste > 0.01 &&
      doc.dateEcheance &&
      new Date(doc.dateEcheance) < now
    ) {
      current.enRetard = round2(current.enRetard + reste);
    }
    map.set(doc.clientCompteAux, current);
  }
  return Array.from(map.values())
    .filter((c) => Math.abs(c.restantDu) > 0.01 || c.nbFactures > 0)
    .sort((a, b) => b.restantDu - a.restantDu);
}

// ============================================================
// TVA SUR ENCAISSEMENTS (régime des prestations de services)
// ============================================================

/**
 * Pour les prestations de services, la TVA est exigible à l'ENCAISSEMENT
 * (art. 269-2-c CGI), et non à la facturation. On calcule donc la TVA réellement
 * due à partir des règlements lettrés sur la période, en extrayant la part de TVA
 * incluse dans chaque encaissement : TVA = TTC × taux / (100 + taux).
 */
export function buildTvaEncaissement(data: ComptaData): {
  rows: TvaEncaissementRow[];
  encaissementsNonLettres: number;
} {
  const map = new Map<string, TvaEncaissementRow>();
  let nonLettres = 0;

  for (const tx of data.transactions) {
    if (round2(tx.montant) <= 0) continue;
    let affecte = 0;
    for (const m of tx.matches) {
      const sens = m.docType === "AVOIR" ? -1 : 1;
      const ttc = m.montant;
      affecte = round2(affecte + ttc);
      const taux = m.tauxTVA;
      const tvaPart = round2((ttc * taux) / (100 + taux));
      const baseHT = round2(ttc - tvaPart);
      const key = `${m.typeTVA}-${taux}`;
      const current =
        map.get(key) || {
          taux,
          regime: regimeTVALabel(m.typeTVA),
          baseEncaisseeHT: 0,
          tvaExigible: 0,
          nbReglements: 0,
        };
      current.baseEncaisseeHT = round2(current.baseEncaisseeHT + sens * baseHT);
      current.tvaExigible = round2(current.tvaExigible + sens * tvaPart);
      current.nbReglements += 1;
      map.set(key, current);
    }
    const reliquat = round2(tx.montant - affecte);
    if (reliquat > 0.005) nonLettres = round2(nonLettres + reliquat);
  }

  return {
    rows: Array.from(map.values()).sort((a, b) => b.taux - a.taux),
    encaissementsNonLettres: nonLettres,
  };
}

// ============================================================
// GRAND LIVRE & BALANCE GÉNÉRALE
// ============================================================

export function buildGrandLivre(ecritures: FecLine[]): GrandLivreCompte[] {
  const map = new Map<string, GrandLivreCompte>();

  // Tri stable des écritures par date puis journal puis n° d'écriture
  const sorted = [...ecritures].sort((a, b) => {
    if (a.EcritureDate !== b.EcritureDate)
      return a.EcritureDate.localeCompare(b.EcritureDate);
    if (a.JournalCode !== b.JournalCode)
      return a.JournalCode.localeCompare(b.JournalCode);
    return a.EcritureNum.localeCompare(b.EcritureNum);
  });

  for (const l of sorted) {
    const compte =
      map.get(l.CompteNum) || {
        compteNum: l.CompteNum,
        compteLib: l.CompteLib,
        lignes: [],
        totalDebit: 0,
        totalCredit: 0,
        solde: 0,
      };
    compte.totalDebit = round2(compte.totalDebit + l.Debit);
    compte.totalCredit = round2(compte.totalCredit + l.Credit);
    compte.solde = round2(compte.solde + l.Debit - l.Credit);
    compte.lignes.push({
      date: l.EcritureDate,
      journal: l.JournalCode,
      piece: l.PieceRef,
      libelle: l.EcritureLib,
      compAux: l.CompAuxNum,
      debit: l.Debit,
      credit: l.Credit,
      solde: compte.solde,
      lettrage: l.EcritureLet,
    });
    map.set(l.CompteNum, compte);
  }

  return Array.from(map.values()).sort((a, b) =>
    a.compteNum.localeCompare(b.compteNum)
  );
}

export function buildBalanceGenerale(ecritures: FecLine[]): BalanceLigne[] {
  const map = new Map<string, BalanceLigne>();
  for (const l of ecritures) {
    const current =
      map.get(l.CompteNum) || {
        compteNum: l.CompteNum,
        compteLib: l.CompteLib,
        debit: 0,
        credit: 0,
        soldeDebiteur: 0,
        soldeCrediteur: 0,
      };
    current.debit = round2(current.debit + l.Debit);
    current.credit = round2(current.credit + l.Credit);
    map.set(l.CompteNum, current);
  }
  return Array.from(map.values())
    .map((c) => {
      const solde = round2(c.debit - c.credit);
      return {
        ...c,
        soldeDebiteur: solde > 0 ? solde : 0,
        soldeCrediteur: solde < 0 ? -solde : 0,
      };
    })
    .sort((a, b) => a.compteNum.localeCompare(b.compteNum));
}

// ============================================================
// CONTRÔLES / ANOMALIES
// ============================================================

/** Extrait le dernier groupe numérique d'une référence (ex: F-2026-059 → 59). */
function parseSeq(reference: string): { annee: string; num: number } | null {
  const m = reference.match(/(\d{4})\D+(\d+)\s*$/);
  if (m) return { annee: m[1], num: parseInt(m[2], 10) };
  const tail = reference.match(/(\d+)\s*$/);
  if (tail) return { annee: "", num: parseInt(tail[1], 10) };
  return null;
}

export function buildControles(data: ComptaData): Anomalie[] {
  const anomalies: Anomalie[] = [];

  for (const doc of data.documents) {
    const ref = doc.reference;

    // Cohérence des montants : HT + TVA = TTC
    const ecartTTC = round2(doc.montantHT + doc.montantTVA - doc.montantTTC);
    if (Math.abs(ecartTTC) > 0.01) {
      anomalies.push({
        gravite: "error",
        categorie: "Montant incohérent",
        message: `HT + TVA (${round2(doc.montantHT + doc.montantTVA)}) ≠ TTC (${doc.montantTTC}) — écart ${ecartTTC} €`,
        reference: ref,
        montant: ecartTTC,
      });
    }

    // Cohérence de la TVA calculée vs taux annoncé (TVA France uniquement)
    if (doc.typeTVA === "FRANCE" && doc.tauxTVA > 0) {
      const tvaTheorique = round2((doc.montantHT * doc.tauxTVA) / 100);
      if (Math.abs(tvaTheorique - doc.montantTVA) > 0.02) {
        anomalies.push({
          gravite: "warning",
          categorie: "TVA incohérente",
          message: `TVA déclarée ${doc.montantTVA} € ≠ ${doc.tauxTVA}% du HT (${tvaTheorique} €)`,
          reference: ref,
          montant: round2(tvaTheorique - doc.montantTVA),
        });
      }
    }

    // SIRET client manquant
    if (!doc.clientSiret) {
      anomalies.push({
        gravite: "warning",
        categorie: "SIRET client manquant",
        message: `${doc.clientNom} — aucun SIRET renseigné sur la fiche client`,
        reference: ref,
        montant: null,
      });
    }

    // Autoliquidation intracom sans n° TVA du client (mention obligatoire)
    if (doc.typeTVA === "EU_INTRACOM" && !doc.clientTVA) {
      anomalies.push({
        gravite: "error",
        categorie: "N° TVA intracom manquant",
        message: `${doc.clientNom} — autoliquidation sans n° TVA intracommunautaire du client`,
        reference: ref,
        montant: null,
      });
    }

    // Échéance manquante sur facture
    if (doc.type === "FACTURE" && !doc.dateEcheance) {
      anomalies.push({
        gravite: "warning",
        categorie: "Échéance manquante",
        message: `${ref} — facture sans date d'échéance`,
        reference: ref,
        montant: null,
      });
    }

    // Pièce justificative (PDF) manquante
    if (!doc.hasPdf) {
      anomalies.push({
        gravite: "warning",
        categorie: "Justificatif manquant",
        message: `${ref} — aucun PDF associé à la pièce`,
        reference: ref,
        montant: null,
      });
    }
  }

  // Trous de numérotation des factures (par année)
  const facturesParAnnee = new Map<string, number[]>();
  for (const doc of data.documents) {
    if (doc.type !== "FACTURE") continue;
    const seq = parseSeq(doc.reference);
    if (!seq) continue;
    const key = seq.annee || String(doc.dateEmission.getFullYear());
    const arr = facturesParAnnee.get(key) || [];
    arr.push(seq.num);
    facturesParAnnee.set(key, arr);
  }
  for (const [annee, nums] of facturesParAnnee) {
    const uniq = Array.from(new Set(nums)).sort((a, b) => a - b);
    if (uniq.length < 2) continue;
    const manquants: number[] = [];
    for (let i = uniq[0]; i <= uniq[uniq.length - 1]; i++) {
      if (!uniq.includes(i)) manquants.push(i);
    }
    if (manquants.length > 0) {
      const apercu = manquants.slice(0, 15).join(", ");
      anomalies.push({
        gravite: "warning",
        categorie: "Numérotation discontinue",
        message: `Factures ${annee} : ${manquants.length} n° manquant(s) dans la séquence (${apercu}${
          manquants.length > 15 ? "…" : ""
        })`,
        reference: null,
        montant: null,
      });
    }
  }

  // Encaissements non rapprochés
  for (const tx of data.transactions) {
    if (round2(tx.montant) <= 0) continue;
    if (tx.horsPlateforme) continue;
    const affecte = round2(tx.matches.reduce((s, m) => s + m.montant, 0));
    if (affecte < 0.005) {
      anomalies.push({
        gravite: "warning",
        categorie: "Encaissement non rapproché",
        message: `${tx.emetteur || tx.libelle} — ${round2(tx.montant)} € non lettré à une facture`,
        reference: tx.reference || null,
        montant: round2(tx.montant),
      });
    }
  }

  // Tri : erreurs d'abord, puis par catégorie
  const ordre: Record<AnomalieGravite, number> = { error: 0, warning: 1 };
  return anomalies.sort((a, b) => {
    if (a.gravite !== b.gravite) return ordre[a.gravite] - ordre[b.gravite];
    return a.categorie.localeCompare(b.categorie);
  });
}

// ============================================================
// SYNTHÈSE / KPIs DASHBOARD
// ============================================================

export async function getComptaSummary(periode: Periode): Promise<ComptaSummary> {
  const data = await getComptaData(periode);
  const tvaParTaux = buildTvaSummary(data);
  const banque = buildJournalBanque(data);
  const creances = buildBalanceClients(data);
  const ecritures = buildEcritures(data);
  const tvaEnc = buildTvaEncaissement(data);
  const anomalies = buildControles(data);

  let caHT = 0;
  let tvaCollectee = 0;
  let caTTC = 0;
  let totalAvoirsHT = 0;
  let nbFactures = 0;
  let nbAvoirs = 0;

  for (const doc of data.documents) {
    const sens = doc.type === "AVOIR" ? -1 : 1;
    caHT = round2(caHT + sens * doc.montantHT);
    tvaCollectee = round2(tvaCollectee + sens * doc.montantTVA);
    caTTC = round2(caTTC + sens * doc.montantTTC);
    if (doc.type === "AVOIR") {
      totalAvoirsHT = round2(totalAvoirsHT + doc.montantHT);
      nbAvoirs += 1;
    } else {
      nbFactures += 1;
    }
  }

  const encaissementsBanque = round2(
    banque.reduce((s, b) => s + b.montant, 0)
  );
  const encaissementsRapproches = round2(
    banque.filter((b) => b.rapproche).reduce((s, b) => s + b.montant, 0)
  );
  const creancesClients = round2(
    creances.reduce((s, c) => s + Math.max(0, c.restantDu), 0)
  );
  const creancesEnRetard = round2(
    creances.reduce((s, c) => s + c.enRetard, 0)
  );

  return {
    periode: {
      dateDebut: periode.dateDebut.toISOString(),
      dateFin: periode.dateFin.toISOString(),
    },
    caHT,
    tvaCollectee,
    caTTC,
    totalAvoirsHT,
    nbFactures,
    nbAvoirs,
    encaissementsBanque,
    encaissementsRapproches,
    encaissementsNonRapproches: round2(
      encaissementsBanque - encaissementsRapproches
    ),
    creancesClients,
    creancesEnRetard,
    nbEcritures: ecritures.length,
    tvaParTaux,
    tvaExigibleEncaissement: round2(
      tvaEnc.rows.reduce((s, r) => s + r.tvaExigible, 0)
    ),
    tvaEncaissementParTaux: tvaEnc.rows,
    encaissementsNonLettres: tvaEnc.encaissementsNonLettres,
    nbAnomalies: anomalies.length,
    nbAnomaliesBloquantes: anomalies.filter((a) => a.gravite === "error").length,
  };
}

// ============================================================
// HELPERS DE PÉRIODE
// ============================================================

export function parsePeriode(
  dateDebut?: string | null,
  dateFin?: string | null
): Periode {
  if (dateDebut && dateFin) {
    return {
      dateDebut: new Date(dateDebut + "T00:00:00"),
      dateFin: new Date(dateFin + "T23:59:59"),
    };
  }
  const now = new Date();
  return {
    dateDebut: new Date(now.getFullYear(), 0, 1, 0, 0, 0),
    dateFin: new Date(now.getFullYear(), 11, 31, 23, 59, 59),
  };
}
