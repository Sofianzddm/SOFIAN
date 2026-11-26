import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail } from "@/lib/gmail";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";
import {
  normalizeEditorHtmlForEmail,
  plainTextToEmailHtml,
} from "@/lib/email-body-html";
import {
  applyProjetVars,
  injectProjetTracking,
  projetOppMailContacts,
  type ProjetEmailThread,
} from "@/lib/projet-prospection";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { resolveGiftSenderMailbox } from "@/lib/gifts/gift-sender-mailbox";

/**
 * Envoi prospection Cannes Partenaires — même mécanique que strategy/send-email,
 * borné au projet cannes-partenaires.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
      /** Boîte choisie dans l'UI Cannes (Inès, etc.). */
      fromEmail?: string | null;
      /** Sous-ensemble cochés dans CastingComposer (emails). */
      recipients?: Array<{
        email?: string;
        firstname?: string;
        firstName?: string;
        lastname?: string;
        lastName?: string;
      }>;
    };
    const subject = (body.subject || "").trim();
    const htmlBody = body.bodyHtml
      ? normalizeEditorHtmlForEmail(body.bodyHtml)
      : plainTextToEmailHtml(body.bodyText || "");
    const hasText = htmlBody.replace(/<[^>]*>/g, "").trim().length > 0;
    if (!subject || !hasText) {
      return NextResponse.json(
        { error: "Sujet et corps du mail requis." },
        { status: 400 }
      );
    }

    const opportunite = await prisma.opportuniteMarque.findFirst({
      where: { id, projet: { slug: CANNES_PARTENAIRES_SLUG } },
      include: { projet: { select: { senderEmail: true, slug: true } } },
    });
    if (!opportunite) {
      return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
    }

    let mailContacts = projetOppMailContacts(opportunite.contacts);

    // Destinataires cochés dans le composer (prioritaires)
    if (Array.isArray(body.recipients) && body.recipients.length > 0) {
      const picked = body.recipients
        .map((r) => ({
          email: String(r.email || "")
            .trim()
            .toLowerCase(),
          firstName: String(r.firstname || r.firstName || "").trim(),
          lastName: String(r.lastname || r.lastName || "").trim(),
        }))
        .filter((r) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(r.email));
      if (picked.length > 0) mailContacts = picked;
    }

    // Fallback table cannes_contacts
    if (mailContacts.length === 0) {
      const crm = await prisma.cannesPartenairesContact.findMany({
        where: {
          opportuniteId: opportunite.id,
          email: { not: null },
        },
        select: { prenom: true, nom: true, email: true },
      });
      mailContacts = projetOppMailContacts(
        crm.map((c) => ({
          firstName: c.prenom,
          lastName: c.nom,
          email: c.email,
        }))
      );
    }

    if (mailContacts.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucun contact avec email valide. Qualifie d'abord les contacts (carto / fiche marque).",
        },
        { status: 400 }
      );
    }

    const requestedFrom = (body.fromEmail || "").trim().toLowerCase();
    const projetFrom = (opportunite.projet?.senderEmail || "")
      .trim()
      .toLowerCase();
    const userMailbox = session.user.id
      ? await resolveGiftSenderMailbox(session.user.id)
      : null;
    const userFrom = (userMailbox?.email || "").trim().toLowerCase();

    // Priorité : override UI → boîte projet (Inès) → boîte user connecté → Leyna
    const candidates = [requestedFrom, projetFrom, userFrom, LEYNA_FROM_EMAIL]
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.includes("@"));

    let fromEmail: string | null = null;
    for (const email of candidates) {
      const token = await prisma.gmailToken.findUnique({
        where: { email },
        select: { id: true },
      });
      if (token) {
        fromEmail = email;
        break;
      }
    }

    if (!fromEmail) {
      return NextResponse.json(
        {
          error:
            "Aucune boîte d'envoi connectée. Branche ta Gmail dans Réglages → Gmail (ex. ines@glowupagence.fr), puis choisis-la ici.",
        },
        { status: 400 }
      );
    }

    const threads: ProjetEmailThread[] = [];
    const errors: string[] = [];
    for (const contact of mailContacts) {
      const vars = {
        prenom: contact.firstName,
        nom: contact.lastName,
        marque: opportunite.nomMarque,
      };
      try {
        const messageId = await sendGmail({
          fromEmail,
          to: contact.email,
          subject: applyProjetVars(subject, vars),
          htmlBody: injectProjetTracking(
            applyProjetVars(htmlBody, vars),
            opportunite.id
          ),
        });
        threads.push({
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          threadId: messageId,
          repliedAt: null,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erreur Gmail";
        errors.push(`${contact.email} : ${msg}`);
      }
    }

    if (threads.length === 0) {
      return NextResponse.json(
        { error: `Échec Gmail : ${errors.join(" / ")}` },
        { status: 502 }
      );
    }

    const updated = await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        lastEmailSentAt: new Date(),
        lastEmailFrom: fromEmail,
        lastEmailThreadId: threads[0].threadId,
        emailThreads: threads,
        emailSubject: subject,
        emailOpenedAt: null,
        emailOpenCount: 0,
        emailRepliedAt: null,
        relanceSentAt: null,
        relanceError: errors.length > 0 ? errors.join(" / ") : null,
        ...(opportunite.statut === "IDENTIFIEE" ||
        opportunite.statut === "A_QUALIFIER"
          ? { statut: "CONTACTEE" }
          : {}),
      },
    });

    return NextResponse.json({
      ok: true,
      fromEmail,
      recipients: threads.map((t) => t.email),
      failed: errors,
      statut: updated.statut,
      sentAt: updated.lastEmailSentAt,
    });
  } catch (error) {
    console.error("POST /api/cannes-partenaires/.../send-email:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
