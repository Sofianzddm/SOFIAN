// src/app/api/factures/standalone/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { MENTIONS_TVA } from "@/lib/documents/config";

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
      conditionsReglement, // "30", "60", "0"
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
    const delai = conditionsReglement === "60" ? 60 : conditionsReglement === "0" ? 0 : 30;

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
    const mentionTVA =
      paysClient === "France"
        ? null
        : paysClient === "UE"
        ? "TVA non applicable – autoliquidation par le preneur"
        : "TVA non applicable – article 259-1 du CGI – Reverse charge applies";

    const commentaireTVA =
      paysClient === "France"
        ? `TVA ${tauxTVA}% — Paiement sous 30 jours fin de mois à réception de facture.`
        : paysClient === "UE"
        ? "TVA non applicable – autoliquidation par le preneur — Paiement sous 30 jours fin de mois à réception de facture."
        : "TVA non applicable – article 259-1 du CGI – Reverse charge applies — Paiement sous 30 jours fin de mois à réception de facture.";

    const now = new Date();

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
        typeTVA: "FRANCE",
        mentionTVA,
        lignes: lignesCalculees as any,
        dateDocument: dateDoc,
        dateEmission: now,
        dateEcheance: delai > 0 ? dateEcheance : dateDoc,
        poClient: null,
        modePaiement,
        notes: commentaireTVA,
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

    return NextResponse.json(
      {
        success: true,
        document: {
          id: document.id,
          reference: document.reference,
          type: document.type,
          montantTTC: Number(document.montantTTC),
          dateEcheance: document.dateEcheance,
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

