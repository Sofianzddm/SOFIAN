import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { notifyMarqueCompletionRequested } from "@/lib/emails/notify-enrichissement";
import { isProjetsOutreachRole } from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string }> };

/**
 * POST → demande de complétion d'une fiche marque déjà liée au projet.
 * - Met la mission « en attente contacts » (bloque la rédaction)
 * - Notifie tous les ADMIN (email + notif in-app)
 * - N'crée jamais de nouvelle marque
 *
 * Body: { marqueId: string, missionId: string, note?: string }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const body = (await request.json().catch(() => ({}))) as {
      marqueId?: string;
      missionId?: string;
      note?: string;
    };
    const marqueId = String(body.marqueId || "").trim();
    const missionId = String(body.missionId || "").trim();
    const note = String(body.note || "").trim().slice(0, 500) || null;

    if (!marqueId || !missionId) {
      return NextResponse.json(
        { error: "marqueId et missionId requis." },
        { status: 400 }
      );
    }

    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      include: {
        talent: { select: { prenom: true, nom: true } },
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }

    const mission = await prisma.contactMission.findFirst({
      where: { id: missionId, campaignId, marqueId },
      select: { id: true },
    });
    if (!mission) {
      return NextResponse.json(
        { error: "Cette marque n'est pas dans le projet." },
        { status: 400 }
      );
    }

    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: {
        id: true,
        nom: true,
        contacts: {
          where: { outreachExcluded: false },
          select: { email: true, emailSuggested: true },
        },
      },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
    }

    const emailableCount = marque.contacts.filter((c) => {
      const email = (c.email || c.emailSuggested || "").trim();
      return email.includes("@");
    }).length;

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", actif: true },
      select: { id: true, email: true },
    });
    const adminEmails = admins.map((a) => a.email).filter(Boolean);

    await prisma.contactMission.update({
      where: { id: missionId },
      data: {
        awaitingContactsCompletion: true,
        contactsCompletionRequestedAt: new Date(),
      },
    });

    const requestedByName =
      session.user.name?.trim() || session.user.email || "Quelqu’un";
    const talentName =
      `${campaign.talent?.prenom || ""} ${campaign.talent?.nom || ""}`.trim() || "Talent";

    const mail = await notifyMarqueCompletionRequested({
      marqueId: marque.id,
      marqueName: marque.nom,
      campaignId,
      campaignTitle: campaign.title,
      talentName,
      requestedByName,
      contactCount: emailableCount,
      note,
      toEmails: adminEmails,
    });

    const projetLien = `/projets-outreach/${campaignId}`;
    await Promise.all(
      admins.map((admin) =>
        prisma.notification.create({
          data: {
            userId: admin.id,
            type: "GENERAL",
            titre: `Compléter ${marque.nom}`,
            message: `${requestedByName} demande de compléter la fiche ${marque.nom} (projet « ${campaign.title} »). Rédaction bloquée.`,
            lien: projetLien,
          },
        })
      )
    );

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        type: "MARQUE_COMPLETION_REQUESTED",
        message: `${marque.nom} mise en attente de contacts — rédaction bloquée`,
        payload: {
          marqueId: marque.id,
          marqueName: marque.nom,
          contactCount: emailableCount,
          note,
          notifiedTo: mail.to,
          mailSent: mail.sent,
          missionId,
        },
        actorId: session.user.id,
      },
    });

    if (!mail.sent) {
      return NextResponse.json(
        {
          error:
            "Marque mise en attente, mais l'email aux admins n'a pas pu partir (RESEND_API_KEY / aucun admin ?).",
          marqueId: marque.id,
          notifiedTo: mail.to,
          awaitingContactsCompletion: true,
        },
        { status: 502 }
      );
    }

    return NextResponse.json({
      ok: true,
      marqueId: marque.id,
      marqueName: marque.nom,
      contactCount: emailableCount,
      notifiedTo: mail.to,
      awaitingContactsCompletion: true,
      message: `${marque.nom} en attente — ${mail.to.length} admin(s) notifié(s). Rédaction bloquée jusqu’à « Contacts prêts ».`,
    });
  } catch (error) {
    console.error("POST /api/projets-outreach/[id]/request-marque-completion:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
