import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { slugifyPartner } from "@/lib/agency-partner";

const VIEW_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
  "CM",
] as const;

const MANAGE_ROLES = ["ADMIN", "HEAD_OF"] as const;

type Role = (typeof VIEW_ROLES)[number] | (typeof MANAGE_ROLES)[number] | string;

function canView(role: Role) {
  return VIEW_ROLES.includes(role as any);
}

function canManage(role: Role) {
  return MANAGE_ROLES.includes(role as any);
}

function getStartDateForPeriod(period: string | null): Date | null {
  const now = new Date();
  switch (period) {
    case "24h":
      return new Date(now.getTime() - 24 * 60 * 60 * 1000);
    case "7d":
      return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    case "30d":
      return new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    case "all":
    default:
      return null;
  }
}

// GET /api/partners/[id] - détail + stats
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: Role }).role || "TALENT";
    if (!canView(role)) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const url = new URL(request.url);
    const period = url.searchParams.get("period") || "7d";
    const startDate = getStartDateForPeriod(period);

    const [
      partner,
      viewsCount,
      uniqueVisitors,
      talentClickCount,
      ctaClickCount,
      topTalentsRaw,
      sessionDurationAgg,
      recentActivity,
    ] = await Promise.all([
        prisma.partner.findUnique({
          where: { id },
          include: {
            talents: {
              orderBy: { order: "asc" },
              include: {
                talent: {
                  include: { stats: true },
                },
              },
            },
            projects: { orderBy: { order: "asc" }, select: { projectId: true, order: true } },
          },
        }),
        // Vues = entrées sur le site (1 par session, action "view" uniquement)
        prisma.partnerView.count({
          where: {
            partnerId: id,
            action: "view",
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
        }),
        prisma.partnerView.groupBy({
          by: ["visitorId"],
          where: {
            partnerId: id,
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
        }),
        prisma.partnerView.count({
          where: {
            partnerId: id,
            action: "talent_click",
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
        }),
        prisma.partnerView.count({
          where: {
            partnerId: id,
            action: "cta_click",
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
        }),
        prisma.partnerView.groupBy({
          by: ["talentClicked", "talentName"],
          where: {
            partnerId: id,
            action: "talent_click",
            talentClicked: { not: null },
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
          _count: true,
        }),
        // Temps moyen sur le site (session_end avec duration)
        prisma.partnerView.aggregate({
          where: {
            partnerId: id,
            action: "session_end",
            duration: { not: null },
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
          _avg: { duration: true },
          _count: true,
        }),
        prisma.partnerView.findMany({
          where: {
            partnerId: id,
            ...(startDate ? { createdAt: { gte: startDate } } : {}),
          },
          orderBy: { createdAt: "desc" },
          take: 50,
        }),
      ]);

    if (!partner) {
      return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 });
    }

    // Contacts agence (Prospection Agences) : les "clients" saisis / importés via
    // Excel, avec l'état de leur suivi (statut + dernier touch).
    const agencyContactsRaw = await prisma.agencyContact
      .findMany({
        where: { partnerId: id },
        orderBy: [{ principal: "desc" }, { prenom: "asc" }],
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          language: true,
          principal: true,
          excluded: true,
          createdAt: true,
          outreachTargets: {
            take: 1,
            orderBy: { createdAt: "desc" },
            select: {
              id: true,
              status: true,
              cycleCount: true,
              lastSentAt: true,
              lastRepliedAt: true,
              nextRecontactAt: true,
              touches: {
                take: 1,
                orderBy: { cycleNumber: "desc" },
                select: {
                  sentAt: true,
                  openCount: true,
                  openedAt: true,
                  clickCount: true,
                  clickedAt: true,
                  repliedAt: true,
                  relanceSentAt: true,
                },
              },
            },
          },
        },
      })
      .catch(() => []);

    const agencyContacts = agencyContactsRaw.map((c) => {
      const target = c.outreachTargets[0] || null;
      const touch = target?.touches[0] || null;
      return {
        id: c.id,
        prenom: c.prenom,
        nom: c.nom,
        email: c.email,
        poste: c.poste,
        language: c.language,
        principal: c.principal,
        excluded: c.excluded,
        createdAt: c.createdAt,
        inProspection: !!target,
        status: target?.status ?? null,
        cycleCount: target?.cycleCount ?? 0,
        lastSentAt: target?.lastSentAt ?? null,
        lastRepliedAt: target?.lastRepliedAt ?? null,
        nextRecontactAt: target?.nextRecontactAt ?? null,
        openCount: touch?.openCount ?? 0,
        clickCount: touch?.clickCount ?? 0,
        replied: !!touch?.repliedAt,
        relanceSent: !!touch?.relanceSentAt,
      };
    });

    // Trier et limiter les top talents après le groupBy
    const topTalents = topTalentsRaw
      .map((row) => ({
        talentId: row.talentClicked,
        talentName: row.talentName,
        clicks: row._count,
      }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 10);

    const lastVisit =
      recentActivity.length > 0 ? recentActivity[0].createdAt : null;

    return NextResponse.json({
      partner: {
        id: partner.id,
        name: partner.name,
        slug: partner.slug,
        logo: partner.logo,
        contactName: partner.contactName,
        contactEmail: partner.contactEmail,
        isActive: partner.isActive,
        market: partner.market,
        description: partner.description,
        message: partner.message,
        createdAt: partner.createdAt,
        updatedAt: partner.updatedAt,
        createdBy: partner.createdBy,
        talents: partner.talents.map((pt) => ({
          id: pt.talent.id,
          talentId: pt.talentId,
          order: pt.order,
          prenom: pt.talent.prenom,
          nom: pt.talent.nom,
          photo: pt.talent.photo,
          niches: pt.talent.niches,
          stats: pt.talent.stats,
        })),
        agencyContacts,
      },
      stats: {
        period,
        totalViews: viewsCount,
        uniqueVisitors: uniqueVisitors.length,
        talentClicks: talentClickCount,
        ctaClicks: ctaClickCount,
        lastVisit,
        avgDurationSeconds:
          sessionDurationAgg._count > 0 && sessionDurationAgg._avg.duration != null
            ? Math.round(sessionDurationAgg._avg.duration)
            : null,
      },
      topTalents,
      recentActivity: recentActivity.map((view) => ({
        id: view.id,
        action: view.action,
        talentClicked: view.talentClicked,
        talentName: view.talentName,
        createdAt: view.createdAt,
        duration: view.duration,
        metadata: view.metadata,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/partners/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du partenaire" },
      { status: 500 }
    );
  }
}

// PUT /api/partners/[id] - modifier un partenaire (ADMIN / HEAD_OF)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: Role }).role || "TALENT";
    if (!canManage(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();

    const {
      name,
      slug,
      logo,
      contactName,
      contactEmail,
      message,
      description,
      isActive,
      market,
      talentIds,
    } = body as {
      name?: string;
      slug?: string;
      logo?: string | null;
      contactName?: string | null;
      contactEmail?: string | null;
      message?: string | null;
      description?: string | null;
      isActive?: boolean;
      market?: string;
      talentIds?: string[];
    };

    const data: any = {};
    if (name !== undefined) data.name = name;
    if (logo !== undefined) data.logo = logo;
    if (contactName !== undefined) data.contactName = contactName;
    if (contactEmail !== undefined) data.contactEmail = contactEmail;
    if (message !== undefined) data.message = message;
    if (description !== undefined) data.description = description;
    if (isActive !== undefined) data.isActive = isActive;

    // Marché de l'agence : uniquement "FR" ou "BENELUX".
    let normalizedMarket: "FR" | "BENELUX" | undefined;
    if (market !== undefined) {
      normalizedMarket = market.toUpperCase() === "BENELUX" ? "BENELUX" : "FR";
      data.market = normalizedMarket;
    }

    // Édition libre du lien (slug) : on normalise et on vérifie l'unicité.
    // C'est ce slug qui construit l'URL talent book /partners/{slug} et le token
    // {{agence.lien}} de la Prospection Agences.
    if (slug !== undefined) {
      const normalizedSlug = slugifyPartner(slug);
      if (!normalizedSlug) {
        return NextResponse.json(
          { error: "Le lien (slug) ne peut pas être vide." },
          { status: 400 }
        );
      }
      const clash = await prisma.partner.findFirst({
        where: { slug: normalizedSlug, NOT: { id } },
        select: { id: true },
      });
      if (clash) {
        return NextResponse.json(
          { error: `Le lien « ${normalizedSlug} » est déjà utilisé par une autre agence.` },
          { status: 409 }
        );
      }
      data.slug = normalizedSlug;
    }

    // Update partenaire
    const updatedPartner = await prisma.partner.update({
      where: { id },
      data,
    });

    // Propage le nom (et le slug par sécurité) vers les contacts suivis par la
    // Prospection Agences : le snapshot company / partnerSlug reste à jour, donc
    // le token {{agence.nom}} et le lien {{agence.lien}} reflètent /partners.
    await prisma.agencyOutreachTarget
      .updateMany({
        where: { partnerId: id },
        data: {
          company: updatedPartner.name,
          partnerSlug: updatedPartner.slug,
          // Propage le marché de l'agence aux cibles de prospection (onglet
          // FR / BENELUX + adaptation de la rédaction IA) uniquement s'il a été
          // explicitement modifié.
          ...(normalizedMarket !== undefined ? { market: normalizedMarket } : {}),
        },
      })
      .catch((e) =>
        console.warn("[partners PUT] propagation prospection agences:", e)
      );

    if (Array.isArray(talentIds)) {
      // Re-synchroniser les PartnerTalent dans une transaction
      await prisma.$transaction([
        prisma.partnerTalent.deleteMany({
          where: { partnerId: id },
        }),
        prisma.partnerTalent.createMany({
          data: talentIds.map((talentId, index) => ({
            partnerId: id,
            talentId,
            order: index,
          })),
        }),
      ]);
    }

    const partner = await prisma.partner.findUnique({
      where: { id },
      include: {
        talents: {
          orderBy: { order: "asc" },
          include: {
            talent: {
              include: { stats: true },
            },
          },
        },
      },
    });

    if (!partner) {
      return NextResponse.json({ error: "Partenaire introuvable" }, { status: 404 });
    }

    return NextResponse.json({
      id: partner.id,
      name: partner.name,
      slug: partner.slug,
      logo: partner.logo,
      contactName: partner.contactName,
      contactEmail: partner.contactEmail,
      isActive: partner.isActive,
      market: partner.market,
      description: partner.description,
      message: partner.message,
      createdAt: partner.createdAt,
      updatedAt: partner.updatedAt,
      createdBy: partner.createdBy,
      talents: partner.talents.map((pt) => ({
        id: pt.talent.id,
        talentId: pt.talentId,
        order: pt.order,
        prenom: pt.talent.prenom,
        nom: pt.talent.nom,
        photo: pt.talent.photo,
        niches: pt.talent.niches,
        stats: pt.talent.stats,
      })),
    });
  } catch (error) {
    console.error("Erreur PUT /api/partners/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du partenaire" },
      { status: 500 }
    );
  }
}

// DELETE /api/partners/[id] - supprimer un partenaire (ADMIN uniquement)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: Role }).role || "TALENT";
    if (role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les administrateurs peuvent supprimer un partenaire" },
        { status: 403 }
      );
    }

    const { id } = await params;

    await prisma.partner.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/partners/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du partenaire" },
      { status: 500 }
    );
  }
}

