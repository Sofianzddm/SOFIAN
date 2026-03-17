// src/app/api/documents/[id]/avoir/route.ts

import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { genererNumeroDocument } from "@/lib/documents/numerotation";
import { getTalentIdsAccessibles } from "@/lib/delegations";

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

    // ADMIN, HEAD_OF, HEAD_OF_INFLUENCE et TM peuvent créer des avoirs
    const rolesAutorises = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"];
    if (!rolesAutorises.includes(user.role)) {
      return NextResponse.json(
        { error: "Vous n'avez pas les droits pour créer un avoir" },
        { status: 403 }
      );
    }

    // Récupérer la facture originale
    const facture = await prisma.document.findUnique({
      where: { id },
      include: {
        collaboration: {
          select: { talentId: true },
        },
      },
    });

    if (!facture) {
      return NextResponse.json({ error: "Facture non trouvée" }, { status: 404 });
    }

    // Pour une TM, vérifier que le talent de la collab fait partie de ses talents accessibles
    if (user.role === "TM") {
      const talentId = facture.collaboration?.talentId;
      if (!talentId) {
        return NextResponse.json(
          { error: "Impossible de déterminer le talent associé à cette facture" },
          { status: 403 }
        );
      }

      const talentsAccessibles = await getTalentIdsAccessibles(user.id);
      if (!talentsAccessibles.includes(talentId)) {
        return NextResponse.json(
          {
            error:
              "Vous ne pouvez créer un avoir que pour des talents qui vous sont accessibles",
          },
          { status: 403 }
        );
      }
    }

    if (facture.type !== "FACTURE") {
      return NextResponse.json(
        { error: "Seule une facture peut être annulée par un avoir" },
        { status: 400 }
      );
    }

    if (facture.statut === "PAYE") {
      return NextResponse.json(
        { error: "Impossible de créer un avoir sur une facture payée" },
        { status: 400 }
      );
    }

    if (facture.avoirRef) {
      return NextResponse.json(
        { error: "Un avoir existe déjà pour cette facture" },
        { status: 400 }
      );
    }

    // Générer le numéro d'avoir
    const referenceAvoir = await genererNumeroDocument("AVOIR");

    // Créer l'avoir (montants négatifs)
    const avoir = await prisma.document.create({
      data: {
        reference: referenceAvoir,
        type: "AVOIR",
        statut: "VALIDE",
        collaborationId: facture.collaborationId,
        titre: `Avoir sur ${facture.reference}`,
        montantHT: facture.montantHT,
        tauxTVA: facture.tauxTVA,
        montantTVA: facture.montantTVA,
        montantTTC: facture.montantTTC,
        typeTVA: facture.typeTVA,
        mentionTVA: facture.mentionTVA,
        lignes: facture.lignes ?? undefined,
        dateDocument: new Date(),
        dateEmission: new Date(),
        factureRef: facture.reference, // Référence à la facture annulée
        modePaiement: facture.modePaiement,
        notes: `Avoir annulant la facture ${facture.reference}`,
        createdById: user.id,
      },
    });

    // Mettre à jour la facture originale : annulée, liée à l'avoir
    await prisma.document.update({
      where: { id: facture.id },
      data: {
        statut: "ANNULE",
        avoirRef: referenceAvoir,
      },
    });

    // Repasser la collaboration en PUBLIE pour pouvoir générer une nouvelle facture (nouveau numéro)
    if (facture.collaborationId) {
      await prisma.collaboration.update({
        where: { id: facture.collaborationId },
        data: { statut: "PUBLIE" },
      });
    }

    return NextResponse.json({
      success: true,
      avoir: {
        id: avoir.id,
        reference: avoir.reference,
      },
      message: `Avoir ${referenceAvoir} créé. Vous pouvez maintenant générer une nouvelle facture.`,
    });
  } catch (error) {
    console.error("Erreur création avoir:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'avoir" },
      { status: 500 }
    );
  }
}
