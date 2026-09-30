import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { notifyMarqueCompletionRequested } from "@/lib/emails/notify-enrichissement";

/**
 * POST — met une mission (pipeline ou projet) en file « Marques en attente
 * d'enrichissement » (/enrichissement?tab=attente).
 *
 * Body optionnel: { note?: string }
 */
const ALLOWED = ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "CASTING_MANAGER"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED.includes((session.user.role || "") as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: missionId } = await params;
    const body = (await request.json().catch(() => ({}))) as { note?: string };
    const note = String(body.note || "").trim().slice(0, 500) || null;

    const mission = await prisma.contactMission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        targetBrand: true,
        marqueId: true,
        campaignId: true,
        awaitingContactsCompletion: true,
        creatorName: true,
        marque: {
          select: {
            id: true,
            nom: true,
            contacts: {
              where: { outreachExcluded: false, diffusionOptOut: false },
              select: { email: true, emailSuggested: true },
            },
          },
        },
        campaign: {
          select: {
            id: true,
            title: true,
            talent: { select: { prenom: true, nom: true } },
          },
        },
        talent: { select: { prenom: true, nom: true } },
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Mission introuvable." }, { status: 404 });
    }

    const brandName = mission.marque?.nom || mission.targetBrand;
    const emailableCount = (mission.marque?.contacts ?? []).filter((c) => {
      const email = (c.email || c.emailSuggested || "").trim();
      return email.includes("@");
    }).length;

    await prisma.contactMission.update({
      where: { id: missionId },
      data: {
        awaitingContactsCompletion: true,
        contactsCompletionRequestedAt: new Date(),
      },
    });

    const requestedByName =
      session.user.name?.trim() || session.user.email || "Quelqu’un";
    const talentFromCampaign = mission.campaign?.talent;
    const talentFromSolo = mission.talent;
    const talentName = talentFromCampaign
      ? `${talentFromCampaign.prenom || ""} ${talentFromCampaign.nom || ""}`.trim()
      : talentFromSolo
        ? `${talentFromSolo.prenom || ""} ${talentFromSolo.nom || ""}`.trim()
        : mission.creatorName || "Talent";
    const contextLabel = mission.campaign
      ? `projet « ${mission.campaign.title} »`
      : "Pipeline Casting";

    const admins = await prisma.user.findMany({
      where: { role: "ADMIN", actif: true },
      select: { id: true, email: true },
    });
    const castingManagers = await prisma.user.findMany({
      where: { role: "CASTING_MANAGER", actif: true },
      select: { id: true },
    });
    const notifyUsers = [
      ...admins,
      ...castingManagers.filter((u) => !admins.some((a) => a.id === u.id)),
    ];
    const enrichLien = "/enrichissement?tab=attente";

    if (mission.marqueId && mission.campaignId && mission.campaign) {
      await notifyMarqueCompletionRequested({
        marqueId: mission.marqueId,
        marqueName: brandName,
        campaignId: mission.campaignId,
        campaignTitle: mission.campaign.title,
        talentName,
        requestedByName,
        contactCount: emailableCount,
        note,
        toEmails: admins.map((a) => a.email).filter(Boolean),
      }).catch(() => ({ sent: false, to: [] as string[] }));
    }

    await Promise.all(
      notifyUsers.map((user) =>
        prisma.notification.create({
          data: {
            userId: user.id,
            type: "GENERAL",
            titre: `Enrichir ${brandName}`,
            message: `${requestedByName} a mis ${brandName} en attente d'enrichissement (${contextLabel}).`,
            lien: enrichLien,
          },
        })
      )
    );

    if (mission.campaignId) {
      await prisma.prospectingCampaignEvent.create({
        data: {
          campaignId: mission.campaignId,
          type: "MARQUE_COMPLETION_REQUESTED",
          message: `${brandName} mise en attente d'enrichissement`,
          payload: {
            marqueId: mission.marqueId,
            marqueName: brandName,
            contactCount: emailableCount,
            note,
            missionId,
            source: "request-enrichissement",
          },
          actorId: session.user.id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      missionId,
      brandName,
      marqueId: mission.marqueId,
      awaitingContactsCompletion: true,
      alreadyQueued: mission.awaitingContactsCompletion,
      enrichPath: enrichLien,
      message: mission.awaitingContactsCompletion
        ? `${brandName} est déjà en file d'enrichissement.`
        : `${brandName} ajoutée à « Marques en attente d'enrichissement ».`,
    });
  } catch (error) {
    console.error("POST .../request-enrichissement:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
