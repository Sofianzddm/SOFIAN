// src/app/api/documents/[id]/annuler/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { StatutDocument } from "@prisma/client";
import { getTalentIdsAccessibles } from "@/lib/delegations";

const ROLES_ANNULER_DEVIS = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "HEAD_OF_SALES", "TM"] as const;

/**
 * POST /api/documents/[id]/annuler
 * Annule un document (devis : mêmes rôles que la génération ; autres types : ADMIN uniquement)
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

    const body = await request.json().catch(() => ({}));
    const motifBrut = typeof body?.motif === "string" ? body.motif.trim() : "";

    const document = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: { select: { id: true, talentId: true } },
      },
    });

    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }

    const isDevis = document.type === "DEVIS";

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

    if (isDevis && document.signatureStatus === "SIGNED") {
      return NextResponse.json(
        { error: "Impossible d'annuler un devis signé par la marque." },
        { status: 400 }
      );
    }

    if (isDevis && document.collaborationId) {
      const factureLiee = await prisma.document.findFirst({
        where: {
          collaborationId: document.collaborationId,
          type: "FACTURE",
          factureRef: document.reference,
          statut: { notIn: ["ANNULE"] },
        },
      });
      if (factureLiee) {
        return NextResponse.json(
          {
            error: `Une facture (${factureLiee.reference}) a été générée à partir de ce devis. Traitez-la avant de supprimer le devis.`,
          },
          { status: 400 }
        );
      }
    }

    let allowed = false;
    if (user.role === "ADMIN") {
      allowed = true;
    } else if (isDevis && ROLES_ANNULER_DEVIS.includes(user.role as (typeof ROLES_ANNULER_DEVIS)[number])) {
      if (user.role === "TM") {
        const talentId = document.collaboration?.talentId;
        if (talentId) {
          const accessibles = await getTalentIdsAccessibles(user.id);
          allowed = accessibles.includes(talentId);
        }
      } else {
        allowed = true;
      }
    }

    if (!allowed) {
      return NextResponse.json(
        {
          error: isDevis
            ? "Vous n'avez pas les droits pour annuler ce devis"
            : "Seul un administrateur peut annuler ce document",
        },
        { status: 403 }
      );
    }

    const motif =
      motifBrut || (isDevis ? "Annulation du devis (régénération)" : "");

    if (!motif) {
      return NextResponse.json(
        { error: "Un motif d'annulation est requis" },
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
