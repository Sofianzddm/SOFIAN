/**
 * 📊 ANALYTICS FINANCIERS - Fonctions de calcul
 * Gestion des KPIs, statistiques et analyses financières
 */

import prisma from "@/lib/prisma";
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
 * Période année en cours
 */
export function getPeriodeAnneeEnCours(): PeriodeFilter {
  const now = new Date();
  return {
    dateDebut: startOfYear(now),
    dateFin: endOfYear(now),
  };
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
