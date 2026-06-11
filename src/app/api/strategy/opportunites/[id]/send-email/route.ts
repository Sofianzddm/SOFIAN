import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail } from "@/lib/gmail";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";
import { normalizeEditorHtmlForEmail, plainTextToEmailHtml } from "@/lib/email-body-html";
import {
  applyProjetVars,
  injectProjetTracking,
  projetOppMailContacts,
  type ProjetEmailThread,
} from "@/lib/projet-prospection";

/**
 * Envoi du mail de prospection d'une opportunité marque, depuis la boîte
 * d'envoi du PROJET (ProjetEvenement.senderEmail, ex : Ski Trip → Ines),
 * défaut leyna@glowupagence.fr. ADMIN + STRATEGY_PLANNER (la strategy planner
 * pilote la prospection de ses projets). Après envoi : statut IDENTIFIEE → CONTACTEE.
 *
 * Le mail embarque le tracking (pixel d'ouverture + liens réécrits) et le
 * cron quotidien gère la relance auto J+3 ouvrés + la détection de réponse.
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
    const role = session.user.role || "";
    if (role !== "ADMIN" && role !== "STRATEGY_PLANNER") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
    };
    const subject = (body.subject || "").trim();
    // bodyHtml = HTML de l'éditeur riche (normalisé pour Gmail) ;
    // bodyText accepté en fallback (texte brut).
    const htmlBody = body.bodyHtml
      ? normalizeEditorHtmlForEmail(body.bodyHtml)
      : plainTextToEmailHtml(body.bodyText || "");
    const hasText = htmlBody.replace(/<[^>]*>/g, "").trim().length > 0;
    if (!subject || !hasText) {
      return NextResponse.json({ error: "Sujet et corps du mail requis." }, { status: 400 });
    }

    const opportunite = await prisma.opportuniteMarque.findUnique({
      where: { id },
      include: { projet: { select: { senderEmail: true, slug: true } } },
    });
    if (!opportunite) {
      return NextResponse.json({ error: "Opportunité introuvable." }, { status: 404 });
    }

    const mailContacts = projetOppMailContacts(opportunite.contacts);
    if (mailContacts.length === 0) {
      return NextResponse.json(
        { error: "Aucun contact avec email valide sur cette marque. Qualifie d'abord les contacts." },
        { status: 400 }
      );
    }

    const fromEmail = (opportunite.projet?.senderEmail || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
    const token = await prisma.gmailToken.findUnique({
      where: { email: fromEmail },
      select: { id: true },
    });
    if (!token) {
      return NextResponse.json(
        {
          error: `La boîte d'envoi du projet (${fromEmail}) n'est pas connectée. Connecte-la dans Réglages → Gmail.`,
        },
        { status: 400 }
      );
    }

    // Envoi individualisé : 1 mail (et 1 thread Gmail) par contact, avec les
    // variables {{prenom}} / {{nom}} / {{marque}} remplacées pour chacun.
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
          htmlBody: injectProjetTracking(applyProjetVars(htmlBody, vars), opportunite.id),
        });
        threads.push({
          email: contact.email,
          firstName: contact.firstName,
          lastName: contact.lastName,
          threadId: messageId,
          repliedAt: null,
        });
      } catch (error) {
        const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
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
        // Nouveau mail = nouveau suivi (ouvertures, réponse, relance)
        emailOpenedAt: null,
        emailOpenCount: 0,
        emailRepliedAt: null,
        relanceSentAt: null,
        relanceError: errors.length > 0 ? errors.join(" / ") : null,
        // On ne rétrograde pas une négo déjà avancée
        ...(opportunite.statut === "IDENTIFIEE" ? { statut: "CONTACTEE" } : {}),
      },
    });

    console.info(
      `[strategy/send-email] ${opportunite.nomMarque} (${opportunite.projet?.slug}) → ${threads.length}/${mailContacts.length} contacts depuis ${fromEmail}`
    );

    return NextResponse.json({
      ok: true,
      fromEmail,
      recipients: threads.map((t) => t.email),
      failed: errors,
      statut: updated.statut,
      sentAt: updated.lastEmailSentAt,
    });
  } catch (error) {
    console.error("POST /api/strategy/opportunites/[id]/send-email:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
