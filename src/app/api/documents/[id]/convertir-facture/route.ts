// src/app/api/documents/[id]/convertir-facture/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";

/**
 * POST /api/documents/[id]/convertir-facture
 * Convertit un devis accepté en facture
 */
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

    // Seuls ADMIN et HEAD_OF peuvent convertir des devis
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour convertir des devis" },
        { status: 403 }
      );
    }

    // Récupérer le devis
    const devis = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          include: {
            talent: true,
            marque: true,
          },
        },
      },
    });

    if (!devis) {
      return NextResponse.json({ error: "Devis non trouvé" }, { status: 404 });
    }

    if (devis.type !== "DEVIS") {
      return NextResponse.json(
        { error: "Ce document n'est pas un devis" },
        { status: 400 }
      );
    }

    if (devis.statut !== "VALIDE") {
      return NextResponse.json(
        { error: `Le devis doit être accepté (statut VALIDE) pour être converti. Statut actuel: ${devis.statut}` },
        { status: 400 }
      );
    }

    // Vérifier qu'il n'existe pas déjà une facture pour cette collaboration
    if (devis.collaborationId) {
      const existingFacture = await prisma.document.findFirst({
        where: {
          collaborationId: devis.collaborationId,
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

    // Générer le numéro de facture
    const referenceFacture = await genererNumeroDocument("FACTURE");

    // Créer la facture en copiant toutes les données du devis
    const facture = await prisma.document.create({
      data: {
        reference: referenceFacture,
        type: "FACTURE",
        statut: "BROUILLON", // Brouillon par défaut, l'utilisateur pourra l'envoyer ensuite
        collaborationId: devis.collaborationId,
        titre: devis.titre,
        montantHT: devis.montantHT,
        tauxTVA: devis.tauxTVA,
        montantTVA: devis.montantTVA,
        montantTTC: devis.montantTTC,
        typeTVA: devis.typeTVA,
        mentionTVA: devis.mentionTVA,
        lignes: devis.lignes as any, // Cast pour JsonValue
        dateDocument: new Date(),
        dateEmission: new Date(),
        dateEcheance: devis.dateEcheance,
        factureRef: devis.reference, // Référence au devis d'origine
        poClient: devis.poClient,
        modePaiement: devis.modePaiement,
        notes: devis.notes,
        createdById: user.id,
      },
    });

    // Mettre à jour le devis pour indiquer qu'il a été converti
    await prisma.document.update({
      where: { id: devis.id },
      data: {
        notes: `${devis.notes || ""}\n\nConverti en facture ${referenceFacture} le ${new Date().toLocaleDateString("fr-FR")}`.trim(),
      },
    });

    // Si lié à une collaboration, mettre à jour son statut
    if (devis.collaborationId) {
      await prisma.collaboration.update({
        where: { id: devis.collaborationId },
        data: { statut: "EN_COURS" },
      });

      // Créer une notification pour le TM
      if (devis.collaboration?.talent.managerId) {
        await prisma.notification.create({
          data: {
            userId: devis.collaboration.talent.managerId,
            type: "COLLAB_GAGNEE",
            titre: "Facture générée",
            message: `La facture ${referenceFacture} a été générée depuis le devis ${devis.reference}`,
            lien: `/collaborations/${devis.collaborationId}`,
            collabId: devis.collaborationId,
          },
        });
      }
    }

    return NextResponse.json({
      success: true,
      facture: {
        id: facture.id,
        reference: facture.reference,
        montantTTC: Number(facture.montantTTC),
        statut: facture.statut,
      },
      message: `Facture ${referenceFacture} créée avec succès depuis le devis ${devis.reference}`,
    });
  } catch (error) {
    console.error("Erreur conversion devis→facture:", error);
    return NextResponse.json(
      { error: "Erreur lors de la conversion du devis en facture" },
      { status: 500 }
    );
  }
}
