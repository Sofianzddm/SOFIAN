import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canWriteMarqueCrm } from "@/lib/marque-crm-access";
import {
  findSimilarToMarque,
  loadMarquesForDedupe,
} from "@/lib/marque-fuzzy-detect";

/**
 * GET /api/marques/[id]/similar
 * Fiches potentiellement doublons de cette marque (exact / typo / préfixe / proche).
 */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWriteMarqueCrm(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { id } = await params;
    const current = await prisma.marque.findUnique({
      where: { id },
      select: {
        id: true,
        nom: true,
        parentMarqueId: true,
        children: { select: { id: true } },
      },
    });
    if (!current) {
      return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
    }

    // Exclure mère / filles : la hiérarchie n'est pas un doublon à fusionner.
    const hierarchyIds = new Set<string>([
      ...(current.parentMarqueId ? [current.parentMarqueId] : []),
      ...current.children.map((c) => c.id),
    ]);

    const rows = await loadMarquesForDedupe(prisma);
    const matches = findSimilarToMarque(rows, id).filter(
      (m) => !hierarchyIds.has(m.marque.id)
    );

    return NextResponse.json({
      marqueId: id,
      nom: current.nom,
      matches: matches.map((m) => ({
        id: m.marque.id,
        nom: m.marque.nom,
        slug: m.marque.slug,
        secteur: m.marque.secteur,
        reason: m.reason,
        similarity: Math.round(m.similarity * 100) / 100,
        counts: m.marque.counts,
      })),
    });
  } catch (error) {
    console.error("GET /api/marques/[id]/similar:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
