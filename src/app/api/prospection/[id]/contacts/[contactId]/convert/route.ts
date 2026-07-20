import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getSessionAndContact } from "../route";
import {
  findOrCreateMarque,
  ensureMarqueContact,
  parseSenderName,
} from "@/lib/marque-resolver";

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
      emailContact: emailContactRaw,
      contactMarque: contactMarqueRaw,
      contactKind: contactKindRaw,
      contactAgence: contactAgenceRaw,
      contactLanguage: contactLanguageRaw,
    } = body as {
      talentId?: string;
      montant?: number | string;
      devise?: string;
      notes?: string;
      emailContact?: string;
      contactMarque?: string;
      contactKind?: string;
      contactAgence?: string;
      contactLanguage?: string;
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

    // Mêmes garde-fous que POST /api/negociations : sans email + nom du
    // contact + qualification, la négo n'entrerait jamais dans le cycle
    // outreach 45j (et une agence pourrait finir dans Outreach Clients).
    const emailContact =
      String(emailContactRaw ?? contact.email ?? "").trim().toLowerCase();
    if (!emailContact || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailContact)) {
      return NextResponse.json(
        { error: "Email du contact client obligatoire" },
        { status: 400 }
      );
    }
    const contactMarque = String(
      contactMarqueRaw ??
        [contact.prenom, contact.nom].filter(Boolean).join(" ")
    ).trim();
    if (!contactMarque) {
      return NextResponse.json(
        { error: "Prénom et nom du contact client obligatoires" },
        { status: 400 }
      );
    }
    const contactKind = String(contactKindRaw || "").trim().toUpperCase();
    if (contactKind !== "MARQUE" && contactKind !== "AGENCE") {
      return NextResponse.json(
        { error: "Précisez si le contact est la marque en direct ou une agence" },
        { status: 400 }
      );
    }
    const contactAgence = String(contactAgenceRaw || "").trim();
    if (contactKind === "AGENCE" && !contactAgence) {
      return NextResponse.json(
        { error: "Nom de l'agence obligatoire" },
        { status: 400 }
      );
    }
    const contactLanguage =
      String(contactLanguageRaw || "").trim().toLowerCase() === "en" ? "en" : "fr";

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

    const brandLabel = marqueNom || contact.nomOpportunite;
    let marqueId: string | null = null;
    if (brandLabel?.trim()) {
      const resolved = await findOrCreateMarque({
        name: brandLabel.trim(),
        source: "PROSPECTION",
      });
      marqueId = resolved.marqueId;
      const parsedContact = parseSenderName(contactMarque);
      await ensureMarqueContact({
        marqueId,
        email: emailContact,
        prenom: parsedContact.prenom,
        nom: parsedContact.nom || contactMarque,
      });
    }

    const negociation = await prisma.negociation.create({
      data: {
        reference,
        tmId: session.user.id,
        talentId,
        marqueId,
        nomMarqueSaisi: marqueId ? null : brandLabel,
        contactMarque,
        emailContact,
        contactKind,
        contactAgence: contactAgence || null,
        contactLanguage,
        source: "INBOUND",
        brief,
        budgetMarque: montantNumber,
        statut: "BROUILLON",
      },
    });

    await prisma.prospectionContact.update({
      where: { id: contactId },
      data: {
        montantBrut: montantNumber,
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

