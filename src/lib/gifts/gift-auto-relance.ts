/**
 * Relance automatique gift J+2 (jours ouvrés) — même logique que casting-relances
 * (cron + IA + check thread Gmail), depuis la boîte Gmail de l'AM qui a envoyé.
 */

import React from "react";
import { prisma } from "@/lib/prisma";
import {
  sendGmailDetailed,
  checkThreadActivity,
  getGmailMessageMeta,
} from "@/lib/gmail";
import { render } from "@react-email/render";
import { GiftContactMarqueEmail } from "@/emails/GiftContactMarqueEmail";
import {
  buildGiftContactDraft,
  giftTypeLabel,
  isUsableEmail,
} from "@/lib/gifts/contact-marque-draft";
import {
  buildGiftRelanceFallback,
  generateGiftRelanceBody,
} from "@/lib/gifts/gift-relance-ai";
import { normalizeContactLanguage } from "@/lib/gifts/contact-language";
import { relanceDue } from "@/lib/business-days";

/** J+2 ouvrés après le 1er contact (demande user — casting est en J+3). */
export const GIFT_RELANCE_BUSINESS_DAYS = 2;

export type GiftRelanceOutcome = {
  demandeGiftId: string;
  marqueId: string;
  marqueNom: string;
  ok: boolean;
  skipped?: string;
  error?: string;
};

async function resolveFromEmail(userId: string | null | undefined) {
  if (!userId) return null;
  const token = await prisma.gmailToken.findUnique({
    where: { userId },
    select: { email: true },
  });
  return token?.email || null;
}

export async function executeGiftRelance(opts: {
  demandeGiftId: string;
  marqueId: string;
}): Promise<GiftRelanceOutcome> {
  const link = await prisma.demandeGiftMarque.findUnique({
    where: {
      demandeGiftId_marqueId: {
        demandeGiftId: opts.demandeGiftId,
        marqueId: opts.marqueId,
      },
    },
    include: {
      marque: { select: { nom: true } },
      contact: {
        select: {
          prenom: true,
          nom: true,
          email: true,
          language: true,
        },
      },
      demandeGift: {
        include: {
          talent: { select: { prenom: true, nom: true } },
          accountManager: { select: { id: true, prenom: true, nom: true } },
        },
      },
    },
  });

  if (!link) {
    return {
      demandeGiftId: opts.demandeGiftId,
      marqueId: opts.marqueId,
      marqueNom: "?",
      ok: false,
      error: "Lien introuvable",
    };
  }

  const marqueNom = link.marque.nom;
  const base = {
    demandeGiftId: opts.demandeGiftId,
    marqueId: opts.marqueId,
    marqueNom,
  };

  if (link.demandeGift.archivedAt) {
    return { ...base, ok: false, skipped: "archivée" };
  }
  if (link.relanceCancelledAt) {
    return { ...base, ok: false, skipped: "relance-stoppée" };
  }
  if (link.lastRelanceAt || link.relanceCount > 0) {
    return { ...base, ok: false, skipped: "déjà-relancée" };
  }
  if (
    link.statutContact === "ACCEPTEE" ||
    link.statutContact === "REFUSEE" ||
    link.statutContact === "SANS_REPONSE"
  ) {
    return { ...base, ok: false, skipped: `statut-${link.statutContact}` };
  }

  const senderId =
    link.sentById ||
    link.demandeGift.accountManagerId ||
    link.demandeGift.accountManager?.id ||
    null;
  const fromEmail = await resolveFromEmail(senderId);
  if (!fromEmail) {
    return { ...base, ok: false, error: "Gmail AM non connecté" };
  }

  const email = (
    link.contactEmail ||
    link.contact?.email ||
    ""
  )
    .trim()
    .toLowerCase();
  if (!isUsableEmail(email)) {
    return { ...base, ok: false, error: "Email contact manquant" };
  }

  // Réponse dans le thread → on ne relance pas, on marque SANS_REPONSE? Non:
  // flag via statut si répondu — on passe en SANS_REPONSE seulement si bounce.
  const threadForCheck =
    link.lastThreadId ||
    (link.lastMessageId
      ? (await getGmailMessageMeta(fromEmail, link.lastMessageId)).threadId
      : null) ||
    link.lastMessageId;

  if (threadForCheck) {
    try {
      const activity = await checkThreadActivity(fromEmail, threadForCheck);
      if (activity.replied) {
        await prisma.demandeGiftMarque.update({
          where: {
            demandeGiftId_marqueId: {
              demandeGiftId: opts.demandeGiftId,
              marqueId: opts.marqueId,
            },
          },
          // Pas de statut magique "REPONDUE" — on stoppe juste l'auto via cancel
          data: { relanceCancelledAt: new Date() },
        });
        return { ...base, ok: false, skipped: "réponse-détectée" };
      }
      if (activity.bounced) {
        await prisma.demandeGiftMarque.update({
          where: {
            demandeGiftId_marqueId: {
              demandeGiftId: opts.demandeGiftId,
              marqueId: opts.marqueId,
            },
          },
          data: {
            statutContact: "SANS_REPONSE",
            relanceCancelledAt: new Date(),
          },
        });
        return { ...base, ok: false, skipped: "bounce" };
      }
    } catch (e) {
      console.warn(
        "[gift-auto-relance] checkThreadActivity:",
        e instanceof Error ? e.message : e
      );
    }
  }

  const draftMeta = buildGiftContactDraft(link.demandeGift);
  // Nom expéditeur = personne qui a envoyé / AM lié (pas un autre user)
  const senderUser = senderId
    ? await prisma.user.findUnique({
        where: { id: senderId },
        select: { prenom: true, nom: true },
      })
    : null;
  const senderAmName =
    [senderUser?.prenom, senderUser?.nom].filter(Boolean).join(" ").trim() ||
    draftMeta.amName;
  const language = normalizeContactLanguage(
    link.contactLanguage || link.contact?.language
  );
  const prenom =
    link.contact?.prenom ||
    (link.contactNom || "").trim().split(/\s+/)[0] ||
    null;

  let subject: string;
  let bodyText: string;
  try {
    const ai = await generateGiftRelanceBody({
      language,
      marqueNom,
      talentName: draftMeta.talentName,
      amName: senderAmName,
      contactPrenom: prenom,
      previousSubject: link.lastSubject,
      previousBodyText: link.lastBodyText,
      giftReference: link.demandeGift.reference,
      typeGiftLabel: giftTypeLabel(link.demandeGift.typeGift),
      conceptSnippet: link.demandeGift.description,
    });
    subject = ai.subject;
    bodyText = ai.bodyText;
  } catch (e) {
    console.warn(
      "[gift-auto-relance] IA KO, fallback:",
      e instanceof Error ? e.message : e
    );
    const fb = buildGiftRelanceFallback({
      language,
      marqueNom,
      talentName: draftMeta.talentName,
      contactPrenom: prenom,
      previousSubject: link.lastSubject,
    });
    subject = fb.subject;
    bodyText = fb.bodyText;
  }

  const html = await render(
    React.createElement(GiftContactMarqueEmail, {
      contactPrenom: prenom,
      marqueNom,
      amName: senderAmName,
      talentName: draftMeta.talentName,
      typeGiftLabel: draftMeta.typeGiftLabel,
      reference: link.demandeGift.reference,
      description: link.demandeGift.description,
      contrepartieLabel: draftMeta.contrepartieLabel,
      bodyText,
      isHotel: draftMeta.isHotel,
      hotelDates: draftMeta.hotelDates,
      hotelVille: draftMeta.hotelVille,
      language,
    })
  );

  let threadId = link.lastThreadId || threadForCheck || undefined;
  let inReplyTo: string | undefined;
  if (link.lastMessageId) {
    const meta = await getGmailMessageMeta(fromEmail, link.lastMessageId);
    threadId = meta.threadId || threadId || link.lastMessageId;
    inReplyTo = meta.rfcMessageId || undefined;
  }

  let sentMsg: { id: string; threadId: string };
  try {
    sentMsg = await sendGmailDetailed({
      fromEmail,
      to: email,
      subject,
      htmlBody: html,
      threadId,
      inReplyTo,
    });
  } catch (err) {
    return {
      ...base,
      ok: false,
      error: err instanceof Error ? err.message : "Erreur Gmail",
    };
  }

  const now = new Date();
  await prisma.demandeGiftMarque.update({
    where: {
      demandeGiftId_marqueId: {
        demandeGiftId: opts.demandeGiftId,
        marqueId: opts.marqueId,
      },
    },
    data: {
      statutContact: "RELANCEE",
      lastRelanceAt: now,
      relanceCount: { increment: 1 },
      lastSubject: subject,
      lastBodyText: bodyText,
      lastMessageId: sentMsg.id,
      lastThreadId: sentMsg.threadId,
      contactLanguage: language,
    },
  });

  if (senderId) {
    await prisma.commentaireGift.create({
      data: {
        demandeGiftId: opts.demandeGiftId,
        auteurId: senderId,
        contenu: `[Relance auto J+${GIFT_RELANCE_BUSINESS_DAYS}] ${marqueNom} → ${
          link.contactNom || email
        } <${email}>\nSujet : ${subject}`,
        interne: true,
      },
    });
  }

  return { ...base, ok: true };
}

/** Candidats dus pour le cron (préfiltre calendaire + relanceDue). */
export async function findDueGiftRelances(now: Date = new Date()) {
  const sqlCutoff = new Date(
    now.getTime() - GIFT_RELANCE_BUSINESS_DAYS * 24 * 60 * 60 * 1000
  );

  const raw = await prisma.demandeGiftMarque.findMany({
    where: {
      contactedAt: { lte: sqlCutoff, not: null },
      lastRelanceAt: null,
      relanceCount: 0,
      relanceCancelledAt: null,
      statutContact: { in: ["CONTACTEE"] },
      contactEmail: { not: null },
      demandeGift: { archivedAt: null },
    },
    select: {
      demandeGiftId: true,
      marqueId: true,
      contactedAt: true,
      marque: { select: { nom: true } },
    },
    take: 80,
  });

  return raw.filter(
    (row) =>
      row.contactedAt &&
      relanceDue(
        new Date(row.contactedAt),
        GIFT_RELANCE_BUSINESS_DAYS,
        `${row.demandeGiftId}:${row.marqueId}`,
        now
      )
  );
}
