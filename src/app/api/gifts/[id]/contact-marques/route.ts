import React from "react";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { sendGmailDetailed } from "@/lib/gmail";
import { render } from "@react-email/render";
import { GiftContactMarqueEmail } from "@/emails/GiftContactMarqueEmail";
import {
  buildGiftContactDraft,
  isUsableEmail,
} from "@/lib/gifts/contact-marque-draft";
import {
  detectGiftMailLanguage,
  normalizeContactLanguage,
} from "@/lib/gifts/contact-language";
import { translateEmail, TranslateEmailError } from "@/lib/translate-email";
import {
  getDestinatairesNotification,
  talentAccessForGiftSelect,
} from "@/lib/delegations";
import { resolveGiftSenderMailbox } from "@/lib/gifts/gift-sender-mailbox";
import { canContactGiftMarques } from "@/lib/gifts/gift-roles";

// GET — draft + boîte Gmail AM
export async function GET(
  _req: NextRequest,
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

    const draft = buildGiftContactDraft(demande);
    const mailbox = await resolveGiftSenderMailbox(user.id);

    return NextResponse.json({
      draft: {
        subject: draft.subject,
        bodyText: draft.bodyText,
      },
      fromEmail: mailbox?.email || null,
      fromName: mailbox?.displayName || null,
      senderPrenom: mailbox?.prenom || null,
      gmailConnected: Boolean(mailbox?.email),
    });
  } catch (error) {
    console.error("GET /api/gifts/[id]/contact-marques:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

type RecipientInput = {
  marqueId: string;
  contactId?: string | null;
  email?: string;
  nom?: string;
};

// POST — envoi Gmail aux destinataires cochés
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
    const user = session.user as { id: string; role: string; prenom?: string; nom?: string };
    if (!canContactGiftMarques(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      recipients?: RecipientInput[];
      subject?: string;
      bodyText?: string;
      html?: string;
      /** Sujet/corps personnalisés par marque (pipeline). */
      draftsByMarque?: Record<
        string,
        { subject?: string; bodyText?: string }
      >;
    };

    const recipients = Array.isArray(body.recipients) ? body.recipients : [];
    const defaultSubject = (body.subject || "").trim();
    const defaultBodyText = (body.bodyText || "").trim();
    const draftsByMarque =
      body.draftsByMarque && typeof body.draftsByMarque === "object"
        ? body.draftsByMarque
        : {};
    if (recipients.length === 0) {
      return NextResponse.json(
        { error: "Aucun destinataire sélectionné." },
        { status: 400 }
      );
    }
    const hasPerMarqueDraft = recipients.some((r) => {
      const d = draftsByMarque[String(r.marqueId || "")];
      return Boolean(d?.subject?.trim() && d?.bodyText?.trim());
    });
    if (!hasPerMarqueDraft && (!defaultSubject || !defaultBodyText)) {
      return NextResponse.json(
        { error: "Sujet et message requis." },
        { status: 400 }
      );
    }

    // Toujours la boîte de la personne connectée (Ambre → Ambre, jamais Sofian)
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
    const fromEmail = mailbox.email;
    const senderAmName = mailbox.displayName;

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
            ...talentAccessForGiftSelect,
          },
        },
        accountManager: { select: { prenom: true, nom: true } },
        tm: { select: { id: true, email: true, prenom: true, nom: true } },
        marques: { select: { marqueId: true } },
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

    const linkedMarqueIds = new Set(demande.marques.map((m) => m.marqueId));
    if (demande.marqueId) linkedMarqueIds.add(demande.marqueId);

    // Valider chaque destinataire : marque liée + contact CRM avec email réel
    const validated: Array<{
      marqueId: string;
      marqueNom: string;
      contactId: string;
      contactNom: string;
      contactPrenom: string | null;
      email: string;
      language: "fr" | "en";
    }> = [];

    for (const raw of recipients) {
      const marqueId = String(raw.marqueId || "").trim();
      const contactId = String(raw.contactId || "").trim();
      if (!marqueId || !contactId) {
        return NextResponse.json(
          { error: "Chaque destinataire doit avoir une marque et un contact CRM." },
          { status: 400 }
        );
      }
      if (!linkedMarqueIds.has(marqueId)) {
        return NextResponse.json(
          { error: `Marque non liée à cette demande (${marqueId}).` },
          { status: 400 }
        );
      }

      const contact = await prisma.marqueContact.findFirst({
        where: {
          id: contactId,
          marqueId,
          outreachExcluded: false,
          diffusionOptOut: false,
          OR: [{ source: null }, { source: { not: "AO" } }],
        },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          language: true,
          source: true,
          marque: { select: { nom: true } },
        },
      });
      if (!contact) {
        return NextResponse.json(
          {
            error:
              "Contact introuvable, exclu (Achats/AO), ou non rattaché à la marque.",
          },
          { status: 400 }
        );
      }
      const email = (contact.email || "").trim().toLowerCase();
      if (!isUsableEmail(email)) {
        return NextResponse.json(
          {
            error: `Le contact ${[contact.prenom, contact.nom].filter(Boolean).join(" ")} n'a pas d'email enrichi. Enrichissez-le avant d'envoyer.`,
          },
          { status: 400 }
        );
      }

      validated.push({
        marqueId,
        marqueNom: contact.marque.nom,
        contactId: contact.id,
        contactNom: [contact.prenom, contact.nom].filter(Boolean).join(" "),
        contactPrenom: contact.prenom,
        email,
        language: normalizeContactLanguage(contact.language),
      });
    }

    const draftMeta = buildGiftContactDraft(demande);

    const sent: Array<{
      marqueId: string;
      contactId: string;
      email: string;
      messageId: string;
      threadId: string;
    }> = [];
    const errors: string[] = [];

    // Grouper par marque pour maj DemandeGiftMarque (1er contact = snapshot)
    const byMarque = new Map<string, typeof validated>();
    for (const r of validated) {
      const list = byMarque.get(r.marqueId) || [];
      list.push(r);
      byMarque.set(r.marqueId, list);
    }

    /** Versions traduites mises en cache (clé = `${marqueId}:${lang}`). */
    const translatedCache = new Map<
      string,
      { subject: string; bodyText: string }
    >();

    const sentDetailed: Array<{
      marqueId: string;
      contactId: string;
      email: string;
      messageId: string;
      threadId: string;
      subject: string;
      bodyText: string;
      language: "fr" | "en";
    }> = [];

    let sendIndex = 0;
    for (const r of validated) {
      const per = draftsByMarque[r.marqueId];
      let subject = (per?.subject || defaultSubject).trim();
      let bodyText = (per?.bodyText || defaultBodyText).trim();
      if (!subject || !bodyText) {
        errors.push(`${r.email} : sujet/corps manquant pour ${r.marqueNom}`);
        continue;
      }

      const draftLang = detectGiftMailLanguage(subject, bodyText);
      if (draftLang !== r.language) {
        const cacheKey = `${r.marqueId}:${r.language}`;
        const cached = translatedCache.get(cacheKey);
        if (cached) {
          subject = cached.subject;
          bodyText = cached.bodyText;
        } else {
          try {
            const tr = await translateEmail({
              subject,
              bodyHtml: bodyText,
              targetLanguage: r.language,
            });
            subject = tr.subject || subject;
            bodyText = tr.body || bodyText;
            translatedCache.set(cacheKey, { subject, bodyText });
          } catch (e) {
            if (!(e instanceof TranslateEmailError)) throw e;
            console.warn(
              `[gift-send] traduction ${r.language} KO pour ${r.marqueNom}:`,
              e.message
            );
          }
        }
      }

      try {
        const html = await render(
          React.createElement(GiftContactMarqueEmail, {
            contactPrenom: r.contactPrenom,
            marqueNom: r.marqueNom,
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
            language: r.language,
          })
        );
        // Anti-rafale : petit écart entre destinataires (deliverability)
        if (sendIndex > 0) {
          await new Promise((resolve) => setTimeout(resolve, 900));
        }
        sendIndex += 1;

        const sentMsg = await sendGmailDetailed({
          fromEmail,
          to: r.email,
          subject,
          htmlBody: html,
        });
        sent.push({
          marqueId: r.marqueId,
          contactId: r.contactId,
          email: r.email,
          messageId: sentMsg.id,
          threadId: sentMsg.threadId,
        });
        sentDetailed.push({
          marqueId: r.marqueId,
          contactId: r.contactId,
          email: r.email,
          messageId: sentMsg.id,
          threadId: sentMsg.threadId,
          subject,
          bodyText,
          language: r.language,
        });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "Erreur Gmail";
        errors.push(`${r.email} : ${msg}`);
      }
    }

    if (sent.length === 0) {
      return NextResponse.json(
        { error: `Échec d'envoi : ${errors.join(" / ")}` },
        { status: 502 }
      );
    }

    const now = new Date();
    const firstContactEver = !demande.dateContactMarque;

    for (const [marqueId, list] of byMarque) {
      const sentForMarque = sent.filter((s) => s.marqueId === marqueId);
      if (sentForMarque.length === 0) continue;
      const primary =
        list.find((l) => l.contactId === sentForMarque[0].contactId) || list[0];
      const primaryMessage = sentForMarque[0];
      const detailed =
        sentDetailed.find(
          (s) =>
            s.marqueId === marqueId && s.contactId === primaryMessage.contactId
        ) || sentDetailed.find((s) => s.marqueId === marqueId);
      const snapSubject =
        detailed?.subject ||
        (draftsByMarque[marqueId]?.subject || defaultSubject).trim() ||
        defaultSubject;
      const snapBody =
        detailed?.bodyText ||
        (draftsByMarque[marqueId]?.bodyText || defaultBodyText).trim() ||
        defaultBodyText;
      const snapLang = detailed?.language || primary.language;

      // S'assurer que la liaison existe (legacy marqueId seul)
      await prisma.demandeGiftMarque.upsert({
        where: {
          demandeGiftId_marqueId: { demandeGiftId: id, marqueId },
        },
        create: {
          demandeGiftId: id,
          marqueId,
          statutContact: "CONTACTEE",
          contactId: primary.contactId,
          contactNom: primary.contactNom,
          contactEmail: primary.email,
          contactedAt: now,
          lastSubject: snapSubject,
          lastBodyText: snapBody,
          lastMessageId: primaryMessage.messageId,
          lastThreadId: primaryMessage.threadId,
          contactLanguage: snapLang,
          sentById: user.id,
          relanceCancelledAt: null,
          lastRelanceAt: null,
          relanceCount: 0,
        },
        update: {
          statutContact: "CONTACTEE",
          contactId: primary.contactId,
          contactNom: primary.contactNom,
          contactEmail: primary.email,
          contactedAt: now,
          lastSubject: snapSubject,
          lastBodyText: snapBody,
          lastMessageId: primaryMessage.messageId,
          lastThreadId: primaryMessage.threadId,
          contactLanguage: snapLang,
          sentById: user.id,
          // Nouvel envoi → réarme la relance auto J+2
          relanceCancelledAt: null,
          lastRelanceAt: null,
          relanceCount: 0,
        },
      });
    }

    const giftUpdate: {
      dateContactMarque?: Date;
      statut?: "ATTENTE_MARQUE";
      accountManagerId?: string;
    } = {};
    if (firstContactEver) {
      giftUpdate.dateContactMarque = now;
    }
    if (
      demande.statut === "EN_ATTENTE" ||
      demande.statut === "EN_COURS" ||
      demande.statut === "BROUILLON"
    ) {
      giftUpdate.statut = "ATTENTE_MARQUE";
    }
    if (!demande.accountManagerId) {
      giftUpdate.accountManagerId = user.id;
    }
    if (Object.keys(giftUpdate).length > 0) {
      await prisma.demandeGift.update({
        where: { id },
        data: giftUpdate,
      });
    }

    const destinatairesLabel = sent
      .map((s) => {
        const v = validated.find(
          (x) => x.contactId === s.contactId && x.marqueId === s.marqueId
        );
        return `${v?.marqueNom || "Marque"} → ${v?.contactNom || s.email} <${s.email}>`;
      })
      .join("\n");

    await prisma.commentaireGift.create({
      data: {
        demandeGiftId: id,
        auteurId: user.id,
        contenu: `[Contact marques]\nSujet : ${defaultSubject || "(personnalisé par marque)"}\n\n${destinatairesLabel}${
          errors.length ? `\n\nÉchecs : ${errors.join(" / ")}` : ""
        }`,
        interne: true,
      },
    });

    // Notif TM (même pattern que changement de statut)
    try {
      if (
        (giftUpdate.statut === "ATTENTE_MARQUE" || firstContactEver) &&
        demande.talentId
      ) {
        const destinataires = (
          await getDestinatairesNotification(demande.talentId)
        ).filter((destId) => destId !== user.id);
        const messageTM = `Un Account Manager a contacté la marque pour ${demande.reference}`;
        await Promise.all(
          destinataires.map((userId) =>
            prisma.notification.create({
              data: {
                userId,
                type: "GENERAL",
                titre: "Mise à jour de ta demande de gift",
                message: messageTM,
                lien: `/gifts/${id}`,
                actorId: user.id,
                talentId: demande.talentId,
              },
            })
          )
        );
      }
    } catch (notifErr) {
      console.error("Notif contact marques gift:", notifErr);
    }

    return NextResponse.json({
      ok: true,
      sent: sent.length,
      failed: errors.length,
      errors,
      statut: giftUpdate.statut || demande.statut,
    });
  } catch (error) {
    console.error("POST /api/gifts/[id]/contact-marques:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
