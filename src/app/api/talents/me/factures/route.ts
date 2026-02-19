import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

/**
 * GET /api/talents/me/factures
 * Liste des factures que le talent nous a envoyées (uploadées).
 * Le talent n'a JAMAIS accès aux factures client.
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    if (session.user.role !== "TALENT") {
      return NextResponse.json(
        { error: "Accès réservé aux talents" },
        { status: 403 }
      );
    }

    // Récupérer le talent associé à cet utilisateur
    const talent = await prisma.talent.findUnique({
      where: { userId: session.user.id },
      select: { id: true },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Aucun profil talent trouvé" },
        { status: 404 }
      );
    }

    // Uniquement les factures que le talent nous a envoyées (uploadées)
    const collaborations = await prisma.collaboration.findMany({
      where: {
        talentId: talent.id,
        factureTalentUrl: { not: null },
      },
      include: {
        marque: {
          select: { nom: true },
        },
      },
      orderBy: { factureTalentRecueAt: "desc" },
    });

    const formatted = collaborations.map((collab) => {
      let statutTalent = "FACTURE_RECUE";
      if (collab.paidAt) {
        statutTalent = "PAYE";
      }

      return {
        id: collab.id,
        reference: `Facture ${collab.marque?.nom || "collab"}`.trim(),
        marque: collab.marque?.nom || "",
        dateEmission: collab.factureTalentRecueAt || collab.createdAt,
        montant: Number(collab.montantNet ?? 0),
        statut: statutTalent,
        pdfUrl: collab.factureTalentUrl, // Lien direct vers SA facture uploadée
      };
    });

    return NextResponse.json(formatted);
  } catch (error) {
    console.error("❌ Erreur GET /api/talents/me/factures:", error);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des factures" },
      { status: 500 }
    );
  }
}

