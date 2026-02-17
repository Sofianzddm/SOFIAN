// src/app/api/documents/[id]/remplacer/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { TypeDocument, StatutDocument } from "@prisma/client";

/**
 * Route POST : Remplacer une facture
 * 
 * Crée automatiquement :
 * 1. Un avoir TOTAL qui annule l'ancienne facture
 * 2. Annule l'ancienne facture (statut → ANNULE)
 * 3. Retourne les données pour créer une nouvelle facture
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seul ADMIN peut remplacer une facture
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seul un administrateur peut remplacer une facture" },
        { status: 403 }
      );
    }

    const { id: factureId } = await params;

    // Récupérer la facture d'origine avec toutes les infos
    const facture = await prisma.document.findUnique({
      where: { id: factureId },
      include: {
        collaboration: {
          include: {
            talent: {
              include: { manager: true },
            },
            marque: true,
          },
        },
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
    }

    if (facture.type !== "FACTURE") {
      return NextResponse.json(
        { error: "Cette action ne peut être faite que sur une facture" },
        { status: 400 }
      );
    }

    if (facture.statut === "ANNULE") {
      return NextResponse.json(
        { error: "Cette facture est déjà annulée" },
        { status: 400 }
      );
    }

    // === ÉTAPE 1 : Créer l'avoir TOTAL ===
    
    const referenceAvoir = await genererNumeroDocument("AVOIR");
    const tauxTVA = Number(facture.tauxTVA);

    // Récupérer les lignes de la facture et les inverser
    const lignesFacture = facture.lignes as any[];
    const lignesAvoir = lignesFacture.map((ligne: any) => ({
      description: ligne.description,
      quantite: -Math.abs(ligne.quantite),
      prixUnitaire: ligne.prixUnitaire,
      tauxTVA,
      totalHT: -Math.abs(ligne.totalHT),
    }));

    const montantHTAvoir = -Math.abs(Number(facture.montantHT));
    const montantTVAAvoir = -Math.abs(Number(facture.montantTVA));
    const montantTTCAvoir = -Math.abs(Number(facture.montantTTC));

    const now = new Date();

    // Créer l'avoir
    const avoir = await prisma.document.create({
      data: {
        reference: referenceAvoir,
        type: "AVOIR" as TypeDocument,
        statut: "ENVOYE" as StatutDocument,
        collaborationId: facture.collaborationId,
        titre: `AVOIR TOTAL sur ${facture.reference} - Remplacement de facture`,
        montantHT: montantHTAvoir,
        tauxTVA: facture.tauxTVA,
        montantTVA: montantTVAAvoir,
        montantTTC: montantTTCAvoir,
        typeTVA: facture.typeTVA,
        mentionTVA: facture.mentionTVA,
        lignes: lignesAvoir,
        dateDocument: now,
        dateEmission: now,
        factureRef: facture.reference,
        modePaiement: "Avoir",
        notes: `Avoir total suite au remplacement de la facture ${facture.reference}`,
        createdById: user.id,
      },
    });

    // === ÉTAPE 2 : Annuler l'ancienne facture ===
    
    await prisma.document.update({
      where: { id: factureId },
      data: {
        statut: "ANNULE" as StatutDocument,
        avoirRef: referenceAvoir,
      },
    });

    // === ÉTAPE 3 : Créer automatiquement la nouvelle facture ===
    
    const referenceNouvelleFacture = await genererNumeroDocument("FACTURE");

    const nouvelleFacture = await prisma.document.create({
      data: {
        reference: referenceNouvelleFacture,
        type: "FACTURE" as TypeDocument,
        statut: "BROUILLON" as StatutDocument, // En brouillon pour permettre les modifications
        collaborationId: facture.collaborationId,
        titre: facture.titre || `Facture ${referenceNouvelleFacture}`,
        montantHT: facture.montantHT,
        tauxTVA: facture.tauxTVA,
        montantTVA: facture.montantTVA,
        montantTTC: facture.montantTTC,
        typeTVA: facture.typeTVA,
        mentionTVA: facture.mentionTVA,
        lignes: lignesFacture,
        dateDocument: now,
        dateEcheance: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000), // +30 jours
        poClient: facture.poClient,
        modePaiement: facture.modePaiement,
        notes: facture.notes,
        createdById: user.id,
      },
    });
    
    return NextResponse.json({
      success: true,
      avoir: {
        id: avoir.id,
        reference: avoir.reference,
        montantTTC: Number(avoir.montantTTC),
      },
      ancienneFacture: {
        id: facture.id,
        reference: facture.reference,
      },
      nouvelleFacture: {
        id: nouvelleFacture.id,
        reference: nouvelleFacture.reference,
        montantTTC: Number(nouvelleFacture.montantTTC),
      },
      message: `✅ Avoir ${referenceAvoir} créé\n✅ Facture ${facture.reference} annulée\n✅ Nouvelle facture ${referenceNouvelleFacture} créée (brouillon)`,
    });
  } catch (error) {
    console.error("Erreur remplacement facture:", error);
    return NextResponse.json(
      { error: "Erreur lors du remplacement de la facture" },
      { status: 500 }
    );
  }
}
