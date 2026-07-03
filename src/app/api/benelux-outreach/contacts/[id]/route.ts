import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * DELETE → supprime définitivement un contact BENELUX de l'annuaire.
 * Supprime aussi ses suivis de prospection (BeneluxOutreachTarget + touches
 * en cascade) pour qu'il ne réapparaisse ni dans le pipeline /outreach ni
 * dans la file « en attente d'email ». Réservé à l'ADMIN.
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

    const contact = await prisma.beneluxContact.findUnique({
      where: { id },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    // Les targets sont en onDelete: SetNull → on les supprime explicitement
    // pour ne pas laisser de snapshots orphelins dans le pipeline.
    await prisma.$transaction([
      prisma.beneluxOutreachTarget.deleteMany({ where: { beneluxContactId: id } }),
      prisma.beneluxContact.delete({ where: { id } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/benelux-outreach/contacts/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
