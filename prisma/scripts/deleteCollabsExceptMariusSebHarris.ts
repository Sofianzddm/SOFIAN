import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔍 Recherche des talents à conserver (Marius, Seb Harris)...");

  const talentsToKeep = await prisma.talent.findMany({
    where: {
      OR: [
        { prenom: { contains: "Marius", mode: "insensitive" } },
        { nom: { contains: "Marius", mode: "insensitive" } },
        {
          AND: [
            { prenom: { contains: "Seb", mode: "insensitive" } },
            { nom: { contains: "Harris", mode: "insensitive" } },
          ],
        },
      ],
    },
    select: { id: true, prenom: true, nom: true },
  });

  if (talentsToKeep.length === 0) {
    console.log("⚠️ Aucun talent trouvé pour Marius / Seb Harris. Abandon.");
    return;
  }

  console.log(
    "✅ Talents conservés :",
    talentsToKeep.map((t) => `${t.prenom} ${t.nom} (${t.id})`).join(", "),
  );

  const talentIdsToKeep = talentsToKeep.map((t) => t.id);

  console.log("🔍 Sélection des collaborations à supprimer...");

  const collabsToDelete = await prisma.collaboration.findMany({
    where: {
      talentId: {
        notIn: talentIdsToKeep,
      },
    },
    select: { id: true, reference: true },
  });

  if (collabsToDelete.length === 0) {
    console.log("ℹ️ Aucune collaboration à supprimer (hors Marius / Seb Harris).");
    return;
  }

  const collabIdsToDelete = collabsToDelete.map((c) => c.id);

  console.log(`🗑  Collaborations à supprimer : ${collabsToDelete.length}`);

  // 1) Supprimer les négociations liées à ces collaborations (pour respecter la contrainte FK)
  const deletedNegos = await prisma.negociation.deleteMany({
    where: {
      collaborationId: {
        in: collabIdsToDelete,
      },
    },
  });
  console.log(`✅ Négociations liées supprimées : ${deletedNegos.count}`);

  // 2) Supprimer les collaborations
  const deletedCollabs = await prisma.collaboration.deleteMany({
    where: {
      id: {
        in: collabIdsToDelete,
      },
    },
  });

  console.log(`✅ Collaborations supprimées (hors Marius / Seb Harris) : ${deletedCollabs.count}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

