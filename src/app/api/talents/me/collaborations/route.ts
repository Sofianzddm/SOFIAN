import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/talents/me/collaborations
 * Liste des collaborations du talent connecté
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Vérifier que l'utilisateur est bien un TALENT
    if (session.user.role !== "TALENT") {
      return NextResponse.json({ error: "Accès réservé aux talents" }, { status: 403 });
    }

    // Récupérer le talent associé à cet utilisateur
    const talent = await prisma.talent.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!talent) {
      return NextResponse.json({ error: "Aucun profil talent trouvé" }, { status: 404 });
    }

    // Récupérer toutes les collaborations du talent
    const collaborations = await prisma.collaboration.findMany({
      where: { talentId: talent.id },
      include: {
        marque: {
          select: { 
            id: true,
            nom: true,
            secteur: true,
          },
        },
        livrables: {
          orderBy: { createdAt: "asc" },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Formater les données pour le frontend
    const formatted = collaborations.map(c => ({
      id: c.id,
      reference: c.reference,
      marque: c.marque.nom,
      marqueId: c.marque.id,
      secteur: c.marque.secteur,
      montant: Number(c.montantNet),
      montantBrut: Number(c.montantBrut),
      commission: Number(c.commissionEuros),
      statut: c.statut,
      source: c.source,
      datePublication: c.datePublication,
      lienPublication: c.lienPublication,
      factureTalentUrl: c.factureTalentUrl,
      factureTalentRecueAt: c.factureTalentRecueAt,
      factureValidee: c.factureValidee,
      paidAt: c.paidAt,
      createdAt: c.createdAt,
      livrables: c.livrables.map(l => ({
        typeContenu: l.typeContenu,
        quantite: l.quantite,
        prixUnitaire: Number(l.prixUnitaire),
        description: l.description,
      })),
    }));

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("❌ Erreur GET /api/talents/me/collaborations:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des collaborations" },
      { status: 500 }
    );
  }
}
