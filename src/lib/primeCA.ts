import prisma from "@/lib/prisma";

export async function calculerPrimeCA(mois: number, annee: number): Promise<number> {
  const debut = new Date(annee, mois - 1, 1);
  const fin = new Date(annee, mois, 1);

  const collabs = await prisma.collaboration.findMany({
    where: {
      statut: "GAGNE",
      updatedAt: { gte: debut, lt: fin },
    },
    select: { montantBrut: true },
  });

  const margeTotal = collabs.reduce((sum, c) => sum + Number(c.montantBrut ?? 0), 0);
  return Math.round(margeTotal * 0.05 * 100) / 100;
}

