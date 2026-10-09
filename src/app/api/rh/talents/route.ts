import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

/** Liste légère des talents pour le sélecteur notes de frais. */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const q = (new URL(request.url).searchParams.get("q") || "").trim();
  const idsParam = (new URL(request.url).searchParams.get("ids") || "").trim();
  const ids = idsParam
    ? idsParam.split(",").map((s) => s.trim()).filter(Boolean)
    : [];

  if (ids.length) {
    const talents = await prisma.talent.findMany({
      where: { id: { in: ids } },
      select: { id: true, prenom: true, nom: true, instagram: true },
    });
    return NextResponse.json({
      talents: talents.map((t) => ({
        id: t.id,
        label: `${t.prenom} ${t.nom}`.trim(),
        handle: t.instagram,
      })),
    });
  }

  const talents = await prisma.talent.findMany({
    where: {
      isArchived: false,
      ...(q
        ? {
            OR: [
              { prenom: { contains: q, mode: "insensitive" } },
              { nom: { contains: q, mode: "insensitive" } },
              { instagram: { contains: q, mode: "insensitive" } },
            ],
          }
        : {}),
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      instagram: true,
    },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    take: q ? 40 : 80,
  });

  return NextResponse.json({
    talents: talents.map((t) => ({
      id: t.id,
      label: `${t.prenom} ${t.nom}`.trim(),
      handle: t.instagram,
    })),
  });
}
