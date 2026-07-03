import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET /api/talents/me/profile
 * Infos de profil du talent connecté (photo interne pour l'avatar du portail).
 * Fonctionne aussi en impersonation admin (JWT ou cookie) : la session
 * effective renvoyée par getAppSession est celle du talent impersonné.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (session.user.role !== "TALENT") {
      return NextResponse.json(
        { error: "Accès réservé aux talents" },
        { status: 403 }
      );
    }

    const talent = await prisma.talent.findUnique({
      where: { userId: session.user.id },
      select: { photo: true, prenom: true, nom: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Aucun profil talent trouvé" },
        { status: 404 }
      );
    }

    return NextResponse.json(talent);
  } catch (error) {
    console.error("❌ Erreur GET /api/talents/me/profile:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération du profil" },
      { status: 500 }
    );
  }
}
