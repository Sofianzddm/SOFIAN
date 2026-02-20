import { prisma } from "@/lib/prisma";

async function main() {
  // Chercher le partenaire WOO (insensible à la casse)
  const partner = await prisma.partner.findFirst({
    where: {
      name: {
        equals: "WOO",
        mode: "insensitive",
      },
    },
    select: {
      id: true,
      name: true,
      slug: true,
    },
  });

  if (!partner) {
    console.error("❌ Partenaire 'WOO' introuvable");
    return;
  }

  console.log(
    `Partenaire trouvé: ${partner.name} (id=${partner.id}, slug=${partner.slug})`
  );

  // Supprimer uniquement les vues (action = "view") pour ce partenaire
  const result = await prisma.partnerView.deleteMany({
    where: {
      partnerId: partner.id,
      action: "view",
    },
  });

  console.log(`✅ Compteur de vues remis à 0 pour WOO. Lignes supprimées: ${result.count}`);
}

main()
  .catch((err) => {
    console.error("Erreur lors de la réinitialisation des vues WOO:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

