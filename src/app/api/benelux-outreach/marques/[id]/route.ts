import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * DELETE → retire entièrement une entreprise du cycle BENELUX (ajout par erreur).
 *  - Supprime tous les BeneluxOutreachTarget de l'entreprise (et leurs touches).
 *  - NE SUPPRIME PAS les contacts : les contacts issus d'une cartographie
 *    (source "CARTO") sont marqués `outreachExcluded` pour ne plus réapparaître
 *    dans la liste « en attente d'email », mais restent dans l'annuaire BENELUX.
 * Le paramètre [id] correspond à l'id de l'entreprise (companyId, alias marqueId
 * côté page /outreach). Réservé à l'ADMIN.
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

    const company = await prisma.beneluxCompany.findUnique({
      where: { id },
      select: { id: true, nom: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    const [deletedTargets, excludedCarto] = await prisma.$transaction([
      prisma.beneluxOutreachTarget.deleteMany({ where: { companyId: id } }),
      prisma.beneluxContact.updateMany({
        where: { companyId: id, source: "CARTO" },
        data: { outreachExcluded: true },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      removedTargets: deletedTargets.count,
      excludedContacts: excludedCarto.count,
    });
  } catch (error) {
    console.error("DELETE /api/benelux-outreach/marques/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
