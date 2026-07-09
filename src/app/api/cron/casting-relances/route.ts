import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadActivity } from "@/lib/gmail";
import {
  CASTING_RELANCE_BUSINESS_DAYS,
  CASTING_RELANCE2_BUSINESS_DAYS,
  LEYNA_FROM_EMAIL,
  executeCastingRelance,
} from "@/lib/casting-auto-send";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "@/lib/business-days";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Relances automatiques du pipeline prospection talent (2 rounds max) :
 *
 *  - Relance 1 (J+3 ouvrés après le mail initial) : relance courte.
 *  - Relance 2 (J+10 ouvrés après la relance 1, donc après le DERNIER mail) :
 *    relance « valeur ajoutée » style Outreach, personnalisée talent
 *    (media kit, stats, idées de contenus, proposition de call).
 *
 * Pour chaque round, on verifie via l'API Gmail, CONTACT PAR CONTACT,
 * si son thread a recu une vraie reponse (les bounces/postmaster ne comptent pas) :
 *
 *  - Contacts qui ont repondu   → pas de relance pour eux, mission flaggee
 *    `replied=true` (stage RESPONSE_RECEIVED) pour le pipeline.
 *  - Contacts SANS reponse      → ils recoivent quand meme la relance :
 *    la reponse d'UN contact ne bloque pas la relance des autres.
 *  - Contacts en bounce         → pas de relance (adresse en echec).
 *
 * `relanceCancelledAt` (stop manuel) bloque les DEUX rounds.
 * Frequence : toutes les 15 min (cf. vercel.json), jours ouvres 8h30-18h30.
 */

type CronResult = {
  id: string;
  round: 1 | 2;
  replied?: boolean;
  repliedEmails?: string[];
  bouncedEmails?: string[];
  succeeded?: number;
  failed?: number;
  skippedReplied?: number;
  error?: string;
};

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

async function processRelanceRound(
  row: { id: string; sentMessageIds: unknown },
  round: 1 | 2,
  results: CronResult[]
): Promise<void> {
  try {
    const messagesByEmail =
      row.sentMessageIds && typeof row.sentMessageIds === "object"
        ? (row.sentMessageIds as Record<string, { threadId?: string; error?: string }>)
        : {};

    // Detection PAR CONTACT : chaque destinataire a son propre thread Gmail.
    const repliedEmails: string[] = [];
    const bouncedEmails: string[] = [];
    let pendingCount = 0;
    for (const [email, record] of Object.entries(messagesByEmail)) {
      if (!record?.threadId || record.error) continue;
      const activity = await checkThreadActivity(LEYNA_FROM_EMAIL, record.threadId);
      if (activity.replied) {
        repliedEmails.push(email);
      } else if (activity.bounced) {
        // Adresse en echec de remise : inutile de relancer ce thread.
        bouncedEmails.push(email);
      } else {
        pendingCount += 1;
      }
    }

    // Au moins une vraie reponse : on flag la mission pour le pipeline
    // (stage « Reponse recue »), mais on ne bloque PAS la relance des
    // autres contacts restes sans reponse.
    if (repliedEmails.length > 0) {
      await contactMissionModel.update({
        where: { id: row.id },
        data: { replied: true, stage: "RESPONSE_RECEIVED" },
      });
    }

    if (pendingCount === 0) {
      // Personne a relancer (tout le monde a repondu ou est en bounce) :
      // on clot le round pour que le cron ne repasse pas sur la mission.
      await contactMissionModel.update({
        where: { id: row.id },
        data: round === 2 ? { relance2SentAt: new Date() } : { relanceSentAt: new Date() },
      });
      results.push({
        id: row.id,
        round,
        replied: repliedEmails.length > 0,
        repliedEmails,
        bouncedEmails,
        succeeded: 0,
        failed: 0,
      });
      return;
    }

    const outcome = await executeCastingRelance(row.id, {
      round,
      excludeEmails: [...repliedEmails, ...bouncedEmails],
      // La vérification « a-t-il répondu ? » vient d'être faite ci-dessus,
      // inutile de rappeler l'API Gmail pour chaque thread.
      skipReplyCheck: true,
    });
    results.push({
      id: row.id,
      round,
      replied: repliedEmails.length > 0,
      repliedEmails,
      bouncedEmails,
      succeeded: outcome.succeeded,
      failed: outcome.failed,
      skippedReplied: outcome.skippedReplied,
    });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erreur inconnue";
    results.push({ id: row.id, round, error: msg });
    console.error(`[cron/casting-relances] round ${round}`, row.id, msg);
  }
}

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const now = new Date();
  // On ne relance pas le samedi/dimanche : la relance partira au prochain
  // jour ouvre (cron toutes les 15 min, cf. vercel.json).
  if (!isBusinessDay(now)) {
    return NextResponse.json({ processed: 0, skipped: "weekend" });
  }
  // Pas de relance auto hors des heures de bureau (8h30-18h30 Paris) : une
  // echeance qui tombe le soir est reportee au prochain passage dans la
  // fenetre (le lendemain matin ouvre).
  if (!isWithinRelanceHours(now)) {
    return NextResponse.json({ processed: 0, skipped: "hors-heures" });
  }

  /* ---------------- Round 1 : relance courte J+3 ouvres ---------------- */
  // Pre-filtre SQL large : N jours ouvres = au minimum N jours calendaires
  // (cas Lun-Jeu). On filtre donc sur le minimum pour ne rien rater, puis on
  // affine en memoire avec `relanceDue` (jours ouvres + jitter anti-robot).
  const sqlCutoff1 = new Date(
    now.getTime() - CASTING_RELANCE_BUSINESS_DAYS * 24 * 60 * 60 * 1000
  );

  const rawCandidates1 = await contactMissionModel.findMany({
    where: {
      // On inclut RESPONSE_RECEIVED : une mission ou UN contact a repondu
      // peut encore avoir d'autres contacts a relancer (la reponse d'un seul
      // ne bloque pas la relance des autres). Idem pour `replied=true` :
      // on ne filtre pas dessus, la detection se fait PAR CONTACT.
      stage: { in: ["SENT", "RESPONSE_RECEIVED"] },
      sentAt: { lte: sqlCutoff1, not: null },
      relanceSentAt: null,
      // L'utilisateur peut stopper manuellement la relance auto depuis le pipeline
      // ou la page "Mails envoyés". Si `relanceCancelledAt` est defini, on saute.
      relanceCancelledAt: null,
    },
    select: { id: true, sentMessageIds: true, sentAt: true },
    take: 100,
  });

  const candidates1 = (
    rawCandidates1 as Array<{ id: string; sentMessageIds: unknown; sentAt: Date | null }>
  ).filter(
    (row) =>
      row.sentAt &&
      relanceDue(new Date(row.sentAt), CASTING_RELANCE_BUSINESS_DAYS, row.id, now)
  );

  /* -------- Round 2 : relance valeur ajoutee J+10 ouvres apres R1 -------- */
  const sqlCutoff2 = new Date(
    now.getTime() - CASTING_RELANCE2_BUSINESS_DAYS * 24 * 60 * 60 * 1000
  );

  const rawCandidates2 = await contactMissionModel.findMany({
    where: {
      stage: { in: ["SENT", "RESPONSE_RECEIVED"] },
      relanceSentAt: { lte: sqlCutoff2, not: null },
      relance2SentAt: null,
      relanceCancelledAt: null,
    },
    select: { id: true, sentMessageIds: true, relanceSentAt: true },
    take: 100,
  });

  const candidates2 = (
    rawCandidates2 as Array<{ id: string; sentMessageIds: unknown; relanceSentAt: Date | null }>
  ).filter(
    (row) =>
      row.relanceSentAt &&
      // Seed distincte (`:r2`) pour que le jitter anti-robot de la relance 2
      // ne tombe pas au meme decalage que celui de la relance 1.
      relanceDue(
        new Date(row.relanceSentAt),
        CASTING_RELANCE2_BUSINESS_DAYS,
        `${row.id}:r2`,
        now
      )
  );

  const results: CronResult[] = [];
  for (const row of candidates1) {
    await processRelanceRound(row, 1, results);
  }
  for (const row of candidates2) {
    await processRelanceRound(row, 2, results);
  }

  return NextResponse.json({
    processed: candidates1.length + candidates2.length,
    round1: candidates1.length,
    round2: candidates2.length,
    results,
  });
}
