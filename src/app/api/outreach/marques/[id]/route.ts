import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * DELETE → retire entièrement une marque du cycle Outreach (ajout par erreur).
 * Supprime :
 *  - tous les OutreachTarget de la marque (et leur historique de touches, en cascade) ;
 *  - tous les MarqueContact issus d'une cartographie (source "CARTO"), pour que les
 *    contacts « en attente d'email » ne réapparaissent pas dans /outreach.
 * La fiche marque (et ses contacts hors carto) reste dans le CRM.
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

    const [deletedTargets, deletedCarto] = await prisma.$transaction([
      prisma.outreachTarget.deleteMany({ where: { marqueId: id } }),
      prisma.marqueContact.deleteMany({ where: { marqueId: id, source: "CARTO" } }),
    ]);

    return NextResponse.json({
      ok: true,
      removedTargets: deletedTargets.count,
      removedContacts: deletedCarto.count,
    });
  } catch (error) {
    console.error("DELETE /api/outreach/marques/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
