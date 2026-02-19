import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MANAGE_ROLES = ["ADMIN", "HEAD_OF"] as const;
type Role = (typeof MANAGE_ROLES)[number] | string;

function canManage(role: Role) {
  return MANAGE_ROLES.includes(role as any);
}

// GET /api/partners/[id]/talents - liste des talents associés
export async function GET(
  _request: NextRequest,
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

    return NextResponse.json(
      partner.talents.map((pt) => ({
        id: pt.talent.id,
        talentId: pt.talentId,
        order: pt.order,
        prenom: pt.talent.prenom,
        nom: pt.talent.nom,
        photo: pt.talent.photo,
        niches: pt.talent.niches,
        stats: pt.talent.stats,
      }))
    );
  } catch (error) {
    console.error("Erreur GET /api/partners/[id]/talents:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des talents du partenaire" },
      { status: 500 }
    );
  }
}

// POST /api/partners/[id]/talents - ajouter des talents
export async function POST(
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
    const { talentIds } = body as { talentIds?: string[] };

    if (!talentIds || talentIds.length === 0) {
      return NextResponse.json(
        { error: "Aucun talent à ajouter" },
        { status: 400 }
      );
    }

    const existingCount = await prisma.partnerTalent.count({
      where: { partnerId: id },
    });

    await prisma.partnerTalent.createMany({
      data: talentIds.map((talentId, index) => ({
        partnerId: id,
        talentId,
        order: existingCount + index,
      })),
      skipDuplicates: true,
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur POST /api/partners/[id]/talents:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'ajout des talents au partenaire" },
      { status: 500 }
    );
  }
}

// DELETE /api/partners/[id]/talents - retirer des talents
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
    if (!canManage(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { talentIds } = body as { talentIds?: string[] };

    if (!talentIds || talentIds.length === 0) {
      return NextResponse.json(
        { error: "Aucun talent à retirer" },
        { status: 400 }
      );
    }

    await prisma.partnerTalent.deleteMany({
      where: {
        partnerId: id,
        talentId: { in: talentIds },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/partners/[id]/talents:", error);
    return NextResponse.json(
      { error: "Erreur lors du retrait des talents du partenaire" },
      { status: 500 }
    );
  }
}

