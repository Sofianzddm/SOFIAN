import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { sendGmail } from "@/lib/gmail";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";
import { normalizeEditorHtmlForEmail, plainTextToEmailHtml } from "@/lib/email-body-html";
import { applyProjetVars, projetOppMailContacts, type ProjetEmailThread } from "@/lib/projet-prospection";
import { FW_PROJET_SLUG, injectFwTracking } from "@/lib/fw-prospection";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";
import { requireFwAccess } from "../../../_auth";

/**
 * Envoi du mail de prospection FW depuis la boîte du projet fashion-week
 * (ines@glowupagence.fr). ADMIN + STRATEGY_PLANNER. 1 thread Gmail / contact.
 */

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      bodyHtml?: string;
      bodyText?: string;
    };
    const subject = (body.subject || "").trim();
    const htmlBody = body.bodyHtml
      ? normalizeEditorHtmlForEmail(body.bodyHtml)
      : plainTextToEmailHtml(body.bodyText || "");
    const hasText = htmlBody.replace(/<[^>]*>/g, "").trim().length > 0;
    if (!subject || !hasText) {
      return NextResponse.json({ error: "Sujet et corps du mail requis." }, { status: 400 });
    }

    const client = await prisma.fwClient.findUnique({
      where: { id },
      include: { contacts: true },
    });
    if (!client) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    const mailContacts = projetOppMailContacts(client.contacts);
    if (mailContacts.length === 0) {
      return NextResponse.json(
        { error: "Aucun email noté sur ce client. Sofian doit d'abord noter les mails." },
        { status: 400 }
      );
    }

    const projet = await getOrCreateVillaProject(FW_PROJET_SLUG);
    const fromEmail = (projet.senderEmail || "").trim().toLowerCase() || LEYNA_FROM_EMAIL;
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

    const threads: ProjetEmailThread[] = [];
    const errors: string[] = [];
    for (const contact of mailContacts) {
      const vars = {
        prenom: contact.firstName,
        nom: contact.lastName,
        marque: client.nom,
      };
      try {
        const messageId = await sendGmail({
          fromEmail,
          to: contact.email,
          subject: applyProjetVars(subject, vars),
          htmlBody: injectFwTracking(applyProjetVars(htmlBody, vars), client.id),
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

    const nextStatut =
      client.statut === "ATTENTE_EMAILS" || client.statut === "PRET" ? "ENVOYE" : client.statut;

    const updated = await prisma.fwClient.update({
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
        statut: nextStatut,
      },
    });

    console.info(
      `[strategy/fw/send-email] ${client.nom} → ${threads.length}/${mailContacts.length} contacts depuis ${fromEmail}`
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
    console.error("POST /api/strategy/fw/clients/[id]/send-email:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
