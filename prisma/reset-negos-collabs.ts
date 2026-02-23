import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔁 Réinitialisation des négociations et collaborations...");

  // On commence par supprimer les négociations pour libérer la contrainte collaborationId
  const deletedNegos = await prisma.negociation.deleteMany({});
  console.log(`✅ Négociations supprimées : ${deletedNegos.count}`);

  // Puis on supprime les collaborations (les livrables / cycles / documents sont gérés par onDelete côté Prisma)
  const deletedCollabs = await prisma.collaboration.deleteMany({});
  console.log(`✅ Collaborations supprimées : ${deletedCollabs.count}`);

  console.log("🎉 Remise à zéro des négociations et collaborations terminée.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

