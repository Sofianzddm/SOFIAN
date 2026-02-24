import { prisma } from "@/lib/prisma";

async function main() {
  const annee = 2026;
  const type = "DEVIS";
  const dernierNumero = 66;

  const existing = await prisma.compteur.findFirst({
    where: { type, annee },
  });

  if (existing) {
    await prisma.compteur.update({
      where: { id: existing.id },
      data: { dernierNumero },
    });
    console.log(
      `Compteur ${type} ${annee} mis à jour à ${dernierNumero} (prochain numéro: ${
        dernierNumero + 1
      })`
    );
  } else {
    await prisma.compteur.create({
      data: {
        type,
        annee,
        code: `${type}_${annee}`,
        dernierNumero,
      },
    });
    console.log(
      `Compteur ${type} ${annee} créé à ${dernierNumero} (prochain numéro: ${
        dernierNumero + 1
      })`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

