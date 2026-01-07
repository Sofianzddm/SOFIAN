import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Liste des marques
export async function GET() {
  try {
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
    const data = await request.json();

    // Validation basique
    if (!data.nom) {
      return NextResponse.json(
        { message: "Le nom de la marque est obligatoire" },
        { status: 400 }
      );
    }

    // Créer la marque avec ses contacts
    const marque = await prisma.marque.create({
      data: {
        nom: data.nom,
        secteur: data.secteur || null,
        siteWeb: data.siteWeb || null,
        notes: data.notes || null,
        
        // Adresse
        adresseRue: data.adresseRue || null,
        adresseComplement: data.adresseComplement || null,
        codePostal: data.codePostal || null,
        ville: data.ville || null,
        pays: data.pays || "France",
        
        // Facturation
        raisonSociale: data.raisonSociale || null,
        formeJuridique: data.formeJuridique || null,
        siret: data.siret || null,
        numeroTVA: data.numeroTVA || null,
        delaiPaiement: data.delaiPaiement ? parseInt(data.delaiPaiement) : 30,
        modePaiement: data.modePaiement || "Virement",
        devise: data.devise || "EUR",
        
        // Contacts
        contacts: {
          create: data.contacts?.map((contact: any) => ({
            nom: contact.nom,
            email: contact.email || null,
            telephone: contact.telephone || null,
            poste: contact.poste || null,
            principal: contact.principal || false,
          })) || [],
        },
      },
      include: {
        contacts: true,
      },
    });

    return NextResponse.json(marque, { status: 201 });
  } catch (error) {
    console.error("Erreur POST marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la création de la marque" },
      { status: 500 }
    );
  }
}
