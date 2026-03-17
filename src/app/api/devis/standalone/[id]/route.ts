// src/app/api/devis/standalone/[id]/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

interface LigneInput {
  description: string;
  quantite: number;
  prixUnitaire: number;
  tauxTVA: number;
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    if (!["ADMIN", "HEAD_OF_SALES"].includes(user.role)) {
      return NextResponse.json(
        { error: "Seuls les ADMIN ou HEAD_OF_SALES peuvent modifier des devis libres" },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    if (!id) {
      return NextResponse.json(
        { error: "Identifiant de devis manquant" },
        { status: 400 }
      );
    }

    const existing = await prisma.document.findUnique({
      where: { id },
    });
    if (!existing || existing.type !== "DEVIS" || existing.collaborationId) {
      return NextResponse.json(
        { error: "Devis standalone introuvable" },
        { status: 404 }
      );
    }
    if (user.role === "HEAD_OF_SALES" && existing.createdById !== user.id) {
      return NextResponse.json(
        { error: "Accès refusé" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const {
      clientNom,
      clientEmail,
      clientAdresse,
      pays,
      objet,
      dateDocument,
      dateValidite,
      lignes,
      notes,
      finaliser,
    } = body as {
      clientNom: string;
      clientEmail?: string;
      clientAdresse?: string;
      pays?: string;
      objet?: string;
      dateDocument?: string;
      dateValidite?: string;
      lignes: LigneInput[];
      notes?: string;
      finaliser?: boolean;
    };

    if (!clientNom || !lignes || !Array.isArray(lignes) || lignes.length === 0) {
      return NextResponse.json(
        { error: "clientNom et au moins une ligne de facturation sont requis" },
        { status: 400 }
      );
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

    const paysClient = pays || existing.clientPays || "France";
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

    const dateDoc = dateDocument ? new Date(dateDocument) : existing.dateDocument;
    const dateEcheance = dateValidite
      ? new Date(dateValidite)
      : existing.dateEcheance || new Date();

    const statut = finaliser ? "VALIDE" : existing.statut;

    const updated = await prisma.document.update({
      where: { id },
      data: {
        statut,
        titre: objet || existing.titre,
        montantHT: montantHT as any,
        tauxTVA: tauxTVA as any,
        montantTVA: montantTVA as any,
        montantTTC: montantTTC as any,
        mentionTVA,
        lignes: lignesCalculees as any,
        dateDocument: dateDoc,
        dateEcheance,
        clientNom,
        clientEmail: clientEmail ?? null,
        clientAdresse: clientAdresse ?? null,
        clientPays: paysClient,
        notes: commentaireTVA,
      },
    });

    await prisma.documentEvent.create({
      data: {
        documentId: updated.id,
        type: "EDITED",
        description: "Modification devis libre",
        userId: user.id,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: updated.id,
        reference: updated.reference,
        type: updated.type,
        montantTTC: Number(updated.montantTTC),
        dateEcheance: updated.dateEcheance,
      },
    });
  } catch (error) {
    console.error("Erreur mise à jour devis libre:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du devis libre" },
      { status: 500 }
    );
  }
}

