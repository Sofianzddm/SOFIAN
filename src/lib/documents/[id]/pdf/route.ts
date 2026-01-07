// src/app/api/documents/generate/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { getTypeTVA, MENTIONS_TVA, AGENCE_CONFIG } from "@/lib/documents/config";

interface LigneInput {
  description: string;
  quantite: number;
  prixUnitaire: number;
}

export async function POST(request: NextRequest) {
  try {
    const { id } = await params;
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    
    // Seuls ADMIN et HEAD_OF peuvent générer des documents
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour générer des documents" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      type, // DEVIS, FACTURE, BON_DE_COMMANDE
      collaborationId,
      lignes,
      titre,
      poClient,
      commentaires,
      dateDocument,
      delaiPaiementJours = 30,
    } = body;

    // Validation
    if (!type || !collaborationId || !lignes || lignes.length === 0) {
      return NextResponse.json(
        { error: "Données manquantes (type, collaborationId, lignes)" },
        { status: 400 }
      );
    }

    // Valider le type
    if (!["DEVIS", "FACTURE", "BON_DE_COMMANDE"].includes(type)) {
      return NextResponse.json(
        { error: "Type de document invalide" },
        { status: 400 }
      );
    }

    // Récupérer la collaboration avec toutes les infos
    const collaboration = await prisma.collaboration.findUnique({
      where: { id: collaborationId },
      include: {
        talent: true,
        marque: true,
      },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    const marque = collaboration.marque;
    const talent = collaboration.talent;

    // Générer le numéro de document
    const reference = await genererNumeroDocument(type as "DEVIS" | "FACTURE" | "BON_DE_COMMANDE" | "AVOIR");

    // Calculer la TVA selon le type de client
    const typeTVA = getTypeTVA(marque.pays || "France", marque.numeroTVA || null);
    const configTVA = MENTIONS_TVA[typeTVA];
    const tauxTVA = configTVA.tauxTVA;

    // Calculer les lignes et totaux
    const lignesCalculees = lignes.map((ligne: LigneInput) => ({
      description: ligne.description,
      quantite: ligne.quantite,
      prixUnitaire: ligne.prixUnitaire,
      tauxTVA: tauxTVA,
      totalHT: ligne.quantite * ligne.prixUnitaire,
    }));

    const montantHT = lignesCalculees.reduce((sum: number, l: { totalHT: number }) => sum + l.totalHT, 0);
    const montantTVA = montantHT * (tauxTVA / 100);
    const montantTTC = montantHT + montantTVA;

    // Dates
    const now = new Date();
    const dateDoc = dateDocument ? new Date(dateDocument) : now;
    const dateEcheance = new Date(dateDoc);
    dateEcheance.setDate(dateEcheance.getDate() + delaiPaiementJours);
    // Fin de mois
    dateEcheance.setMonth(dateEcheance.getMonth() + 1);
    dateEcheance.setDate(0);

    // Titre automatique
    const titreAuto = titre || `${talent.prenom} x ${marque.nom} - ${dateDoc.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}${poClient ? ` - ${poClient}` : ""}`;

    // Sauvegarder le document en BDD (sans PDF pour l'instant)
    const document = await prisma.document.create({
      data: {
        reference,
        type,
        statut: "BROUILLON",
        collaborationId,
        titre: titreAuto,
        montantHT,
        tauxTVA,
        montantTVA,
        montantTTC,
        typeTVA,
        mentionTVA: configTVA.mention,
        lignes: lignesCalculees,
        dateDocument: dateDoc,
        dateEmission: now,
        dateEcheance,
        poClient: poClient || null,
        modePaiement: "Virement",
        notes: commentaires || AGENCE_CONFIG.conditionsPaiement,
        createdById: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: document.id,
        reference: document.reference,
        type: document.type,
        montantTTC: Number(document.montantTTC),
        dateEcheance: document.dateEcheance,
      },
    });
  } catch (error) {
    console.error("Erreur génération document:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du document" },
      { status: 500 }
    );
  }
}
