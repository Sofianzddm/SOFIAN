import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("Mise à zéro des dates de mise à jour des stats talents...");

  const result = await prisma.talentStats.updateMany({
    data: {
      // On remonte toutes les dates très loin dans le passé pour forcer l'alerte "à mettre à jour"
      lastUpdate: new Date("2000-01-01T00:00:00.000Z"),
    },
  });

  console.log(`Dates de mise à jour réinitialisées pour ${result.count} enregistrement(s) de stats.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

