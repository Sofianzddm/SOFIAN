import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/marques/options — liste légère des marques (id + nom) pour les
 * champs « Nom de la marque » (négo, collab…). Le but : suggérer les fiches
 * existantes pour que l'utilisateur réutilise la bonne orthographe et qu'on
 * ne crée jamais de doublon. Accessible à tout le staff (pas aux talents).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role || "";
    if (role === "TALENT") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const marques = await prisma.marque.findMany({
      orderBy: { nom: "asc" },
      select: { id: true, nom: true },
    });

    return NextResponse.json({ marques });
  } catch (error) {
    console.error("GET /api/marques/options error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
