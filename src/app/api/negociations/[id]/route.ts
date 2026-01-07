import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET - Détail d'une négociation
export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const negociation = await prisma.negociation.findUnique({
      where: { id: params.id },
      include: {
        tm: {
          select: { id: true, prenom: true, nom: true, email: true },
        },
        talent: {
          select: { 
            id: true, 
            prenom: true, 
            nom: true, 
            photo: true,
            commissionInbound: true,
            commissionOutbound: true,
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
  { params }: { params: { id: string } }
) {
  try {
    const data = await request.json();

    // Supprimer les anciens livrables
    await prisma.negoLivrable.deleteMany({
      where: { negociationId: params.id },
    });

    const negociation = await prisma.negociation.update({
      where: { id: params.id },
      data: {
        talentId: data.talentId,
        marqueId: data.marqueId,
        contactMarque: data.contactMarque || null,
        emailContact: data.emailContact || null,
        source: data.source,
        brief: data.brief || null,
        budgetMarque: data.budgetMarque ? parseFloat(data.budgetMarque) : null,
        budgetSouhaite: data.budgetSouhaite ? parseFloat(data.budgetSouhaite) : null,
        budgetFinal: data.budgetFinal ? parseFloat(data.budgetFinal) : null,
        dateDeadline: data.dateDeadline ? new Date(data.dateDeadline) : null,
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

    return NextResponse.json(negociation);
  } catch (error) {
    console.error("Erreur PUT négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// DELETE - Supprimer une négociation
export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    // Vérifier qu'elle n'est pas déjà convertie
    const nego = await prisma.negociation.findUnique({
      where: { id: params.id },
      select: { collaborationId: true },
    });

    if (nego?.collaborationId) {
      return NextResponse.json(
        { message: "Impossible de supprimer, déjà convertie en collaboration" },
        { status: 400 }
      );
    }

    await prisma.negociation.delete({
      where: { id: params.id },
    });

    return NextResponse.json({ message: "Supprimée" });
  } catch (error) {
    console.error("Erreur DELETE négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
