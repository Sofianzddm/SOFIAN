/**
 * 📊 ANALYTICS FINANCIERS - Fonctions de calcul
 * Gestion des KPIs, statistiques et analyses financières
 */

import prisma from "@/lib/prisma";
import type { Prisma } from "@prisma/client";
import { startOfMonth, endOfMonth, startOfYear, endOfYear, subMonths, subYears, format } from "date-fns";
import { fr } from "date-fns/locale";

export interface PeriodeFilter {
  dateDebut: Date;
  dateFin: Date;
  pole?: "INFLUENCE" | "SALES"; // Filtre par pôle
}

export interface FinanceStats {
  // CA (Chiffre d'Affaires)
  caTotal: number;
  caPaye: number;
  caEnAttente: number;
  
  // Commissions
  commissionsTotal: number;
  commissionsPayees: number;
  
  // Montants nets talents
  netsTotal: number;
  netsPayes: number;
  netsEnAttente: number;
  
  // Compteurs
  nbCollaborations: number;
  nbCollabsPayees: number;
  nbCollabsEnAttente: number;
  
  // Documents
  nbFactures: number;
  nbFacturesPayees: number;
  nbFacturesEnAttente: number;
  nbFacturesRetard: number;
  
  // Moyennes
  ticketMoyen: number;
  margeMoyenne: number;
  delaiPaiementMoyen: number;
  
  // Évolution
  evolutionVsPeriodePrecedente: number;
  evolutionVsAnnePrecedente: number;
}

export interface CAParMois {
  mois: string; // "2026-01"
  moisLabel: string; // "Janvier 2026"
  caHT: number;
  caTTC: number;
  commissions: number;
  nbCollabs: number;
}

export interface RepartitionItem {
  label: string;
  value: number;
  pourcentage: number;
  count: number;
}

/**
 * Récupérer les stats financières globales pour une période
 */
export async function getFinanceStats(periode: PeriodeFilter): Promise<FinanceStats> {
  const { dateDebut, dateFin, pole } = periode;

  // Build where clause avec filtre pôle optionnel
  const whereClause: any = {
    createdAt: {
      gte: dateDebut,
      lte: dateFin,
    },
    statut: {
      notIn: ["PERDU"], // Exclure les perdues
    },
  };

  // Filtre par pôle (source INBOUND = Influence, OUTBOUND = Sales)
  if (pole === "INFLUENCE") {
    whereClause.source = "INBOUND";
  } else if (pole === "SALES") {
    whereClause.source = "OUTBOUND";
  }

  // 1. Récupérer toutes les collaborations de la période
  const collaborations = await prisma.collaboration.findMany({
    where: whereClause,
    select: {
      id: true,
      montantBrut: true,
      commissionEuros: true,
      montantNet: true,
      statut: true,
      paidAt: true,
      createdAt: true,
      documents: {
        select: {
          type: true,
          statut: true,
          montantTTC: true,
          montantHT: true,
          dateEmission: true,
          dateEcheance: true,
        },
      },
    },
  });

  // 2. Calculer les montants
  let caTotal = 0;
  let caPaye = 0;
  let commissionsTotal = 0;
  let commissionsPayees = 0;
  let netsTotal = 0;
  let netsPayes = 0;
  let nbCollabsPayees = 0;
  let nbFacturesPayees = 0;
  let nbFacturesEnAttente = 0;
  let nbFacturesRetard = 0;
  let totalJoursPaiement = 0;
  let nbPaiementsAvecDelai = 0;

  const now = new Date();

  collaborations.forEach((collab) => {
    const montantBrut = Number(collab.montantBrut);
    const commission = Number(collab.commissionEuros);
    const montantNet = Number(collab.montantNet);

    caTotal += montantBrut;
    commissionsTotal += commission;
    netsTotal += montantNet;

    if (collab.statut === "PAYE" && collab.paidAt) {
      caPaye += montantBrut;
      commissionsPayees += commission;
      netsPayes += montantNet;
      nbCollabsPayees++;

      // Calculer délai de paiement
      const joursPaiement = Math.floor(
        (new Date(collab.paidAt).getTime() - new Date(collab.createdAt).getTime()) / (1000 * 60 * 60 * 24)
      );
      totalJoursPaiement += joursPaiement;
      nbPaiementsAvecDelai++;
    }

    // Analyser les factures
    collab.documents.forEach((doc) => {
      if (doc.type === "FACTURE") {
        if (doc.statut === "PAYE") {
          nbFacturesPayees++;
        } else {
          nbFacturesEnAttente++;
          
          // Vérifier si en retard
          if (doc.dateEcheance && new Date(doc.dateEcheance) < now) {
            nbFacturesRetard++;
          }
        }
      }
    });
  });

  const caEnAttente = caTotal - caPaye;
  const netsEnAttente = netsTotal - netsPayes;
  const nbCollabsEnAttente = collaborations.length - nbCollabsPayees;

  // 3. Calculer les moyennes
  const ticketMoyen = collaborations.length > 0 ? caTotal / collaborations.length : 0;
  const margeMoyenne = caTotal > 0 ? (commissionsTotal / caTotal) * 100 : 0;
  const delaiPaiementMoyen = nbPaiementsAvecDelai > 0 ? totalJoursPaiement / nbPaiementsAvecDelai : 0;

  // 4. Calculer évolutions
  const periodePrecedente = getPeriodePrecedente(periode);
  const statsPrecedente = await getFinanceStatsSimple(periodePrecedente);
  const evolutionVsPeriodePrecedente = statsPrecedente.caTotal > 0
    ? ((caTotal - statsPrecedente.caTotal) / statsPrecedente.caTotal) * 100
    : 0;

  const annePrecedente = getAnneePrecedente(periode);
  const statsAnnePrecedente = await getFinanceStatsSimple(annePrecedente);
  const evolutionVsAnnePrecedente = statsAnnePrecedente.caTotal > 0
    ? ((caTotal - statsAnnePrecedente.caTotal) / statsAnnePrecedente.caTotal) * 100
    : 0;

  return {
    caTotal,
    caPaye,
    caEnAttente,
    commissionsTotal,
    commissionsPayees,
    netsTotal,
    netsPayes,
    netsEnAttente,
    nbCollaborations: collaborations.length,
    nbCollabsPayees,
    nbCollabsEnAttente,
    nbFactures: nbFacturesPayees + nbFacturesEnAttente,
    nbFacturesPayees,
    nbFacturesEnAttente,
    nbFacturesRetard,
    ticketMoyen,
    margeMoyenne,
    delaiPaiementMoyen,
    evolutionVsPeriodePrecedente,
    evolutionVsAnnePrecedente,
  };
}

/**
 * Version simplifiée pour les comparaisons
 */
async function getFinanceStatsSimple(periode: PeriodeFilter) {
  const collaborations = await prisma.collaboration.findMany({
    where: {
      createdAt: {
        gte: periode.dateDebut,
        lte: periode.dateFin,
      },
      statut: {
        notIn: ["PERDU"],
      },
    },
    select: {
      montantBrut: true,
    },
  });

  const caTotal = collaborations.reduce((sum, c) => sum + Number(c.montantBrut), 0);
  return { caTotal };
}

/**
 * CA par mois sur les 12 derniers mois
 */
export async function getCAParMois(nbMois: number = 12, pole?: "INFLUENCE" | "SALES"): Promise<CAParMois[]> {
  const result: CAParMois[] = [];
  const now = new Date();

  for (let i = nbMois - 1; i >= 0; i--) {
    const date = subMonths(now, i);
    const dateDebut = startOfMonth(date);
    const dateFin = endOfMonth(date);

    const whereClause: any = {
      createdAt: {
        gte: dateDebut,
        lte: dateFin,
      },
      statut: {
        notIn: ["PERDU"],
      },
    };

    // Filtre par pôle
    if (pole === "INFLUENCE") {
      whereClause.source = "INBOUND";
    } else if (pole === "SALES") {
      whereClause.source = "OUTBOUND";
    }

    const collaborations = await prisma.collaboration.findMany({
      where: whereClause,
      select: {
        montantBrut: true,
        commissionEuros: true,
        documents: {
          where: {
            type: "FACTURE",
          },
          select: {
            montantTTC: true,
          },
        },
      },
    });

    const caHT = collaborations.reduce((sum, c) => sum + Number(c.montantBrut), 0);
    const commissions = collaborations.reduce((sum, c) => sum + Number(c.commissionEuros), 0);
    const caTTC = collaborations.reduce(
      (sum, c) => sum + c.documents.reduce((s, d) => s + Number(d.montantTTC), 0),
      0
    );

    result.push({
      mois: format(date, "yyyy-MM"),
      moisLabel: format(date, "MMMM yyyy", { locale: fr }),
      caHT,
      caTTC: caTTC || caHT * 1.2, // Fallback si pas de facture
      commissions,
      nbCollabs: collaborations.length,
    });
  }

  return result;
}

/**
 * Répartition du CA par talent
 */
export async function getRepartitionParTalent(periode: PeriodeFilter, limit: number = 10): Promise<RepartitionItem[]> {
  const whereClause: any = {
    createdAt: {
      gte: periode.dateDebut,
      lte: periode.dateFin,
    },
    statut: {
      notIn: ["PERDU"],
    },
  };

  if (periode.pole === "INFLUENCE") {
    whereClause.source = "INBOUND";
  } else if (periode.pole === "SALES") {
    whereClause.source = "OUTBOUND";
  }

  const collaborations = await prisma.collaboration.findMany({
    where: whereClause,
    select: {
      montantBrut: true,
      talent: {
        select: {
          prenom: true,
          nom: true,
        },
      },
    },
  });

  const grouped = new Map<string, { value: number; count: number }>();

  collaborations.forEach((collab) => {
    const label = `${collab.talent.prenom} ${collab.talent.nom}`;
    const current = grouped.get(label) || { value: 0, count: 0 };
    grouped.set(label, {
      value: current.value + Number(collab.montantBrut),
      count: current.count + 1,
    });
  });

  const total = Array.from(grouped.values()).reduce((sum, item) => sum + item.value, 0);

  return Array.from(grouped.entries())
    .map(([label, data]) => ({
      label,
      value: data.value,
      pourcentage: total > 0 ? (data.value / total) * 100 : 0,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/**
 * Répartition du CA par marque
 */
export async function getRepartitionParMarque(periode: PeriodeFilter, limit: number = 10): Promise<RepartitionItem[]> {
  const whereClause: any = {
    createdAt: {
      gte: periode.dateDebut,
      lte: periode.dateFin,
    },
    statut: {
      notIn: ["PERDU"],
    },
  };

  if (periode.pole === "INFLUENCE") {
    whereClause.source = "INBOUND";
  } else if (periode.pole === "SALES") {
    whereClause.source = "OUTBOUND";
  }

  const collaborations = await prisma.collaboration.findMany({
    where: whereClause,
    select: {
      montantBrut: true,
      marque: {
        select: {
          nom: true,
        },
      },
    },
  });

  const grouped = new Map<string, { value: number; count: number }>();

  collaborations.forEach((collab) => {
    const label = collab.marque.nom;
    const current = grouped.get(label) || { value: 0, count: 0 };
    grouped.set(label, {
      value: current.value + Number(collab.montantBrut),
      count: current.count + 1,
    });
  });

  const total = Array.from(grouped.values()).reduce((sum, item) => sum + item.value, 0);

  return Array.from(grouped.entries())
    .map(([label, data]) => ({
      label,
      value: data.value,
      pourcentage: total > 0 ? (data.value / total) * 100 : 0,
      count: data.count,
    }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/**
 * Répartition du CA par source (INBOUND/OUTBOUND)
 */
export async function getRepartitionParSource(periode: PeriodeFilter): Promise<RepartitionItem[]> {
  const collaborations = await prisma.collaboration.findMany({
    where: {
      createdAt: {
        gte: periode.dateDebut,
        lte: periode.dateFin,
      },
      statut: {
        notIn: ["PERDU"],
      },
    },
    select: {
      montantBrut: true,
      source: true,
    },
  });

  const grouped = new Map<string, { value: number; count: number }>();

  collaborations.forEach((collab) => {
    const label = collab.source;
    const current = grouped.get(label) || { value: 0, count: 0 };
    grouped.set(label, {
      value: current.value + Number(collab.montantBrut),
      count: current.count + 1,
    });
  });

  const total = Array.from(grouped.values()).reduce((sum, item) => sum + item.value, 0);

  return Array.from(grouped.entries()).map(([label, data]) => ({
    label,
    value: data.value,
    pourcentage: total > 0 ? (data.value / total) * 100 : 0,
    count: data.count,
  }));
}

/**
 * Helpers pour calcul de périodes
 */
function getPeriodePrecedente(periode: PeriodeFilter): PeriodeFilter {
  const duree = periode.dateFin.getTime() - periode.dateDebut.getTime();
  return {
    dateDebut: new Date(periode.dateDebut.getTime() - duree),
    dateFin: new Date(periode.dateFin.getTime() - duree),
  };
}

function getAnneePrecedente(periode: PeriodeFilter): PeriodeFilter {
  return {
    dateDebut: subYears(periode.dateDebut, 1),
    dateFin: subYears(periode.dateFin, 1),
  };
}

/**
 * Période mois en cours
 */
export function getPeriodeMoisEnCours(): PeriodeFilter {
  const now = new Date();
  return {
    dateDebut: startOfMonth(now),
    dateFin: endOfMonth(now),
  };
}

/**
 * Période mois précédent (calendaire)
 */
export function getPeriodeMoisDernier(): PeriodeFilter {
  const lastMonth = subMonths(new Date(), 1);
  return {
    dateDebut: startOfMonth(lastMonth),
    dateFin: endOfMonth(lastMonth),
  };
}

/**
 * Période année en cours
 */
export function getPeriodeAnneeEnCours(): PeriodeFilter {
  const now = new Date();
  return {
    dateDebut: startOfYear(now),
    dateFin: endOfYear(now),
  };
}

export type PeriodeType = "mois" | "mois-dernier" | "annee" | "custom";

/**
 * Résout une période à partir du type + dates optionnelles
 */
export function resolvePeriode(opts: {
  type?: string | null;
  dateDebut?: string | null;
  dateFin?: string | null;
  pole?: "INFLUENCE" | "SALES" | null;
}): PeriodeFilter {
  const { type, dateDebut, dateFin, pole } = opts;
  const withPole = (p: PeriodeFilter): PeriodeFilter => ({
    ...p,
    pole: pole || undefined,
  });

  if ((type === "custom" || (!type && dateDebut && dateFin)) && dateDebut && dateFin) {
    return withPole({
      dateDebut: new Date(dateDebut),
      dateFin: new Date(dateFin),
    });
  }
  if (type === "annee") return withPole(getPeriodeAnneeEnCours());
  if (type === "mois-dernier") return withPole(getPeriodeMoisDernier());
  return withPole(getPeriodeMoisEnCours());
}

/**
 * Taux de conversion Négociation → Collaboration
 */
export async function getTauxConversion(periode: PeriodeFilter) {
  const whereClauseNego: any = {
    createdAt: {
      gte: periode.dateDebut,
      lte: periode.dateFin,
    },
  };

  if (periode.pole === "INFLUENCE") {
    whereClauseNego.source = "INBOUND";
  } else if (periode.pole === "SALES") {
    whereClauseNego.source = "OUTBOUND";
  }

  // Négociations créées dans la période
  const negociations = await prisma.negociation.findMany({
    where: whereClauseNego,
    select: {
      id: true,
      statut: true,
    },
  });

  const nbNegos = negociations.length;
  const nbValidees = negociations.filter((n) => n.statut === "VALIDEE").length;
  const nbRefusees = negociations.filter((n) => n.statut === "REFUSEE").length;

  // Collaborations créées depuis les négos de la période
  const whereClauseCollab: any = {
    createdAt: {
      gte: periode.dateDebut,
      lte: periode.dateFin,
    },
    negociation: {
      createdAt: {
        gte: periode.dateDebut,
        lte: periode.dateFin,
      },
    },
  };

  if (periode.pole === "INFLUENCE") {
    whereClauseCollab.source = "INBOUND";
  } else if (periode.pole === "SALES") {
    whereClauseCollab.source = "OUTBOUND";
  }

  const collaborations = await prisma.collaboration.findMany({
    where: whereClauseCollab,
  });

  const nbCollabs = collaborations.length;

  return {
    nbNegociations: nbNegos,
    nbValidees,
    nbRefusees,
    nbCollaborations: nbCollabs,
    tauxValidation: nbNegos > 0 ? (nbValidees / nbNegos) * 100 : 0,
    tauxRefus: nbNegos > 0 ? (nbRefusees / nbNegos) * 100 : 0,
    tauxConversion: nbNegos > 0 ? (nbCollabs / nbNegos) * 100 : 0,
  };
}

/**
 * CA prévisionnel basé sur les négos en cours
 */
export async function getPrevisionCA() {
  // Négos soumises et en attente de validation
  const negosEnCours = await prisma.negociation.findMany({
    where: {
      statut: "EN_DISCUSSION",
    },
    select: {
      id: true,
    },
  });

  const caPrevi = 0; // TODO: Recalculer à partir des livrables

  // Collabs en cours / publiées / facturées (CA en production)
  const collabsEnCours = await prisma.collaboration.findMany({
    where: {
      statut: {
        in: ["EN_COURS", "PUBLIE", "FACTURE_RECUE"],
      },
    },
    select: {
      montantBrut: true,
    },
  });

  const caEnCours = collabsEnCours.reduce((sum, c) => sum + Number(c.montantBrut), 0);

  return {
    caPrevisionnel: caPrevi,
    nbNegosEnCours: negosEnCours.length,
    caEnCours,
    nbCollabsEnCours: collabsEnCours.length,
    caTotal: caPrevi + caEnCours,
  };
}

export interface CollabValideeAvecDevis {
  id: string;
  reference: string;
  dateValidation: Date;
  pole: "INFLUENCE" | "SALES";
  statut: string;
  montantBrut: number;
  commissionPercent: number;
  commissionEuros: number;
  montantNet: number;
  talent: string;
  talentPrenom: string;
  marque: string;
  createdBy: string | null;
  createdByRole: string | null;
  devisReference: string | null;
  devisStatut: string | null;
  devisEnvoyeAt: Date | null;
  devisMontantHT: number | null;
  /** Ex: "Devis", "Contrat", "Devis + Contrat", "—" */
  documentsPresent: string;
  /** Ex: "Devis", "Contrat", "Devis + Contrat", "—" */
  documentsManquants: string;
  hasDevis: boolean;
  hasContrat: boolean;
  /** Ligne hors règle CA (docs manquants, hors période, GAGNÉ sans collab…) */
  alerte: boolean;
  raison: string | null;
  sourceLigne: "COLLAB" | "PROSPECTION";
  /** Compte dans le CA du mois (collab créée sur la période + devis OU contrat) */
  compteDansCA: boolean;
  /** Collab hors période dont le devis a été généré sur la période → rouge Excel */
  highlightRouge: boolean;
}

function normalizeFinanceText(value: string): string {
  return value
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function formatDateCourt(date: Date): string {
  return new Intl.DateTimeFormat("fr-FR").format(date);
}

function collabHasContrat(c: {
  contratStatut?: string | null;
  contratMarqueStatut?: string | null;
  contratSigneAt?: Date | null;
  contratMarqueSigneAt?: Date | null;
}): boolean {
  if (c.contratSigneAt || c.contratMarqueSigneAt) return true;
  if (c.contratMarqueStatut && c.contratMarqueStatut !== "AUCUN") return true;
  if (c.contratStatut && c.contratStatut !== "NON_ENVOYE") return true;
  return false;
}

function docsColumns(hasDevis: boolean, hasContrat: boolean): {
  documentsPresent: string;
  documentsManquants: string;
} {
  const present: string[] = [];
  const missing: string[] = [];
  if (hasDevis) present.push("Devis");
  else missing.push("Devis");
  if (hasContrat) present.push("Contrat");
  else missing.push("Contrat");
  return {
    documentsPresent: present.length ? present.join(" + ") : "—",
    documentsManquants: missing.length ? missing.join(" + ") : "—",
  };
}

/**
 * Export finance Influence/Sales avec alertes :
 * - Collabs créées sur la période (CA si devis OU contrat)
 * - Collabs hors période avec devis généré sur la période (rouge)
 * - + prosp GAGNÉ du mois non couvertes
 */
export async function getCollabsValideesAvecDevis(
  periode: PeriodeFilter
): Promise<CollabValideeAvecDevis[]> {
  const { dateDebut, dateFin, pole } = periode;
  const mois = dateDebut.getMonth() + 1;
  const annee = dateDebut.getFullYear();
  const moisLabels = [
    "Janvier",
    "Février",
    "Mars",
    "Avril",
    "Mai",
    "Juin",
    "Juillet",
    "Août",
    "Septembre",
    "Octobre",
    "Novembre",
    "Décembre",
  ];
  const moisTitre = `${moisLabels[mois - 1]} ${annee}`;

  const auteurInfluence = {
    OR: [
      { createdBy: { role: { in: ["TM", "HEAD_OF_INFLUENCE"] } } },
      {
        createdById: null,
        negociation: {
          is: { tm: { role: { in: ["TM", "HEAD_OF_INFLUENCE"] } } },
        },
      },
    ],
  } satisfies Prisma.CollaborationWhereInput;

  const auteurSales = {
    OR: [
      { createdBy: { role: "HEAD_OF_SALES" } },
      {
        isPrivate: true,
        createdBy: { role: { in: ["HEAD_OF_SALES", "ADMIN", "HEAD_OF"] } },
      },
      { createdById: null, isPrivate: true },
    ],
  } satisfies Prisma.CollaborationWhereInput;

  const poleAuteurClause: Prisma.CollaborationWhereInput =
    pole === "INFLUENCE"
      ? { AND: [{ source: "INBOUND" }, auteurInfluence] }
      : pole === "SALES"
        ? auteurSales
        : {
            OR: [
              { AND: [{ source: "INBOUND" }, auteurInfluence] },
              auteurSales,
            ],
          };

  const collabSelect = {
    id: true,
    reference: true,
    source: true,
    statut: true,
    montantBrut: true,
    commissionPercent: true,
    commissionEuros: true,
    montantNet: true,
    createdAt: true,
    talentId: true,
    contratStatut: true,
    contratSigneAt: true,
    contratMarqueStatut: true,
    contratMarqueSigneAt: true,
    talent: { select: { prenom: true, nom: true } },
    marque: { select: { nom: true } },
    createdBy: { select: { prenom: true, nom: true, role: true } },
    documents: {
      where: { type: "DEVIS" as const, statut: { not: "ANNULE" as const } },
      orderBy: { createdAt: "desc" as const },
      select: {
        reference: true,
        statut: true,
        createdAt: true,
        signatureSentAt: true,
        signatureSignedAt: true,
        dateEmission: true,
        montantHT: true,
      },
    },
  };

  type CollabRow = Awaited<
    ReturnType<typeof prisma.collaboration.findMany<{ select: typeof collabSelect }>>
  >[number];

  const toExportRow = (
    c: CollabRow,
    opts: {
      inPeriode: boolean;
      sourceLigne: "COLLAB" | "PROSPECTION";
      createdByFallback?: string | null;
      createdByRoleFallback?: string | null;
      forceRaison?: string | null;
      highlightRouge?: boolean;
      dateDebut?: Date;
      dateFin?: Date;
    }
  ): CollabValideeAvecDevis => {
    const devisInPeriode =
      opts.dateDebut && opts.dateFin
        ? c.documents.find(
            (d) => d.createdAt >= opts.dateDebut! && d.createdAt <= opts.dateFin!
          )
        : null;
    const devis = devisInPeriode ?? c.documents[0] ?? null;
    const hasDevis = c.documents.length > 0;
    const hasContrat = collabHasContrat(c);
    const docsOk = hasDevis || hasContrat;
    const { documentsPresent, documentsManquants } = docsColumns(hasDevis, hasContrat);
    const isSales =
      c.createdBy?.role === "HEAD_OF_SALES" || c.source === "OUTBOUND";
    const highlightRouge = Boolean(opts.highlightRouge);
    const reasons: string[] = [];
    if (opts.forceRaison) reasons.push(opts.forceRaison);
    if (!opts.inPeriode && !opts.forceRaison && !highlightRouge) {
      reasons.push(`Collab hors période (créée le ${formatDateCourt(c.createdAt)})`);
    }
    if (!docsOk) reasons.push("Devis et contrat manquants");
    else if (highlightRouge) {
      const devisDate = devisInPeriode?.createdAt ?? devis?.createdAt;
      reasons.push(
        `Devis généré sur la période${devisDate ? ` (${formatDateCourt(devisDate)})` : ""} — collab créée le ${formatDateCourt(c.createdAt)}`
      );
    }

    return {
      id: c.id,
      reference: c.reference,
      dateValidation: c.createdAt,
      pole: isSales ? "SALES" : "INFLUENCE",
      statut: c.statut,
      montantBrut: Number(c.montantBrut),
      commissionPercent: Number(c.commissionPercent),
      commissionEuros: Number(c.commissionEuros),
      montantNet: Number(c.montantNet),
      talent: `${c.talent.prenom} ${c.talent.nom}`.trim(),
      talentPrenom: c.talent.prenom,
      marque: c.marque.nom,
      createdBy: c.createdBy
        ? `${c.createdBy.prenom} ${c.createdBy.nom || ""}`.trim()
        : opts.createdByFallback ?? null,
      createdByRole: c.createdBy?.role ?? opts.createdByRoleFallback ?? null,
      devisReference: devis?.reference ?? null,
      devisStatut: devis?.statut ?? null,
      devisEnvoyeAt: devis?.signatureSentAt ?? devis?.dateEmission ?? null,
      devisMontantHT: devis ? Number(devis.montantHT) : null,
      documentsPresent,
      documentsManquants,
      hasDevis,
      hasContrat,
      alerte: !docsOk || highlightRouge || !opts.inPeriode,
      raison: reasons.length ? reasons.join(" · ") : null,
      sourceLigne: opts.sourceLigne,
      compteDansCA: opts.inPeriode && docsOk,
      highlightRouge,
    };
  };

  // 1) Collabs créées sur la période
  const collabs = await prisma.collaboration.findMany({
    where: {
      AND: [
        poleAuteurClause,
        { statut: { not: "PERDU" } },
        { createdAt: { gte: dateDebut, lte: dateFin } },
      ],
    },
    select: collabSelect,
    orderBy: { createdAt: "asc" },
  });

  const rows: CollabValideeAvecDevis[] = collabs.map((c) =>
    toExportRow(c, {
      inPeriode: true,
      sourceLigne: "COLLAB",
      dateDebut,
      dateFin,
    })
  );

  const coveredCollabIds = new Set(rows.map((r) => r.id));

  // 2) Collabs hors période dont le devis a été généré sur la période → rouge
  const devisSurPeriode = await prisma.document.findMany({
    where: {
      type: "DEVIS",
      statut: { not: "ANNULE" },
      createdAt: { gte: dateDebut, lte: dateFin },
      collaborationId: { not: null },
      collaboration: {
        AND: [
          poleAuteurClause,
          { statut: { not: "PERDU" } },
          { createdAt: { lt: dateDebut } },
        ],
      },
    },
    select: { collaborationId: true },
  });

  const rougeIds = [
    ...new Set(
      devisSurPeriode
        .map((d) => d.collaborationId)
        .filter((id): id is string => id != null && !coveredCollabIds.has(id))
    ),
  ];

  if (rougeIds.length > 0) {
    const collabsRouge = await prisma.collaboration.findMany({
      where: { id: { in: rougeIds } },
      select: collabSelect,
      orderBy: { createdAt: "asc" },
    });
    for (const c of collabsRouge) {
      coveredCollabIds.add(c.id);
      rows.push(
        toExportRow(c, {
          inPeriode: false,
          sourceLigne: "COLLAB",
          highlightRouge: true,
          dateDebut,
          dateFin,
        })
      );
    }
  }

  // 3) Prospection GAGNÉ du mois (Influence) → écarts restants
  if (pole !== "SALES") {
    const prospGagnes = await prisma.prospectionContact.findMany({
      where: {
        statut: "GAGNE",
        OR: [
          { fichier: { mois, annee } },
          {
            fichier: {
              titre: { contains: moisTitre, mode: "insensitive" },
            },
          },
        ],
      },
      select: {
        id: true,
        nomOpportunite: true,
        montantBrut: true,
        updatedAt: true,
        talentId: true,
        talent: { select: { prenom: true, nom: true } },
        fichier: {
          select: {
            titre: true,
            user: { select: { prenom: true, nom: true, role: true } },
          },
        },
      },
      orderBy: { updatedAt: "asc" },
    });

    const prospUnique = [
      ...new Map(prospGagnes.map((p) => [p.id, p])).values(),
    ];

    const talentIds = [
      ...new Set(
        prospUnique.map((p) => p.talentId).filter((id): id is string => Boolean(id))
      ),
    ];

    const collabsCandidats =
      talentIds.length === 0
        ? []
        : await prisma.collaboration.findMany({
            where: {
              talentId: { in: talentIds },
              statut: { not: "PERDU" },
              source: "INBOUND",
            },
            select: collabSelect,
            orderBy: { createdAt: "desc" },
          });

    for (const p of prospUnique) {
      const opp = normalizeFinanceText(p.nomOpportunite || "");
      const brutProsp = Number(p.montantBrut || 0);
      const tmName = p.fichier.user
        ? `${p.fichier.user.prenom} ${p.fichier.user.nom || ""}`.trim()
        : null;

      const scoreMatch = (c: CollabRow) => {
        if (p.talentId && c.talentId !== p.talentId) return -1;
        const marque = normalizeFinanceText(c.marque.nom);
        const oppTokens = opp;
        const marqueOk =
          (marque.length >= 3 &&
            oppTokens.includes(marque.slice(0, Math.min(6, marque.length)))) ||
          (marque.length >= 5 && oppTokens.includes(marque.slice(0, 5))) ||
          (oppTokens.includes("xiaomi") &&
            (marque.includes("bump") || marque.includes("xiaomi"))) ||
          (oppTokens.includes("dji") &&
            (marque.includes("koli") || marque.includes("dji"))) ||
          (oppTokens.includes("manhae") &&
            (marque.includes("havea") || marque.includes("ponroy"))) ||
          (oppTokens.includes("8inasia") && marque.includes("asia")) ||
          (oppTokens.includes("mileade") && marque.includes("maddy")) ||
          (oppTokens.includes("maddy") && marque.includes("maddy"));
        if (!marqueOk) return -1;

        const brutCollab = Number(c.montantBrut);
        if (brutProsp > 0) {
          const rel =
            Math.abs(brutCollab - brutProsp) /
            Math.max(brutProsp, brutCollab, 1);
          if (rel > 0.25 && Math.abs(brutCollab - brutProsp) > 50) return -1;
        }

        let score = 3;
        if (brutProsp > 0 && Math.abs(brutCollab - brutProsp) < 1) score += 3;
        else if (
          brutProsp > 0 &&
          Math.abs(brutCollab - brutProsp) / Math.max(brutProsp, 1) < 0.2
        ) {
          score += 1;
        }
        return score;
      };

      let best: CollabRow | null = null;
      let bestScore = 0;
      for (const c of collabsCandidats) {
        if (p.talentId && c.talentId !== p.talentId) continue;
        const s = scoreMatch(c);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }

      if (best && coveredCollabIds.has(best.id)) continue;

      const alreadyInRows = rows.some((r) => {
        if (r.sourceLigne !== "COLLAB" && !r.reference) return false;
        const talentOk =
          !p.talent ||
          normalizeFinanceText(r.talentPrenom).includes(
            normalizeFinanceText(p.talent.prenom)
          ) ||
          opp.includes(normalizeFinanceText(r.talentPrenom));
        if (
          talentOk &&
          brutProsp > 0 &&
          Math.abs(r.montantBrut - brutProsp) < 1
        ) {
          return true;
        }
        const blob = normalizeFinanceText(`${r.marque} ${r.talentPrenom}`);
        const marqueFrag = normalizeFinanceText(r.marque).slice(0, 5);
        const oppOk =
          (marqueFrag.length >= 3 && opp.includes(marqueFrag)) ||
          (opp.length >= 4 && blob.includes(opp.slice(0, 6)));
        const brutOk =
          brutProsp <= 0 ||
          Math.abs(r.montantBrut - brutProsp) < 1 ||
          Math.abs(r.montantBrut - brutProsp) / Math.max(brutProsp, 1) < 0.25;
        return oppOk && brutOk && talentOk;
      });
      if (alreadyInRows) continue;

      if (best) {
        const inPeriode =
          best.createdAt >= dateDebut && best.createdAt <= dateFin;
        const docsOk =
          best.documents.length > 0 || collabHasContrat(best);
        if (inPeriode && docsOk) {
          coveredCollabIds.add(best.id);
          continue;
        }

        const devisInPeriode = best.documents.some(
          (d) => d.createdAt >= dateDebut && d.createdAt <= dateFin
        );
        coveredCollabIds.add(best.id);
        rows.push(
          toExportRow(best, {
            inPeriode,
            sourceLigne: "PROSPECTION",
            createdByFallback: tmName,
            createdByRoleFallback: p.fichier.user?.role ?? null,
            highlightRouge: !inPeriode && devisInPeriode,
            dateDebut,
            dateFin,
          })
        );
        continue;
      }

      const talentPrenom =
        p.talent?.prenom || p.nomOpportunite.split(/[x×]/i)[0]?.trim() || "";
      const talentNom = p.talent?.nom || "";
      const { documentsPresent, documentsManquants } = docsColumns(false, false);
      rows.push({
        id: `prosp-${p.id}`,
        reference: "",
        dateValidation: p.updatedAt,
        pole: "INFLUENCE",
        statut: "GAGNE_PROSPECTION",
        montantBrut: brutProsp,
        commissionPercent: 0,
        commissionEuros: 0,
        montantNet: brutProsp,
        talent: `${talentPrenom} ${talentNom}`.trim() || p.nomOpportunite,
        talentPrenom: talentPrenom || p.nomOpportunite,
        marque: p.nomOpportunite,
        createdBy: tmName,
        createdByRole: p.fichier.user?.role ?? null,
        devisReference: null,
        devisStatut: null,
        devisEnvoyeAt: null,
        devisMontantHT: null,
        documentsPresent,
        documentsManquants,
        hasDevis: false,
        hasContrat: false,
        alerte: true,
        raison: "GAGNÉ en prospection sans collab créée",
        sourceLigne: "PROSPECTION",
        compteDansCA: false,
        highlightRouge: false,
      });
    }
  }

  rows.sort((a, b) => {
    if (a.compteDansCA !== b.compteDansCA) return a.compteDansCA ? -1 : 1;
    if (a.highlightRouge !== b.highlightRouge) return a.highlightRouge ? -1 : 1;
    if (a.alerte !== b.alerte) return a.alerte ? 1 : -1;
    return a.dateValidation.getTime() - b.dateValidation.getTime();
  });

  return rows;
}
