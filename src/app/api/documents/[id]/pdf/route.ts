// src/app/api/documents/[id]/pdf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { renderToBuffer } from "@react-pdf/renderer";
import { FactureTemplate } from "@/lib/documents/templates/FactureTemplate";
import { AGENCE_CONFIG } from "@/lib/documents/config";
import React from "react";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    // Récupérer le document avec les relations
    const document = await prisma.document.findUnique({
      where: { id: id },
      include: {
        collaboration: {
          include: {
            marque: true,
            talent: true,
          },
        },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    let pdfBuffer: Buffer;

    // Si le PDF existe déjà en base64, on le retourne
    if (document.pdfBase64) {
      pdfBuffer = Buffer.from(document.pdfBase64, "base64");
    } else {
      // Sinon, on le génère à la volée
      const marque = document.collaboration?.marque;
      
      if (!marque) {
        return NextResponse.json({ error: "Marque non trouvée" }, { status: 404 });
      }

      const lignes = (document.lignes as any[]) || [];

      const pdfData = {
        type: document.type as "DEVIS" | "FACTURE" | "AVOIR" | "BON_DE_COMMANDE",
        reference: document.reference,
        titre: document.titre || "",
        dateDocument: document.dateDocument?.toISOString() || new Date().toISOString(),
        dateEcheance: document.dateEcheance?.toISOString() || new Date().toISOString(),
        poClient: document.poClient || undefined,
        emetteur: {
          nom: AGENCE_CONFIG.raisonSociale,
          adresse: AGENCE_CONFIG.adresse,
          codePostal: AGENCE_CONFIG.codePostal,
          ville: AGENCE_CONFIG.ville,
          siret: AGENCE_CONFIG.siret,
          tva: AGENCE_CONFIG.tva,
        },
        client: {
          nom: marque.nom,
          adresse: marque.adresseRue || undefined,
          codePostal: marque.codePostal || undefined,
          ville: marque.ville || undefined,
          pays: marque.pays || undefined,
          tva: marque.numeroTVA || undefined,
        },
        lignes: lignes.map((l: any) => ({
          description: l.description || "",
          quantite: l.quantite || 1,
          prixUnitaire: l.prixUnitaire || 0,
          tauxTVA: l.tauxTVA || Number(document.tauxTVA) || 0,
          totalHT: l.totalHT || (l.quantite || 1) * (l.prixUnitaire || 0),
        })),
        montantHT: Number(document.montantHT) || 0,
        tauxTVA: Number(document.tauxTVA) || 0,
        montantTVA: Number(document.montantTVA) || 0,
        montantTTC: Number(document.montantTTC) || 0,
        mentionTVA: document.mentionTVA || "",
        modePaiement: document.modePaiement || "Virement bancaire",
        rib: {
          banque: "QONTO",
          iban: AGENCE_CONFIG.rib.iban,
          bic: AGENCE_CONFIG.rib.bic,
        },
        notes: document.notes || undefined,
      };

      pdfBuffer = await renderToBuffer(
        React.createElement(FactureTemplate, { data: pdfData })
      );

      // Optionnel : sauvegarder le PDF généré en BDD pour la prochaine fois
      await prisma.document.update({
        where: { id: id },
        data: { pdfBase64: pdfBuffer.toString("base64") },
      });
    }

    // Retourner le PDF
    return new NextResponse(pdfBuffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${document.reference}.pdf"`,
        "Content-Length": pdfBuffer.length.toString(),
      },
    });
  } catch (error) {
    console.error("Erreur téléchargement PDF:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}