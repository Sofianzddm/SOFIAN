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
      select: {
        photo: true,
        prenom: true,
        nom: true,
        ville: true,
        typePeau: true,
        typeCheveux: true,
        couleurCheveux: true,
        tendancePeau: true,
        tendanceCheveux: true,
      },
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

/**
 * PATCH /api/talents/me/profile
 * Permet au talent connecté de mettre à jour lui-même une liste blanche de
 * champs de son profil (ville + attributs physiques). Fonctionne aussi en
 * impersonation admin (la session effective est celle du talent).
 */
export async function PATCH(request: NextRequest) {
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
      select: { id: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Aucun profil talent trouvé" },
        { status: 404 }
      );
    }

    const data = await request.json();

    // Liste blanche stricte : le talent ne peut éditer que ces champs.
    const updateData: {
      ville?: string | null;
      typePeau?: string | null;
      typeCheveux?: string | null;
      couleurCheveux?: string | null;
      tendancePeau?: string[];
      tendanceCheveux?: string[];
    } = {};
    if (data.ville !== undefined) updateData.ville = data.ville || null;
    if (data.typePeau !== undefined) updateData.typePeau = data.typePeau || null;
    if (data.typeCheveux !== undefined)
      updateData.typeCheveux = data.typeCheveux || null;
    if (data.couleurCheveux !== undefined)
      updateData.couleurCheveux = data.couleurCheveux || null;
    if (data.tendancePeau !== undefined)
      updateData.tendancePeau = Array.isArray(data.tendancePeau)
        ? data.tendancePeau
        : [];
    if (data.tendanceCheveux !== undefined)
      updateData.tendanceCheveux = Array.isArray(data.tendanceCheveux)
        ? data.tendanceCheveux
        : [];

    const updated = await prisma.talent.update({
      where: { id: talent.id },
      data: updateData,
      select: {
        photo: true,
        prenom: true,
        nom: true,
        ville: true,
        typePeau: true,
        typeCheveux: true,
        couleurCheveux: true,
        tendancePeau: true,
        tendanceCheveux: true,
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("❌ Erreur PATCH /api/talents/me/profile:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du profil" },
      { status: 500 }
    );
  }
}
