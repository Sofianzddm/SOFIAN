/**
 * Rattrapage R2 Outreach Clients (FR + BENELUX) :
 * uniquement si R1 ≥ 25/09/2026 et échéance J+10 atteinte.
 * Usage :
 *   npx tsx scripts/catchup-outreach-relance2-since-sept25.ts [--dry-run] [--limit=50]
 */
import { PrismaClient } from "@prisma/client";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "../src/lib/business-days";
import {
  OUTREACH_RELANCE2_BUSINESS_DAYS,
  OUTREACH_RELANCE2_CATCHUP_SINCE_ISO,
  outreachRelance2Eligible,
} from "../src/lib/outreach-constants";
import { executeOutreachRelance } from "../src/lib/outreach-send";
import { executeBeneluxOutreachRelance } from "../src/lib/benelux-outreach-send";

const p = new PrismaClient();
const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const limitArg = args.find((a) => a.startsWith("--limit="));
const limit = limitArg ? Math.max(1, Number(limitArg.split("=")[1]) || 50) : 80;
const cutoff = new Date(OUTREACH_RELANCE2_CATCHUP_SINCE_ISO);

async function main() {
  const now = new Date();
  console.log(
    JSON.stringify(
      {
        nowParis: now.toLocaleString("fr-FR", { timeZone: "Europe/Paris" }),
        cutoff: cutoff.toISOString(),
        dryRun,
        limit,
        businessDay: isBusinessDay(now),
        withinHours: isWithinRelanceHours(now),
      },
      null,
      2
    )
  );

  if (!isBusinessDay(now) || !isWithinRelanceHours(now)) {
    console.warn("Hors fenêtre relances (jours ouvrés 8h30–18h30 Paris) — stop.");
    return;
  }

  const [frRows, bxRows] = await Promise.all([
    p.outreachTouch.findMany({
      where: {
        relanceSentAt: { gte: cutoff },
        relance2SentAt: null,
        repliedAt: null,
        relanceCancelledAt: null,
        target: { status: "WAITING" },
      },
      select: {
        id: true,
        relanceSentAt: true,
        target: { select: { email: true, company: true } },
      },
      orderBy: { relanceSentAt: "asc" },
    }),
    p.beneluxOutreachTouch.findMany({
      where: {
        relanceSentAt: { gte: cutoff },
        relance2SentAt: null,
        repliedAt: null,
        relanceCancelledAt: null,
        target: { status: "WAITING" },
      },
      select: {
        id: true,
        relanceSentAt: true,
        target: { select: { email: true, companyName: true } },
      },
      orderBy: { relanceSentAt: "asc" },
    }),
  ]);

  type Item = {
    kind: "fr" | "bx";
    id: string;
    email: string;
    company: string;
    relanceSentAt: Date;
  };
  const due: Item[] = [];
  for (const t of frRows) {
    if (!t.relanceSentAt || !outreachRelance2Eligible(t.relanceSentAt)) continue;
    if (
      relanceDue(
        t.relanceSentAt,
        OUTREACH_RELANCE2_BUSINESS_DAYS,
        `${t.id}:r2`,
        now
      )
    ) {
      due.push({
        kind: "fr",
        id: t.id,
        email: t.target.email,
        company: t.target.company,
        relanceSentAt: t.relanceSentAt,
      });
    }
  }
  for (const t of bxRows) {
    if (!t.relanceSentAt || !outreachRelance2Eligible(t.relanceSentAt)) continue;
    if (
      relanceDue(
        t.relanceSentAt,
        OUTREACH_RELANCE2_BUSINESS_DAYS,
        `${t.id}:r2`,
        now
      )
    ) {
      due.push({
        kind: "bx",
        id: t.id,
        email: t.target.email,
        company: t.target.companyName,
        relanceSentAt: t.relanceSentAt,
      });
    }
  }

  console.log(`Dus (R1≥25/09) : ${due.length} (FR+BE) — envoi max ${limit}`);
  const batch = due.slice(0, limit);
  let ok = 0;
  let fail = 0;

  for (const item of batch) {
    console.log(
      `[${item.kind}] ${item.company} <${item.email}> R1=${item.relanceSentAt.toISOString()}`
    );
    if (dryRun) {
      ok += 1;
      continue;
    }
    const result =
      item.kind === "fr"
        ? await executeOutreachRelance(item.id, { round: 2 })
        : await executeBeneluxOutreachRelance(item.id, { round: 2 });
    if (result.ok) {
      ok += 1;
      console.log("  → ok");
    } else {
      fail += 1;
      console.warn("  → fail:", result.error);
    }
    // Petite pause anti-burst Gmail
    await new Promise((r) => setTimeout(r, 800));
  }

  console.log(
    JSON.stringify(
      {
        dueTotal: due.length,
        attempted: batch.length,
        ok,
        fail,
        remaining: Math.max(0, due.length - batch.length),
        dryRun,
      },
      null,
      2
    )
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => p.$disconnect());
