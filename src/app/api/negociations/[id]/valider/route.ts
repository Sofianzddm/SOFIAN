import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { generateCollabReference } from "@/lib/generateCollabReference";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { findOrCreateMarque } from "@/lib/marque-resolver";
import { createDevisForCollaboration } from "@/lib/documents/createDevis";
import {
  isTmInfluenceRole,
  linkOrCreateProspectionForTmCollab,
} from "@/lib/tm-collab-prospection";

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

    // Seuls Talent Manager, Head Of, Head of Influence et Admin peuvent valider
    if (!["TM", "HEAD_OF", "HEAD_OF_INFLUENCE", "ADMIN"].includes(session.user.role)) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 403 });
    }

    const { action, raisonRefus } = await request.json();

    if (!["valider", "refuser"].includes(action)) {
      return NextResponse.json({ message: "Action invalide" }, { status: 400 });
    }

    // Le Talent Manager peut uniquement valider, pas refuser
    if (action === "refuser" && session.user.role === "TM") {
      return NextResponse.json({ message: "Non autorisé" }, { status: 403 });
    }

    // Récupérer la négo avec ses livrables
    const nego = await prisma.negociation.findUnique({
      where: { id: id },
      include: {
        livrables: true,
        talent: {
          select: {
            prenom: true,
            nom: true,
            commissionInbound: true,
            commissionOutbound: true,
          },
        },
        tm: { select: { id: true, role: true } },
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
      const resolved = await findOrCreateMarque({
        name: String(nego.nomMarqueSaisi).trim(),
        source: "NEGOCIATION",
      });
      marqueIdToUse = resolved.marqueId;
      await prisma.negociation.update({
        where: { id },
        data: { marqueId: marqueIdToUse, nomMarqueSaisi: null },
      });
    }
    if (!marqueIdToUse) {
      return NextResponse.json(
        { message: "Marque manquante : indiquez un nom de marque ou une marque existante" },
        { status: 400 }
      );
    }
    const marqueIdFinal = marqueIdToUse as string;

    // TM : vérifier facturation avant create (pas de devis = pas de collab)
    const tmIsInfluence = isTmInfluenceRole(nego.tm?.role);
    if (tmIsInfluence) {
      const marque = await prisma.marque.findUnique({
        where: { id: marqueIdFinal },
        select: { adresseRue: true, codePostal: true, ville: true, nom: true },
      });
      if (!marque?.adresseRue || !marque.codePostal || !marque.ville) {
        return NextResponse.json(
          {
            message:
              "Complétez l'adresse de facturation de la marque avant validation (obligatoire pour générer le devis TM).",
          },
          { status: 400 }
        );
      }
    }

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
      const reference = await generateCollabReference();

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
          statut: "GAGNE",
          createdById: nego.tmId,
          livrables: {
            create: nego.livrables.map((l) => ({
              typeContenu: l.typeContenu,
              quantite: l.quantite,
              prixUnitaire: l.prixFinal || l.prixSouhaite || l.prixDemande || 0,
              description: l.description,
            })),
          },
        },
        include: {
          talent: { select: { prenom: true, nom: true } },
          marque: { select: { nom: true } },
          livrables: true,
        },
      });

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

      return { updated, collaboration };
    });

    // Après commit : devis + prosp pour TM
    if (tmIsInfluence && nego.tmId) {
      try {
        const lignes = result.collaboration.livrables.map((l) => ({
          description: l.description || `${l.quantite}x ${l.typeContenu}`,
          quantite: Number(l.quantite) || 1,
          prixUnitaire: Number(l.prixUnitaire) || 0,
        }));
        const doc = await createDevisForCollaboration({
          collaborationId: result.collaboration.id,
          userId: session.user.id,
          lignes,
        });
        await linkOrCreateProspectionForTmCollab({
          collaborationId: result.collaboration.id,
          createdById: nego.tmId,
          talentId: result.collaboration.talentId,
          talentPrenom: result.collaboration.talent.prenom,
          talentNom: result.collaboration.talent.nom,
          marqueNom: result.collaboration.marque.nom,
          montantBrut: Number(result.collaboration.montantBrut),
          devisDate: doc.dateEmission ?? new Date(),
        });
      } catch (err) {
        // Rollback collab + unlink négo
        await prisma.negociation.update({
          where: { id },
          data: { collaborationId: null, statut: "EN_DISCUSSION", dateValidation: null, validePar: null },
        });
        await prisma.collaboration.delete({ where: { id: result.collaboration.id } });
        const message =
          err instanceof Error
            ? err.message
            : "Devis obligatoire pour les TM — validation annulée.";
        return NextResponse.json({ message }, { status: 400 });
      }
    }

    return NextResponse.json(result.updated);
  } catch (error) {
    console.error("Erreur validation négociation:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}
