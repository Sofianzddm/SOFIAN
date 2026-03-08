import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/talents/[id]/demander-revoir-tarifs
 * Admin uniquement : crée une notification pour Manon (ou la Head of Influence)
 * pour demander de revoir les tarifs du talent.
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const role = (session.user as { role?: string }).role;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé aux administrateurs" }, { status: 403 });
    }

    const { id: talentId } = await params;
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true, prenom: true, nom: true },
    });
    if (!talent) {
      return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
    }

    // Cibler Manon (prenom = Manon) ou à défaut un utilisateur Head of Influence
    const manonOrHeadOf = await prisma.user.findFirst({
      where: {
        actif: true,
        OR: [
          { prenom: { equals: "Manon", mode: "insensitive" } },
          { role: "HEAD_OF_INFLUENCE" },
        ],
      },
      orderBy: [{ prenom: "asc" }],
      select: { id: true, prenom: true, nom: true },
    });

    if (!manonOrHeadOf) {
      return NextResponse.json(
        { error: "Aucun utilisateur (Manon / Head of Influence) trouvé pour recevoir la demande" },
        { status: 404 }
      );
    }

    const actorName = session.user.name ?? "Un admin";
    const talentName = `${talent.prenom} ${talent.nom}`;
    const recipientName = `${manonOrHeadOf.prenom} ${manonOrHeadOf.nom}`;

    await prisma.notification.create({
      data: {
        userId: manonOrHeadOf.id,
        type: "REVOIR_TARIFS",
        titre: "Demande de revoir les tarifs",
        message: `${actorName} vous demande de revoir les tarifs du talent ${talentName}.`,
        lien: `/talents/${talent.id}/edit`,
        talentId: talent.id,
        actorId: session.user.id,
      },
    });

    return NextResponse.json({
      ok: true,
      message: `Demande envoyée à ${recipientName} pour revoir les tarifs de ${talentName}.`,
    });
  } catch (error) {
    console.error("Erreur demander-revoir-tarifs:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
