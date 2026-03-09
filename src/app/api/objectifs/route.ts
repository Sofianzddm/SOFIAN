import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/objectifs
 * - Sans query: objectifs du user connecté (Head of Influence / Head of)
 * - ?userId=xxx: (ADMIN) objectifs du user xxx
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role;
    const userId = (session.user as { id?: string }).id;

    const { searchParams } = new URL(request.url);
    const targetUserId = searchParams.get("userId");

    if (targetUserId) {
      if (role !== "ADMIN") {
        return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
      }
      const objectifs = await prisma.objectif.findMany({
        where: { userId: targetUserId },
        orderBy: { createdAt: "desc" },
        include: {
          createur: { select: { id: true, prenom: true, nom: true } },
        },
      });
      return NextResponse.json({ objectifs });
    }

    // Objectifs du user connecté (pour son dashboard)
    const objectifs = await prisma.objectif.findMany({
      where: { userId },
      orderBy: { createdAt: "desc" },
      include: {
        createur: { select: { prenom: true, nom: true } },
      },
    });
    return NextResponse.json({ objectifs });
  } catch (error) {
    console.error("GET /api/objectifs:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/**
 * POST /api/objectifs — ADMIN : créer un objectif pour un utilisateur
 * Body: { userId, titre, description?, valeurCible?, dateLimite? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    if ((session.user as { role?: string }).role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
    }

    const body = await request.json();
    const { userId, titre, description, valeurCible, dateLimite } = body;
    if (!userId || !titre || typeof titre !== "string" || !titre.trim()) {
      return NextResponse.json(
        { error: "userId et titre requis" },
        { status: 400 }
      );
    }

    const targetUser = await prisma.user.findUnique({
      where: { id: userId, actif: true },
      select: { id: true },
    });
    if (!targetUser) {
      return NextResponse.json({ error: "Utilisateur introuvable" }, { status: 404 });
    }

    const objectif = await prisma.objectif.create({
      data: {
        userId: targetUser.id,
        createurId: (session.user as { id: string }).id,
        titre: titre.trim(),
        description: description != null ? String(description).trim() || undefined : undefined,
        valeurCible: valeurCible != null ? Number(valeurCible) : undefined,
        dateLimite: dateLimite ? new Date(dateLimite) : undefined,
      },
      include: {
        createur: { select: { prenom: true, nom: true } },
      },
    });
    return NextResponse.json({ objectif });
  } catch (error) {
    console.error("POST /api/objectifs:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
