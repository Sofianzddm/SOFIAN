import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/talents/me/dashboard
 * Dashboard du talent connecté (portail talent)
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

    // Récupérer les collaborations du talent
    const collaborations = await prisma.collaboration.findMany({
      where: { talentId: talent.id },
      include: {
        marque: {
          select: { nom: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    // Stats globales
    const stats = {
      totalCollabs: collaborations.length,
      enCours: collaborations.filter(c => 
        ["GAGNE", "EN_COURS"].includes(c.statut)
      ).length,
    };

    // Collabs en cours (GAGNE ou EN_COURS)
    const collabsEnCours = collaborations
      .filter(c => ["GAGNE", "EN_COURS"].includes(c.statut))
      .map(c => ({
        id: c.id,
        reference: c.reference,
        marque: c.marque.nom,
        montant: Number(c.montantNet),
        statut: c.statut,
      }));

    // ⚠️ FACTURES EN ATTENTE : Collabs PUBLIEES sans facture uploadée
    const facturesAttente = collaborations
      .filter(c => c.statut === "PUBLIE" && !c.factureTalentUrl)
      .map(c => ({
        id: c.id,
        reference: c.reference,
        marque: c.marque.nom,
        montant: Number(c.montantNet),
        datePublication: c.datePublication,
      }));

    return NextResponse.json({
      stats,
      collabsEnCours,
      facturesAttente,
    });
  } catch (error) {
    console.error("❌ Erreur GET /api/talents/me/dashboard:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des données" },
      { status: 500 }
    );
  }
}
