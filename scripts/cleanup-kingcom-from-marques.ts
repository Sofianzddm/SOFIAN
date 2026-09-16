/**
 * Retire les emails @kingcom.fr des fiches marques (McDo etc.) :
 * ce sont des contacts agence, pas des contacts marque.
 */
import prisma from "../src/lib/prisma";

async function main() {
  const contacts = await prisma.marqueContact.findMany({
    where: { email: { endsWith: "@kingcom.fr", mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      marque: { select: { nom: true } },
      outreachTargets: { select: { id: true, status: true } },
    },
  });

  console.log(`Contacts marque @kingcom.fr à retirer: ${contacts.length}`);
  for (const c of contacts) {
    console.log(` - ${c.email} sur ${c.marque.nom} (targets client: ${c.outreachTargets.length})`);
  }

  // Sécurité : ne pas supprimer s'il reste un target client actif
  const blocked = contacts.filter((c) =>
    c.outreachTargets.some((t) => t.status !== "STOPPED")
  );
  if (blocked.length > 0) {
    throw new Error(
      `Impossible: ${blocked.length} contact(s) encore en cycle client actif.`
    );
  }

  // Détache d'éventuels targets STOPPED puis supprime
  const ids = contacts.map((c) => c.id);
  if (ids.length === 0) {
    console.log("Rien à faire.");
    return;
  }

  await prisma.$transaction(async (tx) => {
    await tx.outreachTarget.updateMany({
      where: { marqueContactId: { in: ids } },
      data: { marqueContactId: null },
    });
    const deleted = await tx.marqueContact.deleteMany({
      where: { id: { in: ids } },
    });
    console.log(`Supprimés des fiches marques: ${deleted.count}`);
  });

  const remaining = await prisma.marqueContact.count({
    where: { email: { endsWith: "@kingcom.fr", mode: "insensitive" } },
  });
  const onAgency = await prisma.agencyContact.count({
    where: {
      partner: { slug: "kingcom" },
      email: { endsWith: "@kingcom.fr", mode: "insensitive" },
    },
  });
  console.log(`Restant sur marques: ${remaining}`);
  console.log(`Toujours sur Kingcom agence: ${onAgency}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
