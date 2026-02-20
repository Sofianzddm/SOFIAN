import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  const result = await prisma.partnerView.deleteMany({});
  console.log(`✅ Vues partenaires remises à 0 : ${result.count} entrée(s) supprimée(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
