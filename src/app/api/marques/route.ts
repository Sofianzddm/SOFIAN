import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { findOrCreateMarque } from "@/lib/marque-resolver";

// GET - Liste des marques
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const marques = await prisma.marque.findMany({
      include: {
        contacts: {
          select: {
            id: true,
            nom: true,
            email: true,
            principal: true,
          },
        },
        _count: {
          select: {
            collaborations: true,
          },
        },
      },
      orderBy: {
        nom: "asc",
      },
    });

    return NextResponse.json(marques);
  } catch (error) {
    console.error("Erreur GET marques:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération des marques" },
      { status: 500 }
    );
  }
}

// POST - Créer une marque
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const data = await request.json();

    // Validation basique
    if (!data.nom) {
      return NextResponse.json(
        { message: "Le nom de la marque est obligatoire" },
        { status: 400 }
      );
    }

    // ÉTAPE 1 — Find-or-create via le résolveur central : si "Nike" existe déjà,
    // on ne recrée PAS une 2e fiche. On rouvre l'existante et on enrichit
    // ses champs vides avec ce que l'utilisateur vient de saisir.
    const resolved = await findOrCreateMarque({
      name: data.nom,
      source: "MANUAL",
      createDefaults: {
        secteur: data.secteur || null,
        siteWeb: data.siteWeb || null,
        notes: data.notes || null,
        adresseRue: data.adresseRue || null,
        adresseComplement: data.adresseComplement || null,
        codePostal: data.codePostal || null,
        ville: data.ville || null,
        pays: data.pays || "France",
        raisonSociale: data.raisonSociale || null,
        formeJuridique: data.formeJuridique || null,
        siret: data.siret || null,
        numeroTVA: data.numeroTVA || null,
        delaiPaiement: data.delaiPaiement ? parseInt(data.delaiPaiement) : 30,
        modePaiement: data.modePaiement || "Virement",
        devise: data.devise || "EUR",
      },
    });

    // ÉTAPE 2 — Si la fiche existait déjà : on enrichit uniquement les champs
    // actuellement vides (jamais d'écrasement silencieux) et on ajoute les
    // nouveaux contacts qui ne sont pas déjà connus (dédup par email).
    if (!resolved.created) {
      const existing = await prisma.marque.findUnique({
        where: { id: resolved.marqueId },
        include: { contacts: { select: { email: true } } },
      });
      if (existing) {
        const patch: Record<string, unknown> = {};
        const fillIfEmpty = (field: keyof typeof existing, value: unknown) => {
          if (value && !existing[field]) patch[field as string] = value;
        };
        fillIfEmpty("secteur", data.secteur);
        fillIfEmpty("siteWeb", data.siteWeb);
        fillIfEmpty("notes", data.notes);
        fillIfEmpty("adresseRue", data.adresseRue);
        fillIfEmpty("adresseComplement", data.adresseComplement);
        fillIfEmpty("codePostal", data.codePostal);
        fillIfEmpty("ville", data.ville);
        fillIfEmpty("raisonSociale", data.raisonSociale);
        fillIfEmpty("formeJuridique", data.formeJuridique);
        fillIfEmpty("siret", data.siret);
        fillIfEmpty("numeroTVA", data.numeroTVA);
        if (Object.keys(patch).length > 0) {
          await prisma.marque.update({ where: { id: existing.id }, data: patch });
        }
      }
    }

    // Création des contacts (en évitant les doublons par email).
    if (Array.isArray(data.contacts) && data.contacts.length > 0) {
      const existingEmails = new Set(
        (
          await prisma.marqueContact.findMany({
            where: { marqueId: resolved.marqueId, email: { not: null } },
            select: { email: true },
          })
        )
          .map((c) => c.email?.toLowerCase().trim())
          .filter(Boolean) as string[]
      );

      for (const contact of data.contacts) {
        if (!contact?.nom) continue;
        const emailKey = contact.email?.toLowerCase().trim();
        if (emailKey && existingEmails.has(emailKey)) continue;
        await prisma.marqueContact.create({
          data: {
            marqueId: resolved.marqueId,
            nom: contact.nom,
            email: contact.email || null,
            telephone: contact.telephone || null,
            poste: contact.poste || null,
            principal: !!contact.principal,
          },
        });
        if (emailKey) existingEmails.add(emailKey);
      }
    }

    const marque = await prisma.marque.findUnique({
      where: { id: resolved.marqueId },
      include: { contacts: true },
    });

    return NextResponse.json(
      { ...marque, _resolver: { reused: !resolved.created, matchedBy: resolved.matchedBy } },
      { status: resolved.created ? 201 : 200 }
    );
  } catch (error) {
    console.error("Erreur POST marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la création de la marque" },
      { status: 500 }
    );
  }
}
