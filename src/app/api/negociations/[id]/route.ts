import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET - Détail d'une négociation
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const negociation = await prisma.negociation.findUnique({
      where: { id: id },
      include: {
        tm: {
          select: { id: true, prenom: true, nom: true, email: true },
        },
        talent: {
          include: {
            tarifs: true,
          },
        },
        marque: {
          select: { id: true, nom: true, secteur: true },
        },
        livrables: {
          orderBy: { createdAt: "asc" },
        },
        validateur: {
          select: { id: true, prenom: true, nom: true },
        },
        commentaires: {
          include: {
            user: {
              select: { id: true, prenom: true, nom: true, role: true },
            },
          },
          orderBy: { createdAt: "asc" },
        },
        collaboration: {
          select: { id: true, reference: true },
        },
      },
    });

    if (!negociation) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }

    return NextResponse.json(negociation);
  } catch (error) {
    console.error("Erreur GET négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// PUT - Mettre à jour une négociation
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const { id } = await params;
    const data = await request.json();

    // Récupérer la négociation actuelle
    const negoActuelle = await prisma.negociation.findUnique({
      where: { id },
      include: {
        tm: {
          select: { id: true, prenom: true, nom: true },
        },
      },
    });

    if (!negoActuelle) {
      return NextResponse.json({ error: "Négociation non trouvée" }, { status: 404 });
    }

    // Vérifier les permissions
    const canEdit =
      session.user.id === negoActuelle.tmId ||
      ["ADMIN", "HEAD_OF"].includes(session.user.role || "");

    if (!canEdit) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    // 🔄 Si la négo est REFUSEE, on la remet en BROUILLON
    const newStatut = negoActuelle.statut === "REFUSEE" ? "BROUILLON" : negoActuelle.statut;
    const resetRefus = negoActuelle.statut === "REFUSEE";

    // Déterminer si on doit notifier (modification après soumission)
    const shouldNotify = ["EN_ATTENTE", "EN_DISCUSSION"].includes(negoActuelle.statut);

    // Transaction pour garantir l'intégrité
    const negociation = await prisma.$transaction(async (tx) => {
      // 1. Supprimer les anciens livrables
      await tx.negoLivrable.deleteMany({
        where: { negociationId: id },
      });

      // 2. Mettre à jour la négociation
      const nomMarqueSaisi = data.nomMarqueSaisi ? String(data.nomMarqueSaisi).trim() : null;
      const updated = await tx.negociation.update({
        where: { id },
        data: {
          talentId: data.talentId,
          marqueId: data.marqueId || null,
          nomMarqueSaisi: nomMarqueSaisi ?? undefined,
          contactMarque: data.contactMarque || null,
          emailContact: data.emailContact || null,
          source: data.source,
          brief: data.brief || null,
          budgetMarque: data.budgetMarque ? parseFloat(data.budgetMarque) : null,
          budgetSouhaite: data.budgetSouhaite ? parseFloat(data.budgetSouhaite) : null,
          budgetFinal: data.budgetFinal ? parseFloat(data.budgetFinal) : null,
          dateDeadline: data.dateDeadline ? new Date(data.dateDeadline) : null,
          modifiedSinceReview: shouldNotify,
          lastModifiedAt: new Date(),
          // 🔄 Réinitialiser le statut et la raison de refus si nécessaire
          statut: newStatut,
          raisonRefus: resetRefus ? null : undefined,
          livrables: {
            create: (data.livrables || []).map((l: any) => ({
              typeContenu: l.typeContenu,
              quantite: l.quantite || 1,
              prixDemande: l.prixDemande ? parseFloat(l.prixDemande) : null,
              prixSouhaite: l.prixSouhaite ? parseFloat(l.prixSouhaite) : null,
              prixFinal: l.prixFinal ? parseFloat(l.prixFinal) : null,
              description: l.description || null,
            })),
          },
        },
        include: {
          livrables: true,
        },
      });

      // 3. Créer notification et commentaire si nécessaire
      if (resetRefus) {
        // 🔄 Si la négo était refusée, ajouter un commentaire de réouverture
        await tx.negoCommentaire.create({
          data: {
            negociationId: id,
            userId: session.user.id,
            contenu: `🔄 Négociation rouverte et remise en brouillon pour modification`,
          },
        });
        console.log(`🔄 Négociation ${negoActuelle.reference} rouverte après refus`);
      }

      if (shouldNotify) {
        // Trouver tous les HEAD_OF et ADMIN
        const validateurs = await tx.user.findMany({
          where: {
            role: { in: ["HEAD_OF", "ADMIN"] },
            actif: true,
          },
        });

        // Créer une notification pour chaque validateur
        for (const validateur of validateurs) {
          await tx.notification.create({
            data: {
              userId: validateur.id,
              type: "GENERAL",
              titre: "Négociation modifiée",
              message: `${negoActuelle.tm.prenom} ${negoActuelle.tm.nom} a modifié la négociation ${negoActuelle.reference}`,
              lien: `/negociations/${id}`,
            },
          });
        }

        // Ajouter un commentaire automatique pour tracer la modification
        await tx.negoCommentaire.create({
          data: {
            negociationId: id,
            userId: session.user.id,
            contenu: `📝 Négociation mise à jour`,
          },
        });
      }

      return updated;
    });

    return NextResponse.json(negociation);
  } catch (error) {
    console.error("Erreur PUT négociation:", error);
    return NextResponse.json({ error: "Erreur lors de la mise à jour" }, { status: 500 });
  }
}

// DELETE - Supprimer une négociation
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Vérifier qu'elle n'est pas déjà convertie
    const nego = await prisma.negociation.findUnique({
      where: { id: id },
      select: { collaborationId: true },
    });

    if (nego?.collaborationId) {
      return NextResponse.json(
        { message: "Impossible de supprimer, déjà convertie en collaboration" },
        { status: 400 }
      );
    }

    await prisma.negociation.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Supprimée" });
  } catch (error) {
    console.error("Erreur DELETE négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
