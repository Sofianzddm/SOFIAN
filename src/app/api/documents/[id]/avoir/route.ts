// src/app/api/documents/[id]/avoir/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls ADMIN et HEAD_OF peuvent créer des avoirs
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour créer un avoir" },
        { status: 403 }
      );
    }

    // Récupérer la facture originale
    const facture = await prisma.document.findUnique({
      where: { id: id },
      include: {
        collaboration: true,
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
    }

    if (facture.type !== "FACTURE") {
      return NextResponse.json(
        { error: "Seule une facture peut être annulée par un avoir" },
        { status: 400 }
      );
    }

    if (facture.statut === "PAYE") {
      return NextResponse.json(
        { error: "Impossible de créer un avoir sur une facture payée" },
        { status: 400 }
      );
    }

    if (facture.avoirRef) {
      return NextResponse.json(
        { error: "Un avoir existe déjà pour cette facture" },
        { status: 400 }
      );
    }

    // Générer le numéro d'avoir
    const referenceAvoir = await genererNumeroDocument("AVOIR");

    // Créer l'avoir (montants négatifs)
    const avoir = await prisma.document.create({
      data: {
        reference: referenceAvoir,
        type: "AVOIR",
        statut: "VALIDE",
        collaborationId: facture.collaborationId,
        titre: `Avoir sur ${facture.reference}`,
        montantHT: facture.montantHT,
        tauxTVA: facture.tauxTVA,
        montantTVA: facture.montantTVA,
        montantTTC: facture.montantTTC,
        typeTVA: facture.typeTVA,
        mentionTVA: facture.mentionTVA,
        lignes: facture.lignes ?? undefined,
        dateDocument: new Date(),
        dateEmission: new Date(),
        factureRef: facture.reference, // Référence à la facture annulée
        modePaiement: facture.modePaiement,
        notes: `Avoir annulant la facture ${facture.reference}`,
        createdById: user.id,
      },
    });

    // Mettre à jour la facture originale pour indiquer qu'elle a un avoir
    await prisma.document.update({
      where: { id: facture.id },
      data: {
        statut: "ANNULE",
        avoirRef: referenceAvoir,
      },
    });

    return NextResponse.json({
      success: true,
      avoir: {
        id: avoir.id,
        reference: avoir.reference,
      },
      message: `Avoir ${referenceAvoir} créé. Vous pouvez maintenant générer une nouvelle facture.`,
    });
  } catch (error) {
    console.error("Erreur création avoir:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'avoir" },
      { status: 500 }
    );
  }
}
