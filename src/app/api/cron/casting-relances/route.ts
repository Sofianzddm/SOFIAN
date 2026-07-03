import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkThreadActivity } from "@/lib/gmail";
import {
  CASTING_RELANCE_BUSINESS_DAYS,
  LEYNA_FROM_EMAIL,
  executeCastingRelance,
} from "@/lib/casting-auto-send";
import { relanceDue, isBusinessDay, isWithinRelanceHours } from "@/lib/business-days";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/**
 * Relance J+3 : pour toutes les missions envoyees il y a au moins
 * `CASTING_RELANCE_BUSINESS_DAYS` jours ouvres (Lun-Ven, Europe/Paris),
 * pas encore relancees, on verifie via l'API Gmail, CONTACT PAR CONTACT,
 * si son thread a recu une vraie reponse (les bounces/postmaster ne
 * comptent pas).
 *
 *  - Contacts qui ont repondu   → pas de relance pour eux, mission flaggee
 *    `replied=true` (stage RESPONSE_RECEIVED) pour le pipeline.
 *  - Contacts SANS reponse      → ils recoivent quand meme la relance J+3 :
 *    la reponse d'UN contact ne bloque plus la relance des autres.
 *  - Contacts en bounce         → pas de relance (adresse en echec).
 *
 * Frequence : quotidien (cf. vercel.json), ideal le matin.
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const now = new Date();
  // On ne relance pas le samedi/dimanche : la relance partira au prochain
  // jour ouvre (cron quotidien 8h, cf. vercel.json).
  if (!isBusinessDay(now)) {
    return NextResponse.json({ processed: 0, skipped: "weekend" });
  }
  // Pas de relance auto hors des heures de bureau (8h30-18h30 Paris) : une
  // echeance qui tombe le soir est reportee au prochain passage dans la
  // fenetre (le lendemain matin ouvre).
  if (!isWithinRelanceHours(now)) {
    return NextResponse.json({ processed: 0, skipped: "hors-heures" });
  }

  const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
  // Pre-filtre SQL large : N jours ouvres = au minimum N jours calendaires
  // (cas Lun-Jeu) et au maximum N + 2 (cas Jeu-Mar). On filtre donc sur le
  // minimum (N jours calendaires) pour ne rien rater, puis on affine en
  // memoire avec `hasBusinessDaysElapsed` pour exclure les missions envoyees
  // juste avant le week-end.
  const sqlCutoff = new Date(now.getTime() - CASTING_RELANCE_BUSINESS_DAYS * 24 * 60 * 60 * 1000);

  const rawCandidates = await contactMissionModel.findMany({
    where: {
      // On inclut RESPONSE_RECEIVED : une mission ou UN contact a repondu
      // peut encore avoir d'autres contacts a relancer (la reponse d'un seul
      // ne bloque plus la relance des autres). Idem pour `replied=true` :
      // on ne filtre plus dessus, la detection se fait PAR CONTACT plus bas.
      stage: { in: ["SENT", "RESPONSE_RECEIVED"] },
      sentAt: { lte: sqlCutoff, not: null },
      relanceSentAt: null,
      // L'utilisateur peut stopper manuellement la relance auto depuis le pipeline
      // ou la page "Mails envoyés". Si `relanceCancelledAt` est defini, on saute.
      relanceCancelledAt: null,
    },
    select: { id: true, sentMessageIds: true, sentAt: true },
    take: 100,
  });

  const candidates = (rawCandidates as Array<{ id: string; sentMessageIds: unknown; sentAt: Date | null }>).filter(
    (row) => row.sentAt && relanceDue(new Date(row.sentAt), CASTING_RELANCE_BUSINESS_DAYS, row.id, now)
  );

  const results: Array<{
    id: string;
    replied?: boolean;
    repliedEmails?: string[];
    bouncedEmails?: string[];
    succeeded?: number;
    failed?: number;
    skippedReplied?: number;
    error?: string;
  }> = [];

  for (const row of candidates) {
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
      // (stage « Reponse recue »), mais on ne bloque PLUS la relance des
      // autres contacts restes sans reponse.
      if (repliedEmails.length > 0) {
        await contactMissionModel.update({
          where: { id: row.id },
          data: { replied: true, stage: "RESPONSE_RECEIVED" },
        });
      }

      if (pendingCount === 0) {
        // Personne a relancer (tout le monde a repondu ou est en bounce) :
        // on clot la relance pour que le cron ne repasse pas sur la mission.
        await contactMissionModel.update({
          where: { id: row.id },
          data: { relanceSentAt: new Date() },
        });
        results.push({
          id: row.id,
          replied: repliedEmails.length > 0,
          repliedEmails,
          bouncedEmails,
          succeeded: 0,
          failed: 0,
        });
        continue;
      }

      const outcome = await executeCastingRelance(row.id, {
        excludeEmails: [...repliedEmails, ...bouncedEmails],
        // La vérification « a-t-il répondu ? » vient d'être faite ci-dessus,
        // inutile de rappeler l'API Gmail pour chaque thread.
        skipReplyCheck: true,
      });
      results.push({
        id: row.id,
        replied: repliedEmails.length > 0,
        repliedEmails,
        bouncedEmails,
        succeeded: outcome.succeeded,
        failed: outcome.failed,
        skippedReplied: outcome.skippedReplied,
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur inconnue";
      results.push({ id: row.id, error: msg });
      console.error("[cron/casting-relances]", row.id, msg);
    }
  }

  return NextResponse.json({ processed: candidates.length, results });
}
