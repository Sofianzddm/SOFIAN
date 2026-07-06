import prisma from "@/lib/prisma";

export async function getCAMensuel(mois: number, annee: number): Promise<number> {
  const debut = new Date(annee, mois - 1, 1);
  const fin = new Date(annee, mois, 1);

  const collabs = await prisma.collaboration.findMany({
    where: {
      statut: "GAGNE",
      updatedAt: { gte: debut, lt: fin },
    },
    select: { montantBrut: true },
  });

  return collabs.reduce((sum, c) => sum + Number(c.montantBrut ?? 0), 0);
}

export async function calculerPrimeCA(mois: number, annee: number): Promise<number> {
  const margeTotal = await getCAMensuel(mois, annee);
  return Math.round(margeTotal * 0.05 * 100) / 100;
}

// C.A "confirmé" du mois de la Head of Sales, aligné sur ce qu'elle voit sur sa
// page Collaborations : uniquement les collabs qu'elle a créées (createdById),
// toutes sauf PERDU et NEGO (donc EN_COURS + PUBLIE + GAGNE + …),
// filtrées par mois de création (createdAt), somme des montantBrut.
export async function getCASalesMensuel(mois: number, annee: number): Promise<number> {
  // Bornes en UTC pour coller au découpage de la page Collaborations
  // (getMonthKey => date.toISOString().slice(0, 7), donc mois calendaire UTC).
  const debut = new Date(Date.UTC(annee, mois - 1, 1));
  const fin = new Date(Date.UTC(annee, mois, 1));

  const collabs = await prisma.collaboration.findMany({
    where: {
      statut: { notIn: ["PERDU", "NEGO"] },
      createdAt: { gte: debut, lt: fin },
      createdBy: { is: { role: "HEAD_OF_SALES" } },
    },
    select: { montantBrut: true },
  });

  return collabs.reduce((sum, c) => sum + Number(c.montantBrut ?? 0), 0);
}

// Prime Head of Sales : paliers marginaux sur le C.A du mois.
// - 3 % sur la tranche de C.A de 0 à 35 000 €
// - 3,5 % sur la partie du C.A au-dessus de 35 000 €
export const HEAD_OF_SALES_SEUIL = 35000;
export const HEAD_OF_SALES_TAUX_BAS = 0.03;
export const HEAD_OF_SALES_TAUX_HAUT = 0.035;

export type PrimeHeadOfSales = {
  ca: number;
  trancheBasse: number;
  trancheHaute: number;
  primeBasse: number;
  primeHaute: number;
  total: number;
};

export function calculerPrimeHeadOfSalesFromCA(ca: number): PrimeHeadOfSales {
  const safeCA = Number.isFinite(ca) && ca > 0 ? ca : 0;
  const trancheBasse = Math.min(safeCA, HEAD_OF_SALES_SEUIL);
  const trancheHaute = Math.max(safeCA - HEAD_OF_SALES_SEUIL, 0);
  const primeBasse = Math.round(trancheBasse * HEAD_OF_SALES_TAUX_BAS * 100) / 100;
  const primeHaute = Math.round(trancheHaute * HEAD_OF_SALES_TAUX_HAUT * 100) / 100;
  const total = Math.round((primeBasse + primeHaute) * 100) / 100;
  return { ca: safeCA, trancheBasse, trancheHaute, primeBasse, primeHaute, total };
}

export async function calculerPrimeHeadOfSales(mois: number, annee: number): Promise<PrimeHeadOfSales> {
  const ca = await getCASalesMensuel(mois, annee);
  return calculerPrimeHeadOfSalesFromCA(ca);
}

export type SalesCollab = {
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

// Détail des collabs de la Head of Sales pour un mois (même périmètre que le C.A prime),
// utilisé pour l'export Excel.
export async function getSalesCollabsMensuel(mois: number, annee: number): Promise<SalesCollab[]> {
  const debut = new Date(Date.UTC(annee, mois - 1, 1));
  const fin = new Date(Date.UTC(annee, mois, 1));

  const collabs = await prisma.collaboration.findMany({
    where: {
      statut: { notIn: ["PERDU", "NEGO"] },
      createdAt: { gte: debut, lt: fin },
      createdBy: { is: { role: "HEAD_OF_SALES" } },
    },
    select: {
      id: true,
      reference: true,
      montantBrut: true,
      commissionEuros: true,
      commissionPercent: true,
      statut: true,
      createdAt: true,
      marquePayeeAt: true,
      marque: { select: { nom: true } },
      talent: { select: { prenom: true, nom: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  return collabs.map((c) => ({
    id: c.id,
    reference: c.reference,
    marque: c.marque?.nom ?? "",
    talent: c.talent?.prenom ?? "",
    montantBrut: Number(c.montantBrut ?? 0),
    margeTotale: Number(c.commissionEuros ?? 0),
    margePercent: Number(c.commissionPercent ?? 0),
    statut: String(c.statut),
    createdAt: c.createdAt.toISOString(),
    encaisse: Boolean(c.marquePayeeAt),
  }));
}
