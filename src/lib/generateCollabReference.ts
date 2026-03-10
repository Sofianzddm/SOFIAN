import { prisma } from "@/lib/prisma";

export async function generateCollabReference(): Promise<string> {
  const year = new Date().getFullYear();

  const compteur = await prisma.$transaction(async (tx) => {
    const existing = await tx.compteur.findUnique({
      where: { type_annee: { type: "COLLAB", annee: year } },
    });

    if (existing) {
      return tx.compteur.update({
        where: { type_annee: { type: "COLLAB", annee: year } },
        data: { dernierNumero: { increment: 1 } },
      });
    }

    // Pas de compteur → on cherche le max existant en base
    const lastCollab = await tx.collaboration.findFirst({
      where: { reference: { startsWith: `COL-${year}-` } },
      orderBy: { reference: "desc" },
    });

    const lastNum = lastCollab
      ? parseInt(lastCollab.reference.split("-")[2])
      : 0;

    return tx.compteur.create({
      data: { type: "COLLAB", annee: year, dernierNumero: lastNum + 1 },
    });
  });

  return `COL-${year}-${String(compteur.dernierNumero).padStart(4, "0")}`;
}

