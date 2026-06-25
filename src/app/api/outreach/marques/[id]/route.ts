import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * DELETE → retire entièrement une marque du cycle Outreach (ajout par erreur).
 *  - Supprime tous les OutreachTarget de la marque (et leur historique de touches,
 *    en cascade) → la marque sort du cycle.
 *  - NE SUPPRIME PAS les contacts : les MarqueContact issus d'une cartographie
 *    (source "CARTO") sont marqués `outreachExcluded` pour ne plus réapparaître
 *    dans la liste « en attente d'email », mais restent dans le CRM (fiche marque).
 * Réservé à l'ADMIN.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;

    const marque = await prisma.marque.findUnique({
      where: { id },
      select: { id: true, nom: true },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
    }

    const [deletedTargets, excludedCarto] = await prisma.$transaction([
      prisma.outreachTarget.deleteMany({ where: { marqueId: id } }),
      prisma.marqueContact.updateMany({
        where: { marqueId: id, source: "CARTO" },
        data: { outreachExcluded: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      removedTargets: deletedTargets.count,
      excludedContacts: excludedCarto.count,
    });
  } catch (error) {
    console.error("DELETE /api/outreach/marques/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
