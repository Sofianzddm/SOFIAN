import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Détail d'une marque
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const marque = await prisma.marque.findUnique({
      where: { id: id },
      include: {
        contacts: true,
        collaborations: {
          include: {
            talent: {
              select: {
                prenom: true,
                nom: true,
              },
            },
          },
          orderBy: {
            createdAt: "desc",
          },
          take: 20,
        },
        _count: {
          select: {
            collaborations: true,
          },
        },
      },
    });

    if (!marque) {
      return NextResponse.json(
        { message: "Marque non trouvée" },
        { status: 404 }
      );
    }

    return NextResponse.json(marque);
  } catch (error) {
    console.error("Erreur GET marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la récupération de la marque" },
      { status: 500 }
    );
  }
}

// PUT - Mettre à jour une marque
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const data = await request.json();

    // Mettre à jour la marque
    const marque = await prisma.marque.update({
      where: { id: id },
      data: {
        nom: data.nom,
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

    // Si des contacts sont fournis, les mettre à jour
    if (data.contacts) {
      // Supprimer les anciens contacts
      await prisma.marqueContact.deleteMany({
        where: { marqueId: id },
      });

      // Créer les nouveaux contacts
      if (data.contacts.length > 0) {
        await prisma.marqueContact.createMany({
          data: data.contacts.map((contact: any) => ({
            marqueId: id,
            nom: contact.nom,
            email: contact.email || null,
            telephone: contact.telephone || null,
            poste: contact.poste || null,
            principal: contact.principal || false,
          })),
        });
      }
    }

    return NextResponse.json(marque);
  } catch (error) {
    console.error("Erreur PUT marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la mise à jour de la marque" },
      { status: 500 }
    );
  }
}

// DELETE - Supprimer une marque
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    // Vérifier si la marque a des collaborations
    const marque = await prisma.marque.findUnique({
      where: { id: id },
      include: {
        _count: {
          select: { collaborations: true },
        },
      },
    });

    if (!marque) {
      return NextResponse.json(
        { message: "Marque non trouvée" },
        { status: 404 }
      );
    }

    if (marque._count.collaborations > 0) {
      return NextResponse.json(
        { message: "Impossible de supprimer une marque avec des collaborations" },
        { status: 400 }
      );
    }

    // Supprimer les contacts d'abord
    await prisma.marqueContact.deleteMany({
      where: { marqueId: id },
    });

    // Supprimer la marque
    await prisma.marque.delete({
      where: { id: id },
    });

    return NextResponse.json({ message: "Marque supprimée" });
  } catch (error) {
    console.error("Erreur DELETE marque:", error);
    return NextResponse.json(
      { message: "Erreur lors de la suppression de la marque" },
      { status: 500 }
    );
  }
}
