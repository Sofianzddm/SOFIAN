import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Détail d'une collaboration
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const collaboration = await prisma.collaboration.findUnique({
      where: { id: id },
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, email: true, photo: true },
        },
        marque: {
          select: { 
            id: true, 
            nom: true, 
            secteur: true,
            raisonSociale: true,
            adresseRue: true,
            adresseComplement: true,
            codePostal: true,
            ville: true,
            pays: true,
            siret: true,
            numeroTVA: true,
          },
        },
        livrables: {
          orderBy: { createdAt: "asc" },
        },
        documents: {
          select: {
            id: true,
            reference: true,
            type: true,
            statut: true,
            montantTTC: true,
            dateEmission: true,
            avoirRef: true,
            factureRef: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    if (!collaboration) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }

    return NextResponse.json(collaboration);
  } catch (error) {
    console.error("Erreur GET collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// PATCH - Mettre à jour le statut
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userRole = session.user.role;
    const { id } = await params;
    const data = await request.json();

    // Vérifier les permissions pour le statut "PAYE"
    if (data.statut === "PAYE") {
      if (userRole !== "ADMIN") {
        return NextResponse.json({ 
          error: "Seuls les ADMIN peuvent marquer une collaboration comme payée" 
        }, { status: 403 });
      }
    }

    if (data.statut === "PERDU" && !data.raisonPerdu) {
      return NextResponse.json({ message: "Raison obligatoire" }, { status: 400 });
    }

    const updateData: any = {};

    if (data.statut) updateData.statut = data.statut;
    if (data.raisonPerdu !== undefined) updateData.raisonPerdu = data.raisonPerdu;
    if (data.lienPublication !== undefined) updateData.lienPublication = data.lienPublication;
    if (data.datePublication !== undefined) updateData.datePublication = new Date(data.datePublication);
    if (data.statut === "PAYE") updateData.paidAt = new Date();

    const collaboration = await prisma.collaboration.update({
      where: { id: id },
      data: updateData,
      include: {
        talent: { select: { id: true, prenom: true, nom: true, email: true, photo: true } },
        marque: { 
          select: { 
            id: true, 
            nom: true, 
            secteur: true,
            raisonSociale: true,
            adresseRue: true,
            adresseComplement: true,
            codePostal: true,
            ville: true,
            pays: true,
            siret: true,
            numeroTVA: true,
          } 
        },
        livrables: true,
        documents: {
          select: {
            id: true,
            reference: true,
            type: true,
            statut: true,
            montantTTC: true,
            dateEmission: true,
            avoirRef: true,
            factureRef: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json(collaboration);
  } catch (error) {
    console.error("Erreur PATCH collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// PUT - Mettre à jour une collaboration complète (avec livrables)
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    // Supprimer les anciens livrables
    await prisma.collabLivrable.deleteMany({
      where: { collaborationId: id },
    });

    // Mettre à jour la collaboration
    const collaboration = await prisma.collaboration.update({
      where: { id: id },
      data: {
        talentId: data.talentId,
        marqueId: data.marqueId,
        source: data.source,
        description: data.description || null,
        montantBrut: parseFloat(data.montantBrut),
        commissionPercent: parseFloat(data.commissionPercent),
        commissionEuros: parseFloat(data.commissionEuros),
        montantNet: parseFloat(data.montantNet),
        isLongTerme: data.isLongTerme || false,
        livrables: {
          create: data.livrables.map((l: any) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite || 1,
            prixUnitaire: parseFloat(l.prixUnitaire) || 0,
            description: l.description || null,
          })),
        },
      },
      include: {
        livrables: true,
        documents: {
          select: {
            id: true,
            reference: true,
            type: true,
            statut: true,
            montantTTC: true,
            dateEmission: true,
            avoirRef: true,
            factureRef: true,
          },
          orderBy: { createdAt: "desc" },
        },
      },
    });

    return NextResponse.json(collaboration);
  } catch (error) {
    console.error("Erreur PUT collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// DELETE - Supprimer une collaboration
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    // Vérifier l'authentification et les permissions
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const userRole = session.user.role;
    
    // Seuls les ADMIN et HEAD_OF peuvent supprimer une collaboration
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(userRole)) {
      return NextResponse.json({ 
        error: "Permissions insuffisantes pour supprimer une collaboration" 
      }, { status: 403 });
    }

    const { id } = await params;
    
    // Les livrables sont supprimés en cascade (onDelete: Cascade)
    await prisma.collaboration.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Supprimée" });
  } catch (error) {
    console.error("Erreur DELETE collaboration:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
