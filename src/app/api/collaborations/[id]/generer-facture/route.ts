import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FactureTemplate } from "@/lib/documents/templates/FactureTemplate";
import type { FactureData, LigneFacture } from "@/lib/documents/templates/FactureTemplate";
import { createElement } from "react";
import path from "path";
import fs from "fs/promises";

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
    const { titre, dateEcheance, notes, lignes } = body;

    // Validation
    if (!titre || !lignes || lignes.length === 0) {
      return NextResponse.json(
        { error: "Titre et prestations requis" },
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

    // Vérifier le statut
    if (collab.statut !== "PUBLIE") {
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

    const tauxTVA = 20; // Par défaut
    const montantTVA = montantHT * (tauxTVA / 100);
    const montantTTC = montantHT + montantTVA;

    // Données de l'émetteur (Glow Up Agency)
    const agenceSettings = await prisma.agenceSettings.findUnique({
      where: { id: "default" },
    });

    if (!agenceSettings) {
      return NextResponse.json(
        { error: "Paramètres agence non configurés" },
        { status: 500 }
      );
    }

    // Préparer les données pour le template
    const factureData: FactureData = {
      reference,
      titre,
      dateDocument: new Date().toISOString(),
      dateEcheance: dateEcheance || new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      emetteur: {
        nom: agenceSettings.nom || "Glow Up Agency",
        adresse: agenceSettings.adresseRue || "22 Avenue Victor Hugo",
        codePostal: agenceSettings.codePostal || "13100",
        ville: agenceSettings.ville || "Aix-en-Provence",
        pays: agenceSettings.pays || "France",
        capital: Number(agenceSettings.capitalSocial) || 1000,
        siret: agenceSettings.siret || "",
        telephone: agenceSettings.telephone || "",
        email: agenceSettings.email || "contact@glowup-agence.com",
        tva: agenceSettings.numeroTVA || "",
        siren: agenceSettings.siret?.substring(0, 9) || "",
        rcs: agenceSettings.rcs || "",
        ape: "",
        iban: agenceSettings.iban || undefined,
        bic: agenceSettings.bic || undefined,
      },
      client: {
        nom: collab.talent.nom,
        prenom: collab.talent.prenom,
        adresse: collab.talent.adresse || undefined,
        codePostal: collab.talent.codePostal || undefined,
        ville: collab.talent.ville || undefined,
        pays: collab.talent.pays || undefined,
        siret: collab.talent.siret || undefined,
      },
      lignes: lignesFacture,
      montantHT,
      tauxTVA,
      montantTVA,
      montantTTC,
      notes: notes || undefined,
    };

    // Générer le PDF
    const pdfBuffer = await renderToBuffer(createElement(FactureTemplate, { data: factureData }) as any);

    // Sauvegarder le fichier
    const uploadDir = path.join(process.cwd(), "public/documents/factures");
    await fs.mkdir(uploadDir, { recursive: true });

    const filename = `${reference}.pdf`;
    const filepath = path.join(uploadDir, filename);
    await fs.writeFile(filepath, pdfBuffer);

    const pdfUrl = `/documents/factures/${filename}`;

    // Créer l'entrée Document dans la base
    const document = await prisma.document.create({
      data: {
        type: "FACTURE",
        reference,
        titre,
        dateEmission: new Date(),
        dateEcheance: new Date(dateEcheance || Date.now() + 30 * 24 * 60 * 60 * 1000),
        montantHT,
        montantTVA,
        montantTTC,
        fichierUrl: pdfUrl,
        statut: "BROUILLON",
        collaborationId: collab.id,
      },
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
      document,
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
