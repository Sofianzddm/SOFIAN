import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/gifts/[id] - Détails d'une demande
export async function GET(
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

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            instagram: true,
            email: true,
            telephone: true,
            adresse: true,
            codePostal: true,
            ville: true,
            pays: true,
          },
        },
        tm: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            telephone: true,
          },
        },
        accountManager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            telephone: true,
          },
        },
        marque: {
          select: {
            id: true,
            nom: true,
            contacts: true,
          },
        },
        commentaires: {
          orderBy: { createdAt: "asc" },
          include: {
            auteur: {
              select: {
                id: true,
                prenom: true,
                nom: true,
                role: true,
              },
            },
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

    // Vérifier les droits d'accès
    const hasAccess =
      user.role === "ADMIN" ||
      user.role === "HEAD_OF" ||
      user.role === "HEAD_OF_INFLUENCE" ||
      user.role === "CM" ||
      demande.tmId === user.id ||
      demande.accountManagerId === user.id;

    if (!hasAccess) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    return NextResponse.json(demande);
  } catch (error) {
    console.error("Erreur GET /api/gifts/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// PATCH /api/gifts/[id] - Modifier une demande
export async function PATCH(
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
    const body = await req.json();

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
    });

    if (!demande) {
      return NextResponse.json(
        { error: "Demande non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier les droits
    const canEdit =
      user.role === "ADMIN" ||
      user.role === "CM" ||
      (user.role === "TM" && demande.tmId === user.id);

    if (!canEdit) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Construire les données à mettre à jour
    const updateData: any = {};

    // Champs modifiables par TM et AM
    if (body.description !== undefined) updateData.description = body.description;
    if (body.justification !== undefined) updateData.justification = body.justification;
    if (body.valeurEstimee !== undefined) updateData.valeurEstimee = body.valeurEstimee ? parseFloat(body.valeurEstimee) : null;
    if (body.priorite !== undefined) updateData.priorite = body.priorite;
    if (body.dateSouhaitee !== undefined) updateData.datesouhaitee = body.dateSouhaitee ? new Date(body.dateSouhaitee) : null;
    if (body.adresseLivraison !== undefined) updateData.adresseLivraison = body.adresseLivraison;
    if (body.notesInternes !== undefined) updateData.notesInternes = body.notesInternes;

    // Champs modifiables uniquement par AM
    if (user.role === "CM" || user.role === "ADMIN") {
      if (body.statut !== undefined) {
        updateData.statut = body.statut;

        // Mettre à jour les dates selon le statut
        if (body.statut === "EN_COURS" && !demande.datePriseEnCharge) {
          updateData.datePriseEnCharge = new Date();
          // Assigner l'AM si pas déjà fait
          if (!demande.accountManagerId) {
            updateData.accountManagerId = user.id;
          }
        }
        if (body.statut === "ATTENTE_MARQUE" && !demande.dateContactMarque) {
          updateData.dateContactMarque = new Date();
        }
        if ((body.statut === "ACCEPTE" || body.statut === "REFUSE") && !demande.dateReponseMarque) {
          updateData.dateReponseMarque = new Date();
        }
        if (body.statut === "ENVOYE" && !demande.dateEnvoi) {
          updateData.dateEnvoi = new Date();
        }
        if (body.statut === "RECU" && !demande.dateReception) {
          updateData.dateReception = new Date();
        }
      }

      if (body.accountManagerId !== undefined) updateData.accountManagerId = body.accountManagerId;
      if (body.marqueId !== undefined) updateData.marqueId = body.marqueId;
      if (body.numeroSuivi !== undefined) updateData.numeroSuivi = body.numeroSuivi;
      if (body.dateEnvoi !== undefined) updateData.dateEnvoi = body.dateEnvoi ? new Date(body.dateEnvoi) : null;
      if (body.dateReception !== undefined) updateData.dateReception = body.dateReception ? new Date(body.dateReception) : null;
    }

    const demandeUpdated = await prisma.demandeGift.update({
      where: { id },
      data: updateData,
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
          },
        },
        marque: {
          select: {
            nom: true,
          },
        },
        accountManager: {
          select: {
            prenom: true,
            nom: true,
          },
        },
      },
    });

    return NextResponse.json(demandeUpdated);
  } catch (error) {
    console.error("Erreur PATCH /api/gifts/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}

// DELETE /api/gifts/[id] - Supprimer/Annuler une demande
export async function DELETE(
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

    const demande = await prisma.demandeGift.findUnique({
      where: { id },
    });

    if (!demande) {
      return NextResponse.json(
        { error: "Demande non trouvée" },
        { status: 404 }
      );
    }

    // Seul le TM créateur ou un ADMIN peut annuler
    const canDelete =
      user.role === "ADMIN" ||
      (user.role === "TM" && demande.tmId === user.id);

    if (!canDelete) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    // Au lieu de supprimer, on met le statut à ANNULE
    await prisma.demandeGift.update({
      where: { id },
      data: { statut: "ANNULE" },
    });

    return NextResponse.json({ message: "Demande annulée avec succès" });
  } catch (error) {
    console.error("Erreur DELETE /api/gifts/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'annulation" },
      { status: 500 }
    );
  }
}
