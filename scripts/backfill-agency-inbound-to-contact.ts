/**
 * Rattrapage : agences en WAITING jamais prospectées → file « À contacter ».
 *
 * Aligné sur la nouvelle règle inbound : une agence qui nous a écrit (ou dont
 * l'échange a été clôturé) et qui n'a jamais reçu de mail de cycle doit être
 * actionnable tout de suite — pas bloquée derrière un J+45.
 *
 * Critères :
 *  - status WAITING, cycleCount = 0, lastSentAt null
 *  - raison != envoi pipeline casting (ceux-là restent en attente)
 *
 * Usage: npx tsx scripts/backfill-agency-inbound-to-contact.ts
 *        npx tsx scripts/backfill-agency-inbound-to-contact.ts --dry-run
 */
import prisma from "../src/lib/prisma";

const dryRun = process.argv.includes("--dry-run");

function isOutboundCasting(reason: string | null): boolean {
  return /pipeline casting/i.test(reason || "");
}

async function main() {
  const candidates = await prisma.agencyOutreachTarget.findMany({
    where: {
      status: "WAITING",
      cycleCount: 0,
      lastSentAt: null,
    },
    orderBy: [{ company: "asc" }, { email: "asc" }],
    select: {
      id: true,
      email: true,
      company: true,
      firstname: true,
      lastname: true,
      autoRescheduleReason: true,
      nextRecontactAt: true,
      createdAt: true,
    },
  });

  const toMove = candidates.filter((c) => !isOutboundCasting(c.autoRescheduleReason));
  const skippedCasting = candidates.length - toMove.length;

  console.log(`Candidats WAITING jamais contactés : ${candidates.length}`);
  console.log(`  → à basculer « À contacter »     : ${toMove.length}`);
  console.log(`  → laissés (envoi casting)        : ${skippedCasting}`);
  if (dryRun) console.log("\n[DRY-RUN] aucune écriture.\n");

  let updated = 0;
  for (const t of toMove) {
    const name = [t.firstname, t.lastname].filter(Boolean).join(" ");
    const note =
      `Rattrapage inbound → à contacter (${new Date().toISOString().slice(0, 10)}) : ` +
      `agence jamais prospectée, sortie de l'attente.`;
    console.log(`  ${dryRun ? "[dry] " : ""}${t.company} — ${name} <${t.email}>`);

    if (!dryRun) {
      await prisma.agencyOutreachTarget.update({
        where: { id: t.id },
        data: {
          status: "TO_CONTACT",
          nextRecontactAt: null,
          autoRescheduleReason: note,
          autoRescheduledAt: new Date(),
        },
      });
      updated += 1;
    }
  }

  console.log(`\nFait : ${dryRun ? 0 : updated} agence(s) en « À contacter ».`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
