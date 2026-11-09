import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getGmailMessageMeta, sendGmailDetailed } from "@/lib/gmail";
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
import { resolveGiftSenderMailbox } from "@/lib/gifts/gift-sender-mailbox";
import { canContactGiftMarques } from "@/lib/gifts/gift-roles";

// POST — relance ciblée (IA par défaut, comme casting) d'une marque déjà contactée
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const user = session.user as { id: string; role: string };
    if (!canContactGiftMarques(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      marqueId?: string;
      subject?: string;
      bodyText?: string;
      html?: string;
      /** true = générer via IA (défaut). false = corps fourni / fallback. */
      ai?: boolean;
    };
    const marqueId = String(body.marqueId || "").trim();
    if (!marqueId) {
      return NextResponse.json({ error: "marqueId requis." }, { status: 400 });
    }

    const mailbox = await resolveGiftSenderMailbox(user.id);
    if (!mailbox?.email) {
      return NextResponse.json(
        {
          error:
            "Aucune boîte Gmail connectée à ton compte. Clique sur « Connecter ma boîte mail ».",
        },
        { status: 400 }
      );
    }

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: { select: { prenom: true, nom: true } },
        accountManager: { select: { prenom: true, nom: true } },
      },
    });
    if (!demande) {
      return NextResponse.json({ error: "Demande non trouvée" }, { status: 404 });
    }
    if (demande.archivedAt) {
      return NextResponse.json(
        { error: "Cette demande est archivée." },
        { status: 400 }
      );
    }

    const link = await prisma.demandeGiftMarque.findUnique({
      where: {
        demandeGiftId_marqueId: { demandeGiftId: id, marqueId },
      },
      include: {
        marque: { select: { nom: true } },
        contact: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            language: true,
          },
        },
      },
    });
    if (!link) {
      return NextResponse.json(
        { error: "Marque non liée à cette demande." },
        { status: 404 }
      );
    }

    const email = (
      link.contactEmail ||
      link.contact?.email ||
      ""
    )
      .trim()
      .toLowerCase();
    if (!isUsableEmail(email)) {
      return NextResponse.json(
        {
          error:
            "Aucun email enregistré pour cette marque. Relancez via le wizard avec un contact enrichi.",
        },
        { status: 400 }
      );
    }

    const draftMeta = buildGiftContactDraft(demande);
    const senderAmName = mailbox.displayName;
    const language = normalizeContactLanguage(
      link.contactLanguage || link.contact?.language
    );
    const prenom =
      link.contact?.prenom ||
      (link.contactNom || "").trim().split(/\s+/)[0] ||
      null;

    let subject = (body.subject || "").trim();
    let bodyText = (body.bodyText || "").trim();
    const useAi = body.ai !== false && (!subject || !bodyText);

    if (useAi) {
      try {
        const ai = await generateGiftRelanceBody({
          language,
          marqueNom: link.marque.nom,
          talentName: draftMeta.talentName,
          amName: senderAmName,
          contactPrenom: prenom,
          previousSubject: link.lastSubject,
          previousBodyText: link.lastBodyText,
          giftReference: demande.reference,
          typeGiftLabel: giftTypeLabel(demande.typeGift),
          conceptSnippet: demande.description,
        });
        if (!subject) subject = ai.subject;
        if (!bodyText) bodyText = ai.bodyText;
      } catch (e) {
        console.warn(
          "[gift-relance] IA KO:",
          e instanceof Error ? e.message : e
        );
        const fb = buildGiftRelanceFallback({
          language,
          marqueNom: link.marque.nom,
          talentName: draftMeta.talentName,
          contactPrenom: prenom,
          previousSubject: link.lastSubject,
        });
        if (!subject) subject = fb.subject;
        if (!bodyText) bodyText = fb.bodyText;
      }
    }

    if (!subject || !bodyText) {
      const fb = buildGiftRelanceFallback({
        language,
        marqueNom: link.marque.nom,
        talentName: draftMeta.talentName,
        contactPrenom: prenom,
        previousSubject: link.lastSubject,
      });
      subject = subject || fb.subject;
      bodyText = bodyText || fb.bodyText;
    }

    const html = await render(
      React.createElement(GiftContactMarqueEmail, {
        contactPrenom: prenom,
        marqueNom: link.marque.nom,
        amName: senderAmName,
        talentName: draftMeta.talentName,
        typeGiftLabel: draftMeta.typeGiftLabel,
        reference: demande.reference,
        description: demande.description,
        contrepartieLabel: draftMeta.contrepartieLabel,
        bodyText,
        isHotel: draftMeta.isHotel,
        hotelDates: draftMeta.hotelDates,
        hotelVille: draftMeta.hotelVille,
        language,
      })
    );

    // Fil Gmail : threadId API + Message-ID RFC822 (In-Reply-To) — jamais l'id API en In-Reply-To
    let threadId = link.lastThreadId || undefined;
    let inReplyTo: string | undefined;
    if (link.lastMessageId) {
      const meta = await getGmailMessageMeta(mailbox.email, link.lastMessageId);
      threadId = meta.threadId || threadId || link.lastMessageId;
      inReplyTo = meta.rfcMessageId || undefined;
    }

    let sentMsg: { id: string; threadId: string };
    try {
      sentMsg = await sendGmailDetailed({
        fromEmail: mailbox.email,
        to: email,
        subject,
        htmlBody: html,
        threadId,
        inReplyTo,
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Erreur Gmail";
      return NextResponse.json({ error: msg }, { status: 502 });
    }

    const now = new Date();
    await prisma.demandeGiftMarque.update({
      where: {
        demandeGiftId_marqueId: { demandeGiftId: id, marqueId },
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
        sentById: user.id,
        // Relance manuelle = on considère le round auto consommé
        relanceCancelledAt: link.relanceCancelledAt || now,
      },
    });

    await prisma.commentaireGift.create({
      data: {
        demandeGiftId: id,
        auteurId: user.id,
        contenu: `[Relance marque] ${link.marque.nom} → ${
          link.contactNom || email
        } <${email}>\nSujet : ${subject}`,
        interne: true,
      },
    });

    return NextResponse.json({
      ok: true,
      messageId: sentMsg.id,
      threadId: sentMsg.threadId,
      statutContact: "RELANCEE",
      language,
      subject,
    });
  } catch (error) {
    console.error("POST /api/gifts/[id]/contact-marques/relance:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
