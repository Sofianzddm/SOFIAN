import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FactureTemplate } from "@/lib/documents/templates/FactureTemplate";
import type { FactureData, LigneFacture } from "@/lib/documents/templates/FactureTemplate";
import { createElement } from "react";
import { getTypeTVA, getMentionTVA, MENTIONS_TVA, AGENCE_CONFIG } from "@/lib/documents/config";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: collabId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls ADMIN, HEAD_OF et TM peuvent générer des factures
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"].includes(user.role)) {
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }
    const body = await request.json();
    const { titre, dateEcheance, notes, lignes, billing } = body;

    // Validation
    if (!titre || !lignes || lignes.length === 0) {
      return NextResponse.json(
        { error: "Titre et prestations requis" },
        { status: 400 }
      );
    }
    if (!billing?.raisonSociale || !billing?.adresseRue || !billing?.codePostal || !billing?.ville || !billing?.pays) {
      return NextResponse.json(
        { error: "Informations de facturation requises (raison sociale, adresse, code postal, ville, pays)" },
        { status: 400 }
      );
    }

    // Récupérer la collaboration avec talent, marque et TM
    const collab = await prisma.collaboration.findUnique({
      where: { id: collabId },
      include: {
        talent: {
          include: {
            manager: true,
          },
        },
        marque: true,
      },
    });

    if (!collab) {
      return NextResponse.json(
        { error: "Collaboration introuvable" },
        { status: 404 }
      );
    }

    // Vérifier le statut (PUBLIE ou FACTURE_RECUE si ancienne facture annulée par un avoir)
    if (!["PUBLIE", "FACTURE_RECUE"].includes(collab.statut)) {
      return NextResponse.json(
        { error: "La collaboration doit être publiée pour générer une facture" },
        { status: 400 }
      );
    }

    // Vérifier les permissions (TM ne peut facturer que ses talents)
    if (user.role === "TM" && collab.talent.managerId !== user.id) {
      return NextResponse.json(
        { error: "Vous ne pouvez facturer que vos propres talents" },
        { status: 403 }
      );
    }

    // Générer la référence facture
    const annee = new Date().getFullYear();
    const compteur = await prisma.compteur.upsert({
      where: {
        type_annee: {
          type: "FAC",
          annee,
        },
      },
      update: {
        dernierNumero: { increment: 1 },
      },
      create: {
        type: "FAC",
        annee,
        dernierNumero: 1,
      },
    });

    const reference = `FAC-${annee}-${String(compteur.dernierNumero).padStart(4, "0")}`;

    // Calculer les montants
    let montantHT = 0;
    const lignesFacture: LigneFacture[] = lignes.map((ligne: any) => {
      const totalHT = ligne.quantite * ligne.prixUnitaire;
      montantHT += totalHT;
      return {
        description: ligne.description,
        quantite: ligne.quantite,
        prixUnitaire: ligne.prixUnitaire,
        tauxTVA: ligne.tauxTVA || 20,
        totalHT,
      };
    });

    // Régime TVA selon pays + n° TVA (France 20%, UE avec n° TVA 0% autoliquidation, etc.)
    const typeTVA = getTypeTVA(billing.pays, billing.numeroTVA || null);
    const { tauxTVA: tauxTVAApplicable } = MENTIONS_TVA[typeTVA];
    const mentionTVA = getMentionTVA(typeTVA, billing.numeroTVA || null);
    const montantTVA = montantHT * (tauxTVAApplicable / 100);
    const montantTTC = montantHT + montantTVA;
    // Aligner les lignes sur le taux applicable
    lignesFacture.forEach((l) => { l.tauxTVA = tauxTVAApplicable; });

    // Émetteur = même identité que le devis (AGENCE_CONFIG / Glow Up Agency)
    const factureData: FactureData = {
      reference,
      titre,
      dateDocument: new Date().toISOString(),
      dateEcheance: dateEcheance || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      emetteur: {
        nom: AGENCE_CONFIG.raisonSociale,
        adresse: AGENCE_CONFIG.adresse,
        codePostal: AGENCE_CONFIG.codePostal,
        ville: AGENCE_CONFIG.ville,
        pays: AGENCE_CONFIG.pays,
        capital: AGENCE_CONFIG.capital,
        siret: AGENCE_CONFIG.siret,
        siren: AGENCE_CONFIG.siren,
        telephone: AGENCE_CONFIG.telephone,
        email: AGENCE_CONFIG.email,
        tva: AGENCE_CONFIG.tva,
        rcs: AGENCE_CONFIG.rcs,
        ape: AGENCE_CONFIG.ape,
        iban: AGENCE_CONFIG.rib?.iban || undefined,
        bic: AGENCE_CONFIG.rib?.bic || undefined,
      },
      client: {
        nom: billing.raisonSociale,
        adresse: billing.adresseRue || undefined,
        codePostal: billing.codePostal || undefined,
        ville: billing.ville || undefined,
        pays: billing.pays || undefined,
        tva: billing.numeroTVA || undefined,
        siret: billing.siret || undefined,
      },
      lignes: lignesFacture,
      montantHT,
      tauxTVA: tauxTVAApplicable,
      montantTVA,
      montantTTC,
      mentionTVA: mentionTVA ?? undefined,
      notes: notes || undefined,
    };

    // Générer le PDF (en mémoire uniquement : pas d'écriture disque pour compatibilité production / serverless)
    const pdfBuffer = await renderToBuffer(createElement(FactureTemplate, { data: factureData }) as any);

    // Créer l'entrée Document dans la base avec le PDF en base64 (servi via /api/documents/[id]/pdf)
    const document = await prisma.document.create({
      data: {
        type: "FACTURE",
        reference,
        titre,
        dateDocument: new Date(),
        dateEmission: new Date(),
        dateEcheance: new Date(dateEcheance || Date.now() + 30 * 24 * 60 * 60 * 1000),
        montantHT,
        montantTVA,
        montantTTC,
        tauxTVA: tauxTVAApplicable,
        typeTVA,
        mentionTVA: mentionTVA ?? null,
        lignes: lignesFacture.map((l) => ({
          description: l.description,
          quantite: l.quantite,
          prixUnitaire: l.prixUnitaire,
          tauxTVA: l.tauxTVA,
          totalHT: l.totalHT,
        })) as any,
        notes: notes || null,
        pdfBase64: pdfBuffer.toString("base64"),
        statut: "VALIDE",
        dateValidation: new Date(),
        collaborationId: collab.id,
        createdById: user.id,
      },
    });

    await prisma.documentEvent.create({
      data: {
        documentId: document.id,
        type: "REGISTERED",
        description: "Enregistrement (création facture)",
        userId: user.id,
      },
    });

    // Lien de téléchargement via l'API (fonctionne en local et en production)
    const pdfUrl = `/api/documents/${document.id}/pdf`;
    await prisma.document.update({
      where: { id: document.id },
      data: { fichierUrl: pdfUrl },
    });

    // Mettre à jour la collaboration
    await prisma.collaboration.update({
      where: { id: collabId },
      data: {
        statut: "FACTURE_RECUE",
      },
    });

    return NextResponse.json({
      message: "Facture générée avec succès",
      document: { ...document, fichierUrl: pdfUrl },
      pdfUrl,
    });
  } catch (error) {
    console.error("Erreur génération facture:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de la facture" },
      { status: 500 }
    );
  }
}
