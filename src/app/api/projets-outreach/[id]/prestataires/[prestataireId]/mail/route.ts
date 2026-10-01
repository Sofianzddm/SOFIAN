import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canEditPrestataireLine,
  canManagePrestatairesOnCampaign,
  canAccessProjetsOutreach,
} from "@/lib/projets-outreach";
import { sendGmail } from "@/lib/gmail";
import { DEFAULT_SENDER_EMAIL } from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string; prestataireId: string }> };

async function loadLink(campaignId: string, linkId: string) {
  return prisma.talentProspectingCampaignPrestataire.findFirst({
    where: { id: linkId, campaignId },
    include: {
      campaign: {
        select: {
          id: true,
          senderEmail: true,
          ownerTmId: true,
          createdById: true,
          title: true,
        },
      },
      prestataireCrm: {
        include: {
          contacts: {
            where: { email: { not: null } },
            orderBy: [{ principal: "desc" }, { createdAt: "asc" }],
          },
        },
      },
    },
  });
}

/** PATCH draft mail fields */
export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessProjetsOutreach(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, prestataireId } = await context.params;
    const campaignId = String(id || "").trim();
    const linkId = String(prestataireId || "").trim();
    const link = await loadLink(campaignId, linkId);
    if (!link) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });

    if (
      !canEditPrestataireLine(
        session.user.role,
        session.user.id,
        link.campaign,
        link.responsableId
      )
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.draftEmailSubject !== undefined) {
      data.draftEmailSubject = String(body.draftEmailSubject || "").trim() || null;
    }
    if (body.draftEmailBody !== undefined) {
      data.draftEmailBody = String(body.draftEmailBody || "").trim() || null;
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucune modification." }, { status: 400 });
    }

    const updated = await prisma.talentProspectingCampaignPrestataire.update({
      where: { id: linkId },
      data,
    });

    return NextResponse.json({
      link: {
        id: updated.id,
        draftEmailSubject: updated.draftEmailSubject,
        draftEmailBody: updated.draftEmailBody,
      },
    });
  } catch (error) {
    console.error("PATCH …/prestataires/[id]/mail:", error);
    return NextResponse.json({ error: "Erreur sauvegarde brouillon" }, { status: 500 });
  }
}

/** POST send emails to selected contacts */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessProjetsOutreach(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id, prestataireId } = await context.params;
    const campaignId = String(id || "").trim();
    const linkId = String(prestataireId || "").trim();
    const link = await loadLink(campaignId, linkId);
    if (!link) return NextResponse.json({ error: "Ligne introuvable." }, { status: 404 });

    if (
      !canEditPrestataireLine(
        session.user.role,
        session.user.id,
        link.campaign,
        link.responsableId
      ) &&
      !canManagePrestatairesOnCampaign(session.user.role, session.user.id, link.campaign)
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      emails?: string[];
      subject?: string;
      bodyHtml?: string;
    };

    const subject =
      String(body.subject || link.draftEmailSubject || "").trim() ||
      `Partenariat — ${link.campaign.title}`;
    const htmlBody = String(body.bodyHtml || link.draftEmailBody || "").trim();
    if (!htmlBody) {
      return NextResponse.json({ error: "Corps du mail vide." }, { status: 400 });
    }

    const crmContacts = link.prestataireCrm?.contacts || [];
    const requested = Array.isArray(body.emails)
      ? body.emails.map((e) => String(e || "").trim().toLowerCase()).filter(Boolean)
      : [];

    let recipients: string[] = [];
    if (requested.length > 0) {
      recipients = requested;
    } else if (crmContacts.length > 0) {
      recipients = crmContacts
        .map((c) => String(c.email || "").trim().toLowerCase())
        .filter(Boolean);
    } else if (link.prestataireCrm?.email) {
      recipients = [link.prestataireCrm.email.trim().toLowerCase()];
    } else if (link.contactInfo && link.contactInfo.includes("@")) {
      recipients = [link.contactInfo.trim().toLowerCase()];
    }

    recipients = Array.from(new Set(recipients));
    if (recipients.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucun email destinataire. Ajoute des contacts dans le CRM prestataire.",
        },
        { status: 400 }
      );
    }

    const fromEmail =
      String(link.campaign.senderEmail || "").trim() || DEFAULT_SENDER_EMAIL;

    const sent: string[] = [];
    const errors: Array<{ email: string; error: string }> = [];

    for (const to of recipients) {
      try {
        await sendGmail({
          fromEmail,
          to,
          subject,
          htmlBody,
        });
        sent.push(to);
      } catch (e) {
        errors.push({
          email: to,
          error: e instanceof Error ? e.message : "Erreur envoi",
        });
      }
    }

    const prevSent = Array.isArray(link.sentToEmails)
      ? (link.sentToEmails as string[])
      : [];
    const allSent = Array.from(new Set([...prevSent, ...sent]));

    await prisma.talentProspectingCampaignPrestataire.update({
      where: { id: linkId },
      data: {
        draftEmailSubject: subject,
        draftEmailBody: htmlBody,
        sentAt: sent.length > 0 ? new Date() : link.sentAt,
        sentToEmails: allSent,
        sendError: errors.length > 0 ? errors.map((e) => `${e.email}: ${e.error}`).join(" | ") : null,
        dernierContactAt: sent.length > 0 ? new Date() : link.dernierContactAt,
        statut:
          sent.length > 0 && link.statut === "A_CONTACTER" ? "EN_COURS" : link.statut,
        canal: sent.length > 0 ? "EMAIL" : link.canal,
      },
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESTATAIRE_UPDATED",
        message: `Mail presta ${link.nom} : ${sent.length} envoyé(s)`,
        payload: { linkId, sent, errors },
      },
    });

    return NextResponse.json({
      ok: sent.length > 0,
      succeeded: sent.length,
      failed: errors.length,
      sent,
      errors,
      fromEmail,
    });
  } catch (error) {
    console.error("POST …/prestataires/[id]/mail:", error);
    return NextResponse.json({ error: "Erreur lors de l’envoi" }, { status: 500 });
  }
}
