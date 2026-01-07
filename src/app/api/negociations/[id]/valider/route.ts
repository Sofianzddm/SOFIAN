import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST - Valider ou refuser une négociation
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    // Seuls Head Of et Admin peuvent valider
    if (!["HEAD_OF", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 403 });
    }

    const { action, raisonRefus } = await request.json();

    if (!["valider", "refuser"].includes(action)) {
      return NextResponse.json({ message: "Action invalide" }, { status: 400 });
    }

    // Récupérer la négo avec ses livrables
    const nego = await prisma.negociation.findUnique({
      where: { id: id },
      include: {
        livrables: true,
        talent: {
          select: { commissionInbound: true, commissionOutbound: true },
        },
      },
    });

    if (!nego) {
      return NextResponse.json({ message: "Non trouvée" }, { status: 404 });
    }

    if (nego.collaborationId) {
      return NextResponse.json({ message: "Déjà convertie en collaboration" }, { status: 400 });
    }

    // REFUSER
    if (action === "refuser") {
      const updated = await prisma.negociation.update({
        where: { id: id },
        data: {
          statut: "REFUSEE",
          validePar: session.user.id,
          dateValidation: new Date(),
          raisonRefus: raisonRefus || null,
        },
      });
      return NextResponse.json(updated);
    }

    // VALIDER → Créer la collaboration
    // Générer la référence collab
    const year = new Date().getFullYear();
    const compteur = await prisma.compteur.upsert({
      where: { type_annee: { type: "COLLAB", annee: year } },
      update: { dernierNumero: { increment: 1 } },
      create: { type: "COLLAB", annee: year, dernierNumero: 1 },
    });
    const reference = `COL-${year}-${String(compteur.dernierNumero).padStart(4, "0")}`;

    // Calculer les montants
    const montantBrut = nego.budgetFinal || nego.budgetSouhaite || nego.budgetMarque || 0;
    const commissionPercent = nego.source === "INBOUND" 
      ? Number(nego.talent.commissionInbound) 
      : Number(nego.talent.commissionOutbound);
    const commissionEuros = (Number(montantBrut) * commissionPercent) / 100;
    const montantNet = Number(montantBrut) - commissionEuros;

    // Créer la collaboration avec les livrables
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
        statut: "GAGNE", // Directement gagné puisque validé
        livrables: {
          create: nego.livrables.map((l) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite,
            prixUnitaire: l.prixFinal || l.prixSouhaite || l.prixDemande || 0,
            description: l.description,
          })),
        },
      },
    });

    // Mettre à jour la négociation
    const updated = await prisma.negociation.update({
      where: { id: id },
      data: {
        statut: "VALIDEE",
        validePar: session.user.id,
        dateValidation: new Date(),
        budgetFinal: montantBrut,
        collaborationId: collaboration.id,
      },
      include: {
        collaboration: {
          select: { id: true, reference: true },
        },
      },
    });

    return NextResponse.json(updated);
  } catch (error) {
    console.error("Erreur validation négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
