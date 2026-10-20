import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

/**
 * GET /api/rh/tasks/talents?q=…
 * Recherche légère de talents pour lier une tâche (usage interne RH uniquement).
 * Aucune notification n’est envoyée au talent.
 */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const q = (request.nextUrl.searchParams.get("q") || "").trim();
  const where = {
    isArchived: false,
    ...(q
      ? {
          OR: [
            { prenom: { contains: q, mode: "insensitive" as const } },
            { nom: { contains: q, mode: "insensitive" as const } },
            { instagram: { contains: q, mode: "insensitive" as const } },
            { email: { contains: q, mode: "insensitive" as const } },
          ],
        }
      : {}),
  };

  const rows = await prisma.talent.findMany({
    where,
    select: {
      id: true,
      prenom: true,
      nom: true,
      photo: true,
      instagram: true,
    },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    take: q ? 20 : 40,
  });

  const talents = rows.map((t) => {
    const name = `${t.prenom} ${t.nom}`.trim();
    const initials = `${t.prenom?.[0] || ""}${t.nom?.[0] || ""}`
      .toUpperCase()
      .slice(0, 2);
    return {
      id: t.id,
      name,
      initials: initials || "?",
      photo: t.photo,
      instagram: t.instagram,
    };
  });

  return NextResponse.json({ talents });
}
