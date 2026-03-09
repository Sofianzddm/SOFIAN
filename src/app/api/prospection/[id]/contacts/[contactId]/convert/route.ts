import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionAndContact } from "../route";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contactId: string }> }
) {
  try {
    const { contactId } = await params;
    const result = await getSessionAndContact(request, contactId);
    if ("error" in result) return result.error;

    const { contact, session } = result;

    const body = await request.json();
    const {
      talentId,
      montant,
      devise,
      notes,
    } = body as {
      talentId?: string;
      montant?: number | string;
      devise?: string;
      notes?: string;
    };

    if (!talentId) {
      return NextResponse.json({ error: "Talent obligatoire" }, { status: 400 });
    }

    const montantNumber =
      typeof montant === "string" ? parseFloat(montant) : montant;
    if (!montantNumber || Number.isNaN(montantNumber) || montantNumber <= 0) {
      return NextResponse.json(
        { error: "Montant brut invalide" },
        { status: 400 }
      );
    }

    const year = new Date().getFullYear();
    const compteur = await prisma.compteur.upsert({
      where: { type_annee: { type: "NEG", annee: year } },
      update: { dernierNumero: { increment: 1 } },
      create: { type: "NEG", annee: year, dernierNumero: 1 },
    });
    const reference = `NEG-${year}-${String(
      compteur.dernierNumero
    ).padStart(4, "0")}`;

    const parts = contact.nomOpportunite.split(/\s+x\s+/i);
    const talentNom = parts[0]?.trim() || null;
    const marqueNom = parts[1]?.trim() || null;

    const briefParts: string[] = [];
    if (contact.notes) briefParts.push(`Notes prospection: ${contact.notes}`);
    if (notes) briefParts.push(`Notes conversion: ${notes}`);
    const brief = briefParts.length > 0 ? briefParts.join("\n\n") : null;

    const negociation = await prisma.negociation.create({
      data: {
        reference,
        tmId: session.user.id,
        talentId,
        marqueId: null,
        nomMarqueSaisi: marqueNom || contact.nomOpportunite,
        contactMarque:
          [contact.prenom, contact.nom].filter(Boolean).join(" ") || null,
        emailContact: contact.email || null,
        source: "INBOUND",
        brief,
        budgetMarque: montantNumber,
        statut: "BROUILLON",
      },
    });

    await prisma.prospectionHistorique.create({
      data: {
        contactId,
        auteurId: session.user.id,
        type: "CREATION",
        detail: `Négociation créée: ${reference}${
          talentNom ? ` pour ${talentNom}` : ""
        }`,
      },
    });

    return NextResponse.json({
      negociationId: negociation.id,
      collabId: negociation.id,
    });
  } catch (error) {
    console.error(
      "Erreur POST /api/prospection/[id]/contacts/[contactId]/convert:",
      error
    );
    return NextResponse.json(
      { error: "Erreur lors de la conversion en négociation" },
      { status: 500 }
    );
  }
}

