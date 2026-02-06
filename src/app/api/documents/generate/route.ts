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
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    
    // ADMIN, HEAD_OF, HEAD_OF_SALES, et TM peuvent générer des documents
    const rolesAutorises = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"];
    if (!rolesAutorises.includes(user.role)) {
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
        talent: {
          include: {
            manager: true,
          },
        },
        marque: true,
      },
    });

    if (!collaboration) {
      return NextResponse.json(
        { error: "Collaboration non trouvée" },
        { status: 404 }
      );
    }

    // Vérifier que le TM ne peut créer que pour ses propres talents
    if (user.role === "TM" && collaboration.talent.managerId !== user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez créer des factures que pour vos propres talents" },
        { status: 403 }
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
    
    // Calcul correct de la date d'échéance : paiement à X jours fin du mois
    // Ex: facture du 15 janvier + 30j fin de mois = 28/29 février
    const dateEcheance = new Date(dateDoc);
    dateEcheance.setDate(dateEcheance.getDate() + delaiPaiementJours);
    // Aller au dernier jour du mois de l'échéance
    dateEcheance.setMonth(dateEcheance.getMonth() + 1);
    dateEcheance.setDate(0);

    // Titre automatique
    const titreAuto = titre || `${talent.prenom} x ${marque.nom} - ${dateDoc.toLocaleDateString("fr-FR", { month: "long", year: "numeric" })}${poClient ? ` - ${poClient}` : ""}`;

    // Vérifier qu'il n'existe pas déjà une facture pour cette collaboration
    if (type === "FACTURE") {
      const existingFacture = await prisma.document.findFirst({
        where: {
          collaborationId,
          type: "FACTURE",
          statut: { notIn: ["ANNULE"] },
        },
      });

      if (existingFacture) {
        return NextResponse.json(
          { error: `Une facture existe déjà pour cette collaboration (${existingFacture.reference})` },
          { status: 400 }
        );
      }
    }

    // Sauvegarder le document en BDD
    const document = await prisma.document.create({
      data: {
        reference,
        type,
        statut: "BROUILLON", // Toujours en brouillon au début, validation manuelle ensuite
        collaborationId,
        titre: titreAuto,
        montantHT: montantHT as any, // Cast pour Decimal
        tauxTVA: tauxTVA as any, // Cast pour Decimal
        montantTVA: montantTVA as any, // Cast pour Decimal
        montantTTC: montantTTC as any, // Cast pour Decimal
        typeTVA,
        mentionTVA: configTVA.mention,
        lignes: lignesCalculees as any, // Cast pour Json
        dateDocument: dateDoc,
        dateEmission: now,
        dateEcheance,
        poClient: poClient || null,
        modePaiement: "Virement bancaire",
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