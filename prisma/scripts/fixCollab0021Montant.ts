/**
 * One-shot : corriger le montant de la collaboration COL-2026-0021
 * (montantBrut / commissionEuros / montantNet recalculés depuis les livrables)
 * À lancer une fois : npx tsx prisma/scripts/fixCollab0021Montant.ts
 */
import { prisma } from "@/lib/prisma";

async function main() {
  const reference = "COL-2026-0021";
  const montantBrut = 8000;
  const commissionEuros = 2400;
  const montantNet = 5600;

  const collab = await prisma.collaboration.update({
    where: { reference },
    data: {
      montantBrut,
      commissionEuros,
      montantNet,
    },
  });

  console.log(
    `Collaboration ${collab.reference} mise à jour : montantBrut=${montantBrut}, commissionEuros=${commissionEuros}, montantNet=${montantNet}`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
