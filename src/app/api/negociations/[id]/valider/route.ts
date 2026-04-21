import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateCollabReference } from "@/lib/generateCollabReference";
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

    // Seuls Head Of, Head of Influence et Admin peuvent valider
    if (!["HEAD_OF", "HEAD_OF_INFLUENCE", "ADMIN"].includes(session.user.role)) {
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

    // VALIDER → Résoudre la marque puis créer la collaboration
    let marqueIdToUse: string | null = nego.marqueId;
    if (!marqueIdToUse && nego.nomMarqueSaisi) {
      const nom = String(nego.nomMarqueSaisi).trim();
      // Toujours créer une nouvelle fiche marque, même si une marque
      // avec le même nom existe déjà, pour garder un contrôle manuel
      // sur les informations légales / facturation.
      const created = await prisma.marque.create({
        data: { nom },
      });
      marqueIdToUse = created.id;
    }
    if (!marqueIdToUse) {
      return NextResponse.json(
        { message: "Marque manquante : indiquez un nom de marque ou une marque existante" },
        { status: 400 }
      );
    }
    const marqueIdFinal = marqueIdToUse as string;

    // Montant brut = somme (prix accord par livrable × quantité), pas negociation.budgetFinal
    const montantBrut = nego.livrables.reduce(
      (sum, l) =>
        sum +
        Number(l.prixFinal ?? l.prixSouhaite ?? l.prixDemande ?? 0) * Number(l.quantite ?? 1),
      0
    );
    const commissionPercent = nego.source === "INBOUND"
      ? Number(nego.talent.commissionInbound)
      : Number(nego.talent.commissionOutbound);
    const commissionEuros = (Number(montantBrut) * commissionPercent) / 100;
    const montantNet = Number(montantBrut) - commissionEuros;

    // Créer la collaboration dans une transaction
    const result = await prisma.$transaction(async (tx) => {
      // Générer la référence via la fonction centralisée (compteur + max existant)
      const reference = await generateCollabReference();

      // Créer la collaboration avec les livrables
      const collaboration = await tx.collaboration.create({
        data: {
          reference,
          talentId: nego.talentId,
          marqueId: marqueIdFinal,
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

      // Mettre à jour la négociation (lier la marque résolue)
      // Une fois convertie en collaboration, la négociation est archivée.
      const updated = await tx.negociation.update({
        where: { id: id },
        data: {
          statut: "ANNULEE",
          marqueId: marqueIdFinal,
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

      return updated;
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error("Erreur validation négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
