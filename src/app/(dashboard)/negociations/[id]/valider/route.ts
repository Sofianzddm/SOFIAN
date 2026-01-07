// src/app/api/negociations/[id]/valider/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// Générer une référence de collaboration
async function genererReferenceCollab(): Promise<string> {
  const annee = new Date().getFullYear();
  const prefix = `COL-${annee}-`;

  const derniere = await prisma.collaboration.findFirst({
    where: { reference: { startsWith: prefix } },
    orderBy: { reference: "desc" },
  });

  let numero = 1;
  if (derniere) {
    const match = derniere.reference.match(/(\d+)$/);
    if (match) numero = parseInt(match[1]) + 1;
  }

  return `${prefix}${numero.toString().padStart(4, "0")}`;
}

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

    // Seuls ADMIN et HEAD_OF peuvent valider
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour valider" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { action, raisonRefus } = body;

    if (!["valider", "refuser"].includes(action)) {
      return NextResponse.json(
        { error: "Action invalide (valider ou refuser)" },
        { status: 400 }
      );
    }

    // Récupérer la négociation avec ses livrables
    const nego = await prisma.negociation.findUnique({
      where: { id },
      include: {
        livrables: true,
        talent: true,
      },
    });

    if (!nego) {
      return NextResponse.json({ error: "Négociation non trouvée" }, { status: 404 });
    }

    // Vérifier que la négo peut être validée
    if (!["EN_ATTENTE", "EN_DISCUSSION", "BROUILLON"].includes(nego.statut)) {
      return NextResponse.json(
        { error: "Cette négociation ne peut plus être modifiée" },
        { status: 400 }
      );
    }

    // === REFUS ===
    if (action === "refuser") {
      const negoRefusee = await prisma.negociation.update({
        where: { id },
        data: {
          statut: "REFUSEE",
          raisonRefus: raisonRefus || null,
          validePar: user.id,
          dateValidation: new Date(),
        },
      });

      return NextResponse.json({
        success: true,
        nego: negoRefusee,
        message: "Négociation refusée",
      });
    }

    // === VALIDATION → Créer la collaboration ===
    
    // Calculer le montant total (prix souhaité ou prix demandé)
    const montantBrut = nego.livrables.reduce((sum, l) => {
      const prix = l.prixFinal || l.prixSouhaite || l.prixDemande || 0;
      return sum + Number(prix) * l.quantite;
    }, 0);

    // Récupérer le taux de commission du talent selon la source
    const commissionPercent = nego.source === "INBOUND" 
      ? Number(nego.talent.commissionInbound) 
      : Number(nego.talent.commissionOutbound);

    const commissionEuros = montantBrut * (commissionPercent / 100);
    const montantNet = montantBrut - commissionEuros;

    // Générer la référence
    const reference = await genererReferenceCollab();

    // Créer la collaboration avec ses livrables
    const collaboration = await prisma.collaboration.create({
      data: {
        reference,
        talentId: nego.talentId,
        marqueId: nego.marqueId,
        source: nego.source,
        description: nego.brief,
        montantBrut,
        commissionPercent,
        commissionEuros,
        montantNet,
        statut: "GAGNE",
        livrables: {
          create: nego.livrables.map((l) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixUnitaire: Number(l.prixFinal || l.prixSouhaite || l.prixDemande || 0),
            description: l.description,
          })),
        },
      },
    });

    // Mettre à jour la négociation
    const negoValidee = await prisma.negociation.update({
      where: { id },
      data: {
        statut: "VALIDEE",
        budgetFinal: montantBrut,
        validePar: user.id,
        dateValidation: new Date(),
        collaborationId: collaboration.id,
      },
      include: {
        collaboration: {
          select: { id: true, reference: true },
        },
      },
    });

    return NextResponse.json({
      success: true,
      nego: negoValidee,
      collaboration: {
        id: collaboration.id,
        reference: collaboration.reference,
      },
      message: `Collaboration ${reference} créée !`,
    });
  } catch (error) {
    console.error("Erreur validation négociation:", error);
    return NextResponse.json(
      { error: "Erreur lors de la validation" },
      { status: 500 }
    );
  }
}
