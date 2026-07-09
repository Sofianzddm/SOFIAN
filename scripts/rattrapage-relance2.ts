/**
 * Rattrapage ponctuel de la relance 2 (J+10 ouvrés après la relance J+3) sur
 * les cartes du pipeline prospection talent dont l'échéance est déjà passée.
 * Réplique exactement le round 2 du cron /api/cron/casting-relances (détection
 * des réponses CONTACT PAR CONTACT via Gmail, exclusion des bounces, une seule
 * relance 2 max par carte). À lancer avec les variables d'env de production
 * (GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / XAI_API_KEY / DATABASE_URL).
 *
 * Usage :
 *   npx tsx --env-file=.env.vercel-prod scripts/rattrapage-relance2.ts           # dry-run
 *   npx tsx --env-file=.env.vercel-prod scripts/rattrapage-relance2.ts --apply   # envoie
 */
import { prisma } from "../src/lib/prisma";
import { checkThreadActivity } from "../src/lib/gmail";
import {
  CASTING_RELANCE2_BUSINESS_DAYS,
  LEYNA_FROM_EMAIL,
  executeCastingRelance,
} from "../src/lib/casting-auto-send";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "../src/lib/business-days";

const APPLY = process.argv.includes("--apply");
const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function main() {
  const now = new Date();
  if (APPLY && (!isBusinessDay(now) || !isWithinRelanceHours(now))) {
    console.error("Hors fenêtre d'envoi (jours ouvrés 8h30-18h30 Paris) : abandon.");
    process.exit(1);
  }

  const raw = await contactMissionModel.findMany({
    where: {
      stage: { in: ["SENT", "RESPONSE_RECEIVED"] },
      relanceSentAt: { not: null },
      relance2SentAt: null,
      relanceCancelledAt: null,
    },
    select: {
      id: true,
      creatorName: true,
      targetBrand: true,
      sentMessageIds: true,
      relanceSentAt: true,
    },
    orderBy: { relanceSentAt: "asc" },
  });

  const due = (raw as Array<{
    id: string;
    creatorName: string;
    targetBrand: string;
    sentMessageIds: unknown;
    relanceSentAt: Date | null;
  }>).filter(
    (row) =>
      row.relanceSentAt &&
      relanceDue(
        new Date(row.relanceSentAt),
        CASTING_RELANCE2_BUSINESS_DAYS,
        `${row.id}:r2`,
        now
      )
  );

  console.log(
    `${raw.length} carte(s) éligibles relance 2, dont ${due.length} due(s) — ${APPLY ? "MODE APPLY (envoi réel)" : "dry-run (aucun envoi)"}\n`
  );

  let totalSent = 0;
  let totalSkippedReplied = 0;
  let totalSkippedBounced = 0;
  let totalFailed = 0;

  for (const [idx, row] of due.entries()) {
    const label = `${row.creatorName.replace(/\s+/g, " ")} → ${row.targetBrand}`;
    const messagesByEmail =
      row.sentMessageIds && typeof row.sentMessageIds === "object"
        ? (row.sentMessageIds as Record<string, { threadId?: string; error?: string }>)
        : {};
    const contactEmails = Object.entries(messagesByEmail)
      .filter(([, r]) => r?.threadId && !r.error)
      .map(([email]) => email);

    if (!APPLY) {
      console.log(
        `  [${idx + 1}/${due.length}] ${label} — relance 1 le ${row.relanceSentAt?.toLocaleDateString("fr-FR")} — ${contactEmails.length} contact(s) : ${contactEmails.join(", ")}`
      );
      continue;
    }

    try {
      // Détection PAR CONTACT (même logique que le cron round 2).
      const repliedEmails: string[] = [];
      const bouncedEmails: string[] = [];
      let pendingCount = 0;
      for (const [email, record] of Object.entries(messagesByEmail)) {
        if (!record?.threadId || record.error) continue;
        const activity = await checkThreadActivity(LEYNA_FROM_EMAIL, record.threadId);
        if (activity.replied) repliedEmails.push(email);
        else if (activity.bounced) bouncedEmails.push(email);
        else pendingCount += 1;
      }

      if (repliedEmails.length > 0) {
        await contactMissionModel.update({
          where: { id: row.id },
          data: { replied: true, stage: "RESPONSE_RECEIVED" },
        });
      }

      if (pendingCount === 0) {
        await contactMissionModel.update({
          where: { id: row.id },
          data: { relance2SentAt: new Date() },
        });
        totalSkippedReplied += repliedEmails.length;
        totalSkippedBounced += bouncedEmails.length;
        console.log(
          `  [${idx + 1}/${due.length}] ${label} — personne à relancer (répondu: ${repliedEmails.length}, bounce: ${bouncedEmails.length}) → clôturé`
        );
        continue;
      }

      const outcome = await executeCastingRelance(row.id, {
        round: 2,
        excludeEmails: [...repliedEmails, ...bouncedEmails],
        skipReplyCheck: true,
      });
      totalSent += outcome.succeeded;
      totalFailed += outcome.failed;
      totalSkippedReplied += repliedEmails.length;
      totalSkippedBounced += bouncedEmails.length;
      console.log(
        `  [${idx + 1}/${due.length}] ${label} — envoyé: ${outcome.succeeded}, échec: ${outcome.failed}, exclus (répondu/bounce): ${repliedEmails.length}/${bouncedEmails.length}${outcome.errors.length ? ` — ERREURS: ${outcome.errors.join(" | ")}` : ""}`
      );
    } catch (error) {
      totalFailed += 1;
      console.error(
        `  [${idx + 1}/${due.length}] ${label} — ERREUR:`,
        error instanceof Error ? error.message : error
      );
    }

    // Petite pause entre les cartes pour lisser l'envoi côté Gmail.
    await sleep(3000);
  }

  if (APPLY) {
    console.log(
      `\nRésumé : ${totalSent} relance(s) 2 envoyée(s), ${totalFailed} échec(s), ${totalSkippedReplied} contact(s) exclus (répondu), ${totalSkippedBounced} bounce(s).`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
