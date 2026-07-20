import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * GET /api/partners/options — liste légère des agences (id + nom) pour les
 * sélecteurs « Nom de l'agence » (qualification de contact négo / collab /
 * inbound). Accessible à tout utilisateur staff connecté (y compris TM,
 * contrairement à /api/partners) : on n'expose que les noms, pas les stats.
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

    const partners = await prisma.partner.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: { id: true, name: true, market: true },
    });

    return NextResponse.json({ partners });
  } catch (error) {
    console.error("GET /api/partners/options error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
