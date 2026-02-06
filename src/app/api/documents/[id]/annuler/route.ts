// src/app/api/documents/[id]/annuler/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatutDocument } from "@prisma/client";

/**
 * POST /api/documents/[id]/annuler
 * Annule un document
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

    // Seul ADMIN peut annuler
    if (user.role !== "ADMIN") {
      return NextResponse.json(
        { error: "Seul un administrateur peut annuler un document" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { motif } = body;

    if (!motif) {
      return NextResponse.json(
        { error: "Un motif d'annulation est requis" },
        { status: 400 }
      );
    }

    // Récupérer le document
    const document = await prisma.document.findUnique({
      where: { id },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    if (document.statut === "ANNULE") {
      return NextResponse.json(
        { error: "Ce document est déjà annulé" },
        { status: 400 }
      );
    }

    if (document.statut === "PAYE") {
      return NextResponse.json(
        { error: "Impossible d'annuler un document déjà payé. Créez un avoir." },
        { status: 400 }
      );
    }

    // Mettre à jour le document
    const updatedDocument = await prisma.document.update({
      where: { id },
      data: {
        statut: "ANNULE" as StatutDocument,
        notes: `${document.notes || ""}\n\n[ANNULÉ] ${new Date().toLocaleDateString("fr-FR")} - Motif: ${motif}`,
      },
    });

    return NextResponse.json({
      success: true,
      document: {
        id: updatedDocument.id,
        reference: updatedDocument.reference,
        statut: updatedDocument.statut,
      },
    });
  } catch (error) {
    console.error("Erreur annulation document:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'annulation du document" },
      { status: 500 }
    );
  }
}
