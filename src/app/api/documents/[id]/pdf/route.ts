// src/app/api/documents/[id]/pdf/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { AGENCE_CONFIG } from "@/lib/documents/config";

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

    // Si le PDF existe déjà en base64, on le retourne
    if (document.pdfBase64) {
      const pdfBuffer = Buffer.from(document.pdfBase64, "base64");
      return new NextResponse(pdfBuffer, {
        headers: {
          "Content-Type": "application/pdf",
          "Content-Disposition": `inline; filename="${document.reference}.pdf"`,
          "Content-Length": pdfBuffer.length.toString(),
        },
      });
    }

    // Sinon, retourner les données pour génération côté client
    const marque = document.collaboration?.marque;
    const lignes = (document.lignes as any[]) || [];

    const pdfData = {
      type: document.type,
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
      client: marque ? {
        nom: marque.nom,
        adresse: marque.adresseRue || undefined,
        codePostal: marque.codePostal || undefined,
        ville: marque.ville || undefined,
        pays: marque.pays || undefined,
        tva: marque.numeroTVA || undefined,
      } : null,
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

    return NextResponse.json({ document: pdfData });
  } catch (error) {
    console.error("Erreur téléchargement PDF:", error);
    return NextResponse.json(
      { error: "Erreur lors de la génération du PDF" },
      { status: 500 }
    );
  }
}