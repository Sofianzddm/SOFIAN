// src/app/api/documents/avoir/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FactureTemplate } from "@/lib/documents/templates/FactureTemplate";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { AGENCE_CONFIG } from "@/lib/documents/config";

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seul ADMIN peut créer des avoirs
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seul un administrateur peut créer un avoir" },
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

    // Récupérer la facture d'origine
    const facture = await prisma.document.findUnique({
      where: { id: factureId },
      include: {
        collaboration: {
          include: {
            talent: true,
            marque: {
              include: {
                contacts: { where: { principal: true }, take: 1 },
              },
            },
          },
        },
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
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
    const lignesCalculees = lignes.map((ligne: any) => ({
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
    const collab = facture.collaboration;
    const marque = collab?.marque;
    const talent = collab?.talent;
    const contactPrincipal = marque?.contacts[0];

    // Construire les données du document
    const documentData = {
      reference,
      type: "AVOIR",
      dateDocument: now,
      dateEmission: now,
      dateEcheance: now, // Pas d'échéance pour un avoir
      factureRef: facture.reference,
      talent: talent ? {
        prenom: talent.prenom,
        nom: talent.nom,
        instagram: talent.instagram,
      } : { prenom: "", nom: "" },
      marque: {
        nom: marque?.nom || "",
      },
      client: {
        raisonSociale: marque?.raisonSociale || marque?.nom || "",
        contactNom: contactPrincipal?.nom,
        adresse: marque?.adresseRue || "",
        codePostal: marque?.codePostal || "",
        ville: marque?.ville || "",
        pays: marque?.pays || "France",
        tvaIntracom: marque?.numeroTVA,
        siret: marque?.siret,
      },
      titre: `AVOIR sur ${facture.reference} - Motif: ${motif}`,
      lignes: lignesCalculees,
      montantHT,
      montantTVA,
      montantTTC,
      tauxTVA,
      modePaiement: "Avoir",
      commentaires: `Avoir sur facture ${facture.reference}\nMotif: ${motif}`,
    };

    // Générer le PDF
    const pdfBuffer = await renderToBuffer(
      // @ts-ignore
      <FactureTemplate data={documentData} includeCGV={false} />
    );
    const pdfBase64 = pdfBuffer.toString("base64");

    // Sauvegarder l'avoir
    const avoir = await prisma.document.create({
      data: {
        reference,
        type: "AVOIR",
        statut: "BROUILLON",
        collaborationId: facture.collaborationId,
        titre: documentData.titre,
        montantHT,
        tauxTVA,
        montantTVA,
        montantTTC,
        lignes: JSON.stringify(lignesCalculees),
        dateEmission: now,
        notes: documentData.commentaires,
        pdfBase64,
      },
    });

    // Mettre à jour la facture avec la référence de l'avoir
    await prisma.document.update({
      where: { id: factureId },
      data: { 
        statut: "ANNULE",
        notes: `${facture.notes || ""}\n\nAvoir créé: ${reference}`,
      },
    });

    return NextResponse.json({
      success: true,
      avoir: {
        id: avoir.id,
        reference: avoir.reference,
        montantTTC: Number(avoir.montantTTC),
        factureRef: facture.reference,
      },
      pdf: pdfBase64,
    });
  } catch (error) {
    console.error("Erreur génération avoir:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération de l'avoir" },
      { status: 500 }
    );
  }
}