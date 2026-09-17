/**
 * Nettoie les emails stockés avec des chevrons < > (headers / imports).
 *
 * "<alice@agence.fr>"  → alice@agence.fr
 * "<<alice@agence.fr>>" → alice@agence.fr
 *
 * En cas de collision avec une adresse déjà propre (unicité email) :
 * on conserve la fiche propre et on supprime / merge la sale.
 *
 * Usage: npx tsx scripts/cleanup-angle-bracket-emails.ts
 *        npx tsx scripts/cleanup-angle-bracket-emails.ts --dry-run
 */
import prisma from "../src/lib/prisma";
import { normalizeEmail } from "../src/lib/normalize-email";

const dryRun = process.argv.includes("--dry-run");

type Dirty = { id: string; email: string; extra?: string };

async function cleanUniqueEmailTable(
  label: string,
  dirty: Dirty[],
  findClean: (clean: string) => Promise<{ id: string } | null>,
  update: (id: string, clean: string) => Promise<unknown>,
  remove: (id: string) => Promise<unknown>
) {
  let updated = 0;
  let deleted = 0;
  let skipped = 0;

  for (const row of dirty) {
    const clean = normalizeEmail(row.email);
    if (!clean || clean === row.email.trim().toLowerCase()) {
      // Déjà propre ou invalide après normalisation.
      if (!clean) skipped += 1;
      continue;
    }

    const existing = await findClean(clean);
    if (existing && existing.id !== row.id) {
      console.log(
        `  [${label}] collision ${JSON.stringify(row.email)} → ${clean} : suppression du doublon sale`
      );
      if (!dryRun) await remove(row.id);
      deleted += 1;
      continue;
    }

    console.log(`  [${label}] ${JSON.stringify(row.email)} → ${clean}`);
    if (!dryRun) await update(row.id, clean);
    updated += 1;
  }

  return { updated, deleted, skipped };
}

async function main() {
  console.log(dryRun ? "[DRY-RUN] nettoyage emails <…>\n" : "Nettoyage emails <…>\n");

  const whereAngle = {
    OR: [{ email: { contains: "<" } }, { email: { contains: ">" } }],
  };

  const [agencyTargets, clientTargets, agencyContacts, marqueContacts] =
    await Promise.all([
      prisma.agencyOutreachTarget.findMany({
        where: whereAngle,
        select: { id: true, email: true },
      }),
      prisma.outreachTarget.findMany({
        where: whereAngle,
        select: { id: true, email: true },
      }),
      prisma.agencyContact.findMany({
        where: whereAngle,
        select: { id: true, email: true, partnerId: true },
      }),
      prisma.marqueContact.findMany({
        where: {
          OR: [{ email: { contains: "<" } }, { email: { contains: ">" } }],
        },
        select: { id: true, email: true, marqueId: true },
      }),
    ]);

  const r1 = await cleanUniqueEmailTable(
    "agencyOutreachTarget",
    agencyTargets,
    (clean) =>
      prisma.agencyOutreachTarget.findUnique({
        where: { email: clean },
        select: { id: true },
      }),
    (id, clean) =>
      prisma.agencyOutreachTarget.update({ where: { id }, data: { email: clean } }),
    (id) => prisma.agencyOutreachTarget.delete({ where: { id } })
  );

  const r2 = await cleanUniqueEmailTable(
    "outreachTarget",
    clientTargets,
    (clean) =>
      prisma.outreachTarget.findUnique({
        where: { email: clean },
        select: { id: true },
      }),
    (id, clean) =>
      prisma.outreachTarget.update({ where: { id }, data: { email: clean } }),
    (id) => prisma.outreachTarget.delete({ where: { id } })
  );

  // AgencyContact : unique (partnerId, email)
  let acUpdated = 0;
  let acDeleted = 0;
  for (const row of agencyContacts) {
    if (!row.email) continue;
    const clean = normalizeEmail(row.email);
    if (!clean || clean === row.email.trim().toLowerCase()) continue;

    const existing = await prisma.agencyContact.findFirst({
      where: {
        partnerId: row.partnerId,
        email: { equals: clean, mode: "insensitive" },
        NOT: { id: row.id },
      },
      select: { id: true },
    });
    if (existing) {
      console.log(
        `  [agencyContact] collision ${JSON.stringify(row.email)} → ${clean} : suppression`
      );
      if (!dryRun) {
        // Re-pointe les targets vers le contact propre si besoin.
        await prisma.agencyOutreachTarget.updateMany({
          where: { agencyContactId: row.id },
          data: { agencyContactId: existing.id, email: clean },
        });
        await prisma.agencyContact.delete({ where: { id: row.id } });
      }
      acDeleted += 1;
      continue;
    }
    console.log(`  [agencyContact] ${JSON.stringify(row.email)} → ${clean}`);
    if (!dryRun) {
      await prisma.agencyContact.update({
        where: { id: row.id },
        data: { email: clean },
      });
      await prisma.agencyOutreachTarget.updateMany({
        where: { agencyContactId: row.id },
        data: { email: clean },
      });
    }
    acUpdated += 1;
  }

  // MarqueContact : pas d'unique email globale, mais dédup logique par marque+email
  let mcUpdated = 0;
  let mcDeleted = 0;
  for (const row of marqueContacts) {
    if (!row.email) continue;
    const clean = normalizeEmail(row.email);
    if (!clean || clean === row.email.trim().toLowerCase()) continue;

    const existing = await prisma.marqueContact.findFirst({
      where: {
        marqueId: row.marqueId,
        email: { equals: clean, mode: "insensitive" },
        NOT: { id: row.id },
      },
      select: { id: true },
    });
    if (existing) {
      console.log(
        `  [marqueContact] collision ${JSON.stringify(row.email)} → ${clean} : suppression`
      );
      if (!dryRun) {
        await prisma.outreachTarget.updateMany({
          where: { marqueContactId: row.id },
          data: { marqueContactId: existing.id, email: clean },
        });
        await prisma.marqueContact.delete({ where: { id: row.id } });
      }
      mcDeleted += 1;
      continue;
    }
    console.log(`  [marqueContact] ${JSON.stringify(row.email)} → ${clean}`);
    if (!dryRun) {
      await prisma.marqueContact.update({
        where: { id: row.id },
        data: { email: clean },
      });
      await prisma.outreachTarget.updateMany({
        where: { marqueContactId: row.id },
        data: { email: clean },
      });
    }
    mcUpdated += 1;
  }

  console.log("\n=== Résultat ===");
  console.log("agencyOutreachTarget:", r1);
  console.log("outreachTarget:", r2);
  console.log("agencyContact:", { updated: acUpdated, deleted: acDeleted });
  console.log("marqueContact:", { updated: mcUpdated, deleted: mcDeleted });
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
