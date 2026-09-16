/**
 * Backfill linkedMarqueId pour les entreprises BENELUX déjà transférées
 * (match par nom exact insensible à la casse).
 *
 * Usage: npx tsx scripts/backfill-benelux-linked-marque.ts
 */
import prisma from "../src/lib/prisma";

async function main() {
  const companies = await prisma.beneluxCompany.findMany({
    where: { linkedMarqueId: null },
    select: { id: true, nom: true },
  });
  console.log(`${companies.length} entreprises BENELUX sans lien FR`);

  let linked = 0;
  for (const c of companies) {
    const marque = await prisma.marque.findFirst({
      where: { nom: { equals: c.nom, mode: "insensitive" } },
      select: { id: true, nom: true, _count: { select: { collaborations: true } } },
    });
    if (!marque) continue;
    await prisma.beneluxCompany.update({
      where: { id: c.id },
      data: { linkedMarqueId: marque.id },
    });
    linked += 1;
    console.log(
      `  ✓ ${c.nom} → ${marque.nom} (${marque._count.collaborations} collabs)`
    );
  }
  console.log(`\n${linked} liens créés`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
