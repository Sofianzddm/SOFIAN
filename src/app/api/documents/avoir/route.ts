// src/app/api/documents/avoir/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { TypeDocument, StatutDocument } from "@prisma/client";
import { getTalentIdsAccessibles } from "@/lib/delegations";

interface LigneInput {
  description: string;
  quantite: number;
  prixUnitaire: number;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // ADMIN, HEAD_OF, HEAD_OF_INFLUENCE et TM peuvent créer des avoirs
    const rolesAutorises = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"];
    if (!rolesAutorises.includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour créer un avoir" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { factureId, motif, lignes } = body;

    if (!factureId || !motif || !lignes || lignes.length === 0) {
      return NextResponse.json(
        { error: "Données manquantes (factureId, motif, lignes)" },
        { status: 400 }
      );
    }

    // Récupérer la facture d'origine (avec collaboration pour retrouver le talent)
    const facture = await prisma.document.findUnique({
      where: { id: factureId },
      include: {
        collaboration: {
          select: { talentId: true },
        },
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
    }

    // Pour une TM, vérifier que le talent de la collab fait partie de ses talents accessibles
    if (user.role === "TM") {
      const talentId = facture.collaboration?.talentId;
      if (!talentId) {
        return NextResponse.json(
          { error: "Impossible de déterminer le talent associé à cette facture" },
          { status: 403 }
        );
      }

      const talentsAccessibles = await getTalentIdsAccessibles(user.id);
      if (!talentsAccessibles.includes(talentId)) {
        return NextResponse.json(
          {
            error:
              "Vous ne pouvez créer un avoir que pour des talents qui vous sont accessibles",
          },
          { status: 403 }
        );
      }
    }

    if (facture.type !== "FACTURE") {
      return NextResponse.json(
        { error: "Un avoir ne peut être créé que sur une facture" },
        { status: 400 }
      );
    }

    // Générer le numéro d'avoir
    const reference = await genererNumeroDocument("AVOIR");

    // Calculer les lignes (montants négatifs pour un avoir)
    const tauxTVA = Number(facture.tauxTVA);
    const lignesCalculees = lignes.map((ligne: LigneInput) => ({
      description: ligne.description,
      quantite: -Math.abs(ligne.quantite), // Négatif
      prixUnitaire: ligne.prixUnitaire,
      tauxTVA,
      totalHT: -Math.abs(ligne.quantite * ligne.prixUnitaire), // Négatif
    }));

    const montantHT = lignesCalculees.reduce((sum: number, l: any) => sum + l.totalHT, 0);
    const montantTVA = montantHT * (tauxTVA / 100);
    const montantTTC = montantHT + montantTVA;

    const now = new Date();

    // Sauvegarder l'avoir
    const avoir = await prisma.document.create({
      data: {
        reference,
        type: "AVOIR" as TypeDocument,
        statut: "ENVOYE" as StatutDocument, // Un avoir est directement envoyé
        collaborationId: facture.collaborationId,
        titre: `AVOIR sur ${facture.reference} - Motif: ${motif}`,
        montantHT,
        tauxTVA,
        montantTVA,
        montantTTC,
        typeTVA: facture.typeTVA,
        mentionTVA: facture.mentionTVA,
        lignes: lignesCalculees,
        dateDocument: now,
        dateEmission: now,
        factureRef: facture.reference,
        modePaiement: "Avoir",
        notes: `Avoir sur facture ${facture.reference}\nMotif: ${motif}`,
        createdById: user.id,
      },
    });

    // Lier l'avoir à la facture (mais NE PAS annuler la facture)
    // Une facture peut avoir plusieurs avoirs partiels
    await prisma.document.update({
      where: { id: factureId },
      data: { 
        avoirRef: reference,
        // Ne pas changer le statut ! L'avoir vient en déduction
      },
    });

    // Si l'avoir annule TOTALEMENT la facture, on peut mettre un flag
    const totalAvoirsSurFacture = Math.abs(montantTTC);
    const montantFactureOriginal = Math.abs(Number(facture.montantTTC));
    
    if (totalAvoirsSurFacture >= montantFactureOriginal) {
      // C'est un avoir total, on peut marquer la facture comme annulée
      await prisma.document.update({
        where: { id: factureId },
        data: { statut: "ANNULE" as StatutDocument },
      });
    }

    return NextResponse.json({
      success: true,
      avoir: {
        id: avoir.id,
        reference: avoir.reference,
        montantTTC: Number(avoir.montantTTC),
        factureRef: facture.reference,
      },
    });
  } catch (error) {
    console.error("Erreur génération avoir:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'avoir" },
      { status: 500 }
    );
  }
}
