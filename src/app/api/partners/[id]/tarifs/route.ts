import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const MANAGE_ROLES = ["ADMIN", "HEAD_OF"] as const;

function canManage(role: string) {
  return MANAGE_ROLES.includes(role as any);
}

// PUT — Créer ou modifier un tarif négocié pour un talent
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role || "TALENT";
    if (!canManage(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { talentId, overrides, note } = body as {
      talentId: string;
      overrides: {
        tarifStory?: number | null;
        tarifPost?: number | null;
        tarifReel?: number | null;
        tarifStoryConcours?: number | null;
        tarifPostConcours?: number | null;
        tarifTiktokVideo?: number | null;
        tarifYoutubeVideo?: number | null;
        tarifYoutubeShort?: number | null;
        tarifPostCommun?: number | null;
        tarifEvent?: number | null;
        tarifShooting?: number | null;
        tarifAmbassadeur?: number | null;
      };
      note?: string | null;
    };

    if (!talentId) {
      return NextResponse.json(
        { error: "talentId requis" },
        { status: 400 }
      );
    }

    // Vérifier que le partenaire existe
    const partner = await prisma.partner.findUnique({
      where: { id },
      select: { id: true },
    });

    if (!partner) {
      return NextResponse.json(
        { error: "Partenaire introuvable" },
        { status: 404 }
      );
    }

    // Vérifier que le talent existe
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Talent introuvable" },
        { status: 404 }
      );
    }

    // Préparer les données (convertir les valeurs vides en null)
    const overrideData: any = {};
    if (overrides.tarifStory !== undefined) overrideData.tarifStory = overrides.tarifStory || null;
    if (overrides.tarifPost !== undefined) overrideData.tarifPost = overrides.tarifPost || null;
    if (overrides.tarifReel !== undefined) overrideData.tarifReel = overrides.tarifReel || null;
    if (overrides.tarifStoryConcours !== undefined) overrideData.tarifStoryConcours = overrides.tarifStoryConcours || null;
    if (overrides.tarifPostConcours !== undefined) overrideData.tarifPostConcours = overrides.tarifPostConcours || null;
    if (overrides.tarifTiktokVideo !== undefined) overrideData.tarifTiktokVideo = overrides.tarifTiktokVideo || null;
    if (overrides.tarifYoutubeVideo !== undefined) overrideData.tarifYoutubeVideo = overrides.tarifYoutubeVideo || null;
    if (overrides.tarifYoutubeShort !== undefined) overrideData.tarifYoutubeShort = overrides.tarifYoutubeShort || null;
    if (overrides.tarifPostCommun !== undefined) overrideData.tarifPostCommun = overrides.tarifPostCommun || null;
    if (overrides.tarifEvent !== undefined) overrideData.tarifEvent = overrides.tarifEvent || null;
    if (overrides.tarifShooting !== undefined) overrideData.tarifShooting = overrides.tarifShooting || null;
    if (overrides.tarifAmbassadeur !== undefined) overrideData.tarifAmbassadeur = overrides.tarifAmbassadeur || null;
    
    if (note !== undefined) overrideData.note = note || null;

    const result = await prisma.partnerTarifOverride.upsert({
      where: {
        partnerId_talentId: {
          partnerId: id,
          talentId,
        },
      },
      create: {
        partnerId: id,
        talentId,
        ...overrideData,
      },
      update: overrideData,
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur PUT /api/partners/[id]/tarifs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la sauvegarde des tarifs négociés" },
      { status: 500 }
    );
  }
}

// DELETE — Réinitialiser les tarifs d'un talent (revenir aux défauts)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role || "TALENT";
    if (!canManage(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = await request.json();
    const { talentId } = body as { talentId: string };

    if (!talentId) {
      return NextResponse.json(
        { error: "talentId requis" },
        { status: 400 }
      );
    }

    await prisma.partnerTarifOverride.deleteMany({
      where: {
        partnerId: id,
        talentId,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/partners/[id]/tarifs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la réinitialisation des tarifs" },
      { status: 500 }
    );
  }
}

// GET — Récupérer tous les overrides de ce partenaire
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role || "TALENT";
    if (!canManage(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux administrateurs / Head Of" },
        { status: 403 }
      );
    }

    const { id } = await params;

    const overrides = await prisma.partnerTarifOverride.findMany({
      where: { partnerId: id },
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
          },
        },
      },
      orderBy: {
        talent: {
          prenom: "asc",
        },
      },
    });

    return NextResponse.json(overrides);
  } catch (error) {
    console.error("Erreur GET /api/partners/[id]/tarifs:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des tarifs négociés" },
      { status: 500 }
    );
  }
}
