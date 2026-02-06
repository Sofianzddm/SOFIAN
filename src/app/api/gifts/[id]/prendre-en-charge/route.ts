import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/gifts/[id]/prendre-en-charge - Account Manager prend en charge la demande
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls les Account Managers (CM) peuvent prendre en charge
    if (user.role !== "CM" && user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seuls les Account Managers peuvent prendre en charge les demandes" },
        { status: 403 }
      );
    }

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
          },
        },
        tm: {
          select: {
            prenom: true,
            nom: true,
          },
        },
      },
    });

    if (!demande) {
      return NextResponse.json(
        { error: "Demande non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier que la demande n'est pas déjà prise en charge
    if (demande.accountManagerId && demande.accountManagerId !== user.id) {
      return NextResponse.json(
        { error: "Cette demande est déjà prise en charge par un autre Account Manager" },
        { status: 400 }
      );
    }

    // Mettre à jour la demande
    const demandeUpdated = await prisma.demandeGift.update({
      where: { id },
      data: {
        accountManagerId: user.id,
        statut: "EN_COURS",
        datePriseEnCharge: new Date(),
      },
      include: {
        accountManager: {
          select: {
            prenom: true,
            nom: true,
            email: true,
          },
        },
      },
    });

    // Ajouter un commentaire automatique
    await prisma.commentaireGift.create({
      data: {
        demandeGiftId: id,
        auteurId: user.id,
        contenu: "J'ai pris en charge cette demande et je vais traiter le dossier.",
        interne: false,
      },
    });

    return NextResponse.json(demandeUpdated);
  } catch (error) {
    console.error("Erreur POST /api/gifts/[id]/prendre-en-charge:", error);
    return NextResponse.json(
      { error: "Erreur lors de la prise en charge" },
      { status: 500 }
    );
  }
}
