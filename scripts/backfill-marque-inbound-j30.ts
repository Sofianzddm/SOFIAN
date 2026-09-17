/**
 * Rattrapage marques (Outreach Clients) : WAITING jamais prospectées issues
 * d'un flux entrant → recontact à date d'enrôlement + 30 j calendaires.
 * Si J+30 est déjà passé → TO_RECONTACT.
 *
 * Exclut les envois pipeline casting (attente J+45 légitime).
 *
 * Usage: npx tsx scripts/backfill-marque-inbound-j30.ts
 *        npx tsx scripts/backfill-marque-inbound-j30.ts --dry-run
 */
import prisma from "../src/lib/prisma";
import { INBOUND_MARQUE_RECONTACT_DAYS } from "../src/lib/outreach-constants";

const dryRun = process.argv.includes("--dry-run");

function isOutboundCasting(reason: string | null): boolean {
  return /pipeline casting/i.test(reason || "");
}

/** Essaie d'extraire la date d'échange depuis la raison, sinon fallback. */
function baseDateFromReason(
  reason: string | null,
  fallback: Date
): Date {
  if (!reason) return fallback;
  // "… le 11 septembre 2026 : …" ou "… le 3 août 2026 : …"
  const m = reason.match(
    /le\s+(\d{1,2})\s+(janvier|février|fevrier|mars|avril|mai|juin|juillet|août|aout|septembre|octobre|novembre|décembre|decembre)\s+(\d{4})/i
  );
  if (!m) return fallback;
  const months: Record<string, number> = {
    janvier: 0,
    février: 1,
    fevrier: 1,
    mars: 2,
    avril: 3,
    mai: 4,
    juin: 5,
    juillet: 6,
    août: 7,
    aout: 7,
    septembre: 8,
    octobre: 9,
    novembre: 10,
    décembre: 11,
    decembre: 11,
  };
  const month = months[m[2].toLowerCase()];
  if (month === undefined) return fallback;
  const d = new Date(Date.UTC(Number(m[3]), month, Number(m[1]), 12, 0, 0));
  return Number.isNaN(d.getTime()) ? fallback : d;
}

function addDays(from: Date, days: number): Date {
  return new Date(from.getTime() + days * 24 * 60 * 60 * 1000);
}

async function main() {
  const candidates = await prisma.outreachTarget.findMany({
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
      autoRescheduledAt: true,
      createdAt: true,
      nextRecontactAt: true,
    },
  });

  const toFix = candidates.filter((c) => !isOutboundCasting(c.autoRescheduleReason));
  const skippedCasting = candidates.length - toFix.length;

  console.log(`WAITING jamais contactés : ${candidates.length}`);
  console.log(`  → à rattraper (inbound/négo) : ${toFix.length}`);
  console.log(`  → laissés (casting)          : ${skippedCasting}`);
  if (dryRun) console.log("\n[DRY-RUN] aucune écriture.\n");

  const now = Date.now();
  let toWaiting = 0;
  let toRecontact = 0;

  for (const t of toFix) {
    const fallback = t.autoRescheduledAt || t.createdAt;
    const base = baseDateFromReason(t.autoRescheduleReason, fallback);
    const next = addDays(base, INBOUND_MARQUE_RECONTACT_DAYS);
    const past = next.getTime() <= now;
    const status = past ? "TO_RECONTACT" : "WAITING";
    const name = [t.firstname, t.lastname].filter(Boolean).join(" ");
    const note =
      `Rattrapage inbound marque J+${INBOUND_MARQUE_RECONTACT_DAYS} ` +
      `(${new Date().toISOString().slice(0, 10)}) : ` +
      (past
        ? `délai écoulé → à recontacter.`
        : `recontact planifié au ${next.toLocaleDateString("fr-FR")}.`);

    console.log(
      `  ${dryRun ? "[dry] " : ""}${t.company} — ${name} <${t.email}> → ${status} ` +
        `(base ${base.toISOString().slice(0, 10)} → ${next.toISOString().slice(0, 10)})`
    );

    if (!dryRun) {
      await prisma.outreachTarget.update({
        where: { id: t.id },
        data: {
          status,
          nextRecontactAt: past ? next : next,
          autoRescheduleReason: note,
          autoRescheduledAt: new Date(),
        },
      });
    }

    if (past) toRecontact += 1;
    else toWaiting += 1;
  }

  console.log(`\nRésultat :`);
  console.log(`  En attente (J+30 futur) : ${toWaiting}`);
  console.log(`  À recontacter (échu)    : ${toRecontact}`);
  console.log(`  Écrits                  : ${dryRun ? 0 : toWaiting + toRecontact}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
