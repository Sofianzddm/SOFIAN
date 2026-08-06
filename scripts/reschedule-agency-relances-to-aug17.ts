/**
 * Reporte au 17 août 2026 les relances agences (J+3) dont l'échéance tombe
 * entre aujourd'hui (6 août) et le 16 août inclus (heure Paris).
 *
 * Usage :
 *   npx tsx scripts/reschedule-agency-relances-to-aug17.ts          # dry-run
 *   npx tsx scripts/reschedule-agency-relances-to-aug17.ts --apply
 */

import { PrismaClient } from "@prisma/client";
import { businessDeadlineWithJitter } from "../src/lib/business-days";
import { parseParisDateTimeLocalToUtc } from "../src/lib/agency-outreach-send";

const prisma = new PrismaClient();
const RELANCE_BUSINESS_DAYS = 3;
const FROM_YMD = "2026-08-06";
const TO_YMD = "2026-08-16";
const TARGET_YMD = "2026-08-17";

function parisYmd(d: Date): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(d);
}

function parisHm(d: Date): { hour: string; minute: string } {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).formatToParts(d);
  const m: Record<string, string> = {};
  for (const p of parts) if (p.type !== "literal") m[p.type] = p.value;
  const hour = m.hour === "24" ? "00" : m.hour;
  return { hour, minute: m.minute };
}

function dueAt(touch: {
  id: string;
  sentAt: Date;
  relanceScheduledAt: Date | null;
}): Date {
  if (touch.relanceScheduledAt) return touch.relanceScheduledAt;
  return businessDeadlineWithJitter(touch.sentAt, RELANCE_BUSINESS_DAYS, touch.id);
}

async function main() {
  const apply = process.argv.includes("--apply");

  const targets = await prisma.agencyOutreachTarget.findMany({
    where: { status: "WAITING" },
    select: {
      id: true,
      email: true,
      company: true,
      market: true,
      touches: {
        where: { sentAt: { not: null } },
        orderBy: { cycleNumber: "desc" },
        take: 1,
        select: {
          id: true,
          sentAt: true,
          relanceSentAt: true,
          repliedAt: true,
          relanceCancelledAt: true,
          relanceScheduledAt: true,
        },
      },
    },
  });

  const toUpdate: {
    touchId: string;
    email: string;
    company: string;
    market: string | null;
    oldDue: Date;
    newDue: Date;
  }[] = [];

  for (const t of targets) {
    const touch = t.touches[0];
    if (!touch?.sentAt) continue;
    if (touch.relanceSentAt || touch.repliedAt || touch.relanceCancelledAt) continue;

    const due = dueAt({
      id: touch.id,
      sentAt: touch.sentAt,
      relanceScheduledAt: touch.relanceScheduledAt,
    });
    const ymd = parisYmd(due);
    if (ymd < FROM_YMD || ymd > TO_YMD) continue;

    const { hour, minute } = parisHm(due);
    // Garde l'heure d'origine, sur le 17 août (Paris).
    const newDue = parseParisDateTimeLocalToUtc(`${TARGET_YMD}T${hour}:${minute}`);
    if (!newDue) continue;

    toUpdate.push({
      touchId: touch.id,
      email: t.email,
      company: t.company,
      market: t.market,
      oldDue: due,
      newDue,
    });
  }

  const byMarket = toUpdate.reduce(
    (acc, row) => {
      const m = row.market || "FR";
      acc[m] = (acc[m] || 0) + 1;
      return acc;
    },
    {} as Record<string, number>
  );

  console.log(
    JSON.stringify(
      {
        mode: apply ? "APPLY" : "DRY-RUN",
        window: `${FROM_YMD} → ${TO_YMD}`,
        targetDay: TARGET_YMD,
        count: toUpdate.length,
        byMarket,
        sample: toUpdate.slice(0, 8).map((r) => ({
          email: r.email,
          company: r.company,
          oldDue: r.oldDue.toISOString(),
          newDue: r.newDue.toISOString(),
        })),
      },
      null,
      2
    )
  );

  if (!apply) {
    console.log("\nDry-run only. Relance avec --apply pour écrire en base.");
    return;
  }

  let updated = 0;
  for (const row of toUpdate) {
    await prisma.agencyOutreachTouch.update({
      where: { id: row.touchId },
      data: {
        relanceScheduledAt: row.newDue,
        relanceCancelledAt: null,
        relanceCancelledById: null,
      },
    });
    updated += 1;
  }
  console.log(`\nOK — ${updated} relance(s) reprogrammée(s) au ${TARGET_YMD}.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
