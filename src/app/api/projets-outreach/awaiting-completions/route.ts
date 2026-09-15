import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET — liste cross-projets des marques en attente de contacts (ADMIN only).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé aux admins." }, { status: 403 });
    }

    const missions = await prisma.contactMission.findMany({
      where: {
        awaitingContactsCompletion: true,
        campaignId: { not: null },
        campaign: {
          events: { some: { type: "CREATED" } },
          status: { not: "CLOSED" },
        },
      },
      orderBy: [
        { contactsCompletionRequestedAt: "desc" },
        { updatedAt: "desc" },
      ],
      take: 200,
      select: {
        id: true,
        targetBrand: true,
        creatorName: true,
        strategyReason: true,
        contactsCompletionRequestedAt: true,
        updatedAt: true,
        marqueId: true,
        marque: {
          select: {
            id: true,
            nom: true,
            contacts: {
              where: { outreachExcluded: false },
              select: { email: true, emailSuggested: true },
            },
          },
        },
        campaign: {
          select: {
            id: true,
            title: true,
            status: true,
            talent: { select: { prenom: true, nom: true } },
          },
        },
        createdBy: {
          select: { prenom: true, nom: true },
        },
      },
    });

    const items = missions.map((m) => {
      const contacts = m.marque?.contacts ?? [];
      const emailableCount = contacts.filter((c) => {
        const email = (c.email || c.emailSuggested || "").trim();
        return email.includes("@");
      }).length;
      const talent = m.campaign?.talent;
      const talentName = talent
        ? `${talent.prenom || ""} ${talent.nom || ""}`.trim()
        : "";
      const requester = m.createdBy
        ? `${m.createdBy.prenom || ""} ${m.createdBy.nom || ""}`.trim()
        : "";

      return {
        missionId: m.id,
        brandName: m.marque?.nom || m.targetBrand,
        marqueId: m.marqueId || m.marque?.id || null,
        creatorName: m.creatorName,
        strategyReason: m.strategyReason,
        emailableCount,
        contactCount: contacts.length,
        requestedAt: m.contactsCompletionRequestedAt?.toISOString() ?? null,
        updatedAt: m.updatedAt.toISOString(),
        campaignId: m.campaign?.id ?? null,
        campaignTitle: m.campaign?.title ?? null,
        campaignStatus: m.campaign?.status ?? null,
        talentName,
        requestedByName: requester || null,
      };
    });

    return NextResponse.json({ count: items.length, items });
  } catch (error) {
    console.error("GET /api/projets-outreach/awaiting-completions:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
