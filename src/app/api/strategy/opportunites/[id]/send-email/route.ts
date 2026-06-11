import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { sendGmail } from "@/lib/gmail";
import { LEYNA_FROM_EMAIL } from "@/lib/casting-auto-send";
import { normalizeEditorHtmlForEmail, plainTextToEmailHtml } from "@/lib/email-body-html";
import { injectProjetTracking } from "@/lib/projet-prospection";

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

    const contacts = Array.isArray(opportunite.contacts)
      ? (opportunite.contacts as Array<{ email?: string }>)
      : [];
    const recipients = Array.from(
      new Set(
        contacts
          .map((c) => String(c?.email || "").trim().toLowerCase())
          .filter((e) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e))
      )
    );
    if (recipients.length === 0) {
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

    let messageId: string;
    try {
      messageId = await sendGmail({
        fromEmail,
        to: recipients.join(", "),
        subject,
        htmlBody: injectProjetTracking(htmlBody, opportunite.id),
      });
    } catch (error) {
      const msg = error instanceof Error ? error.message : "Erreur Gmail inconnue";
      return NextResponse.json({ error: `Échec Gmail : ${msg}` }, { status: 502 });
    }

    const updated = await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        lastEmailSentAt: new Date(),
        lastEmailFrom: fromEmail,
        lastEmailThreadId: messageId,
        emailSubject: subject,
        // Nouveau mail = nouveau suivi (ouvertures, réponse, relance)
        emailOpenedAt: null,
        emailOpenCount: 0,
        emailRepliedAt: null,
        relanceSentAt: null,
        relanceError: null,
        // On ne rétrograde pas une négo déjà avancée
        ...(opportunite.statut === "IDENTIFIEE" ? { statut: "CONTACTEE" } : {}),
      },
    });

    console.info(
      `[strategy/send-email] ${opportunite.nomMarque} (${opportunite.projet?.slug}) → ${recipients.join(", ")} depuis ${fromEmail}`
    );

    return NextResponse.json({
      ok: true,
      fromEmail,
      recipients,
      statut: updated.statut,
      sentAt: updated.lastEmailSentAt,
    });
  } catch (error) {
    console.error("POST /api/strategy/opportunites/[id]/send-email:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
