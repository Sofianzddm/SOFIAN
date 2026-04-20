// src/app/api/factures/standalone/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { getTypeTVA, getMentionTVA, AGENCE_CONFIG } from "@/lib/documents/config";
import { renderToBuffer } from "@react-pdf/renderer";
import { createElement } from "react";
import {
  FactureTemplate,
  type FactureData,
  type LigneFacture,
} from "@/lib/documents/templates/FactureTemplate";

interface LigneInput {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    if (!["ADMIN", "HEAD_OF_SALES"].includes(user.role)) {
      return NextResponse.json(
        { error: "Seuls les ADMIN ou HEAD_OF_SALES peuvent créer des factures libres" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      clientNom,
      clientEmail,
      clientAdresse,
      objet,
      dateDocument,
      conditionsReglement, // "30", "45", "60", "0"
      conditionsReglementLibre,
      modePaiement = "Virement",
      lignes,
      notes,
      pays,
    } = body as {
      clientNom: string;
      clientEmail?: string;
      clientAdresse?: string;
      objet?: string;
      dateDocument?: string;
      conditionsReglement?: string;
      conditionsReglementLibre?: string;
      modePaiement?: string;
      lignes: LigneInput[];
      notes?: string;
      pays?: string;
    };

    if (!clientNom || !lignes || !Array.isArray(lignes) || lignes.length === 0) {
      return NextResponse.json(
        { error: "clientNom et au moins une ligne de facturation sont requis" },
        { status: 400 }
      );
    }

    const reference = await genererNumeroDocument("FACTURE");

    const dateDoc = dateDocument ? new Date(dateDocument) : new Date();
    const delaiMap: Record<string, number> = {
      "0": 0,
      "30": 30,
      "45": 45,
      "60": 60,
    };
    const extractedDelai = Number((conditionsReglementLibre || "").match(/(\d+)\s*jours?/i)?.[1]);
    const delaiFromCustom = Number.isFinite(extractedDelai) && extractedDelai >= 0 ? extractedDelai : undefined;
    const delai =
      String(conditionsReglement) === "CUSTOM"
        ? (delaiFromCustom ?? 30)
        : (delaiMap[String(conditionsReglement)] ?? 30);

    const dateEcheance = new Date(dateDoc);
    if (delai > 0) {
      dateEcheance.setDate(dateEcheance.getDate() + delai);
      dateEcheance.setMonth(dateEcheance.getMonth() + 1);
      dateEcheance.setDate(0);
    }

    const lignesCalculees = lignes.map((l) => {
      const q = l.quantite || 1;
      const pu = l.prixUnitaire || 0;
      const tva = typeof l.tauxTVA === "number" ? l.tauxTVA : 0;
      const totalHT = q * pu;
      const totalTVA = totalHT * (tva / 100);
      return {
        description: l.description,
        quantite: q,
        prixUnitaire: pu,
        tauxTVA: tva,
        totalHT,
        totalTVA,
      };
    });

    const montantHT = lignesCalculees.reduce(
      (sum, l) => sum + (l.prixUnitaire || 0) * (l.quantite || 0),
      0
    );
    const montantTVA = lignesCalculees.reduce(
      (sum, l) =>
        sum +
        (l.prixUnitaire || 0) * (l.quantite || 0) * ((l.tauxTVA || 0) / 100),
      0
    );
    const montantTTC = montantHT + montantTVA;
    const tauxTVA =
      lignesCalculees.length > 0 ? lignesCalculees[0].tauxTVA || 0 : 20;

    const paysClient = pays || "France";
    const typeTVA = getTypeTVA(paysClient, null);
    const mentionTVA = getMentionTVA(typeTVA, null);

    const conditionPaiementLabel =
      String(conditionsReglement) === "CUSTOM" && conditionsReglementLibre?.trim()
        ? conditionsReglementLibre.trim()
        : delai === 0
        ? "Paiement comptant à réception de la facture."
        : `Paiement sous ${delai} jours fin de mois à réception de facture.`;

    const commentaireTVA =
      paysClient === "France"
        ? `TVA ${tauxTVA}% — ${conditionPaiementLabel}`
        : paysClient === "UE"
        ? `TVA non applicable – autoliquidation par le preneur — ${conditionPaiementLabel}`
        : `TVA non applicable – article 259-1 du CGI – Reverse charge applies — ${conditionPaiementLabel}`;
    const notesDocument = [commentaireTVA, notes?.trim()].filter(Boolean).join("\n\n");

    const now = new Date();
    const dateEcheanceDocument = delai > 0 ? dateEcheance : dateDoc;

    const lignesFacture: LigneFacture[] = lignesCalculees.map((l) => ({
      description: l.description,
      quantite: l.quantite,
      prixUnitaire: l.prixUnitaire,
      tauxTVA: l.tauxTVA,
      totalHT: l.totalHT,
    }));

    const factureData: FactureData = {
      reference,
      titre: objet || reference,
      dateDocument: dateDoc.toISOString(),
      dateEcheance: dateEcheanceDocument.toISOString(),
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
        nom: clientNom,
        adresse: clientAdresse || undefined,
        pays: paysClient,
      },
      lignes: lignesFacture,
      montantHT,
      tauxTVA,
      montantTVA,
      montantTTC,
      mentionTVA,
      notes: notesDocument,
      conditionsPaiementLabel: conditionPaiementLabel,
    };

    const pdfBuffer = await renderToBuffer(
      createElement(FactureTemplate, { data: factureData }) as any
    );

    const document = await prisma.document.create({
      data: {
        reference,
        type: "FACTURE",
        statut: "VALIDE",
        collaboration: undefined,
        titre: objet || reference,
        montantHT: montantHT as any,
        tauxTVA: tauxTVA as any,
        montantTVA: montantTVA as any,
        montantTTC: montantTTC as any,
        typeTVA,
        mentionTVA,
        lignes: lignesCalculees as any,
        dateDocument: dateDoc,
        dateEmission: now,
        dateEcheance: dateEcheanceDocument,
        poClient: null,
        modePaiement,
        notes: notesDocument,
        pdfBase64: pdfBuffer.toString("base64"),
        createdBy: { connect: { id: user.id } },
        clientNom,
        clientEmail: clientEmail || null,
        clientAdresse: clientAdresse || null,
        clientPays: paysClient,
      },
    });

    await prisma.documentEvent.create({
      data: {
        documentId: document.id,
        type: "REGISTERED",
        description: "Enregistrement (création facture libre)",
        userId: user.id,
      },
    });

    const pdfUrl = `/api/documents/${document.id}/pdf`;
    await prisma.document.update({
      where: { id: document.id },
      data: { fichierUrl: pdfUrl },
    });

    return NextResponse.json(
      {
        success: true,
        document: {
          id: document.id,
          reference: document.reference,
          type: document.type,
          montantTTC: Number(document.montantTTC),
          dateEcheance: document.dateEcheance,
          fichierUrl: pdfUrl,
        },
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur création facture libre:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la facture libre" },
      { status: 500 }
    );
  }
}

