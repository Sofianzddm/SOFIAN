import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/marques/search?q=star — recherche de marques par nom dans la base
 * interne. On priorise les marques dont le nom (ou un alias) COMMENCE par la
 * saisie (« star » → « Starbucks »), puis on complète avec celles qui la
 * CONTIENNENT. Sert à retrouver rapidement une fiche marque existante sans
 * connaître son orthographe exacte.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role || "";
    if (role === "TALENT") {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const q = (request.nextUrl.searchParams.get("q") || "").trim();
    if (q.length < 2) {
      return NextResponse.json(
        { error: "Saisis au moins 2 caractères." },
        { status: 400 }
      );
    }

    const rows = await prisma.marque.findMany({
      where: {
        OR: [
          { nom: { contains: q, mode: "insensitive" } },
          { aliases: { some: { label: { contains: q, mode: "insensitive" } } } },
        ],
      },
      select: {
        id: true,
        nom: true,
        ville: true,
        _count: { select: { contacts: true } },
      },
      orderBy: { nom: "asc" },
      take: 50,
    });

    const lower = q.toLowerCase();
    // Priorité aux noms qui commencent par la saisie, puis tri alphabétique.
    const marques = rows
      .map((r) => ({
        id: r.id,
        nom: r.nom,
        ville: r.ville || "",
        contactCount: r._count.contacts,
        startsWith: r.nom.toLowerCase().startsWith(lower),
      }))
      .sort((a, b) => {
        if (a.startsWith !== b.startsWith) return a.startsWith ? -1 : 1;
        return a.nom.localeCompare(b.nom, "fr");
      })
      .slice(0, 25)
      .map(({ startsWith: _startsWith, ...rest }) => rest);

    return NextResponse.json({ marques });
  } catch (error) {
    console.error("GET /api/marques/search:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche de marques." },
      { status: 500 }
    );
  }
}
