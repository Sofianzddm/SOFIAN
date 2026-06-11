import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Détail d'une marque
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id } = await params;
    const marque = await prisma.marque.findUnique({
      where: { id: id },
      include: {
        contacts: {
          orderBy: [{ principal: "desc" }, { priorite: "asc" }, { createdAt: "asc" }],
          include: {
            outreachTargets: {
              select: {
                id: true,
                status: true,
                cycleCount: true,
                lastSentAt: true,
                nextRecontactAt: true,
                lastRepliedAt: true,
              },
            },
          },
        },
        cartoFiles: {
          select: { id: true, fileName: true, size: true, createdAt: true },
          orderBy: { createdAt: "desc" },
        },
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

    const before = await prisma.marque.findUnique({
      where: { id },
      select: { nom: true },
    });

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

    // Le nom est dénormalisé sur les cibles Outreach : on le synchronise
    // pour que le cycle de contact affiche le nouveau nom de la marque.
    if (before && data.nom && data.nom !== before.nom) {
      await prisma.outreachTarget.updateMany({
        where: { marqueId: id },
        data: { company: data.nom },
      });
    }

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
            prenom: contact.prenom || null,
            nom: contact.nom,
            email: contact.email || null,
            telephone: contact.telephone || null,
            poste: contact.poste || null,
            principal: contact.principal || false,
            // Champs de cartographie (import Claude/Excel) — préservés à l'édition
            priorite: contact.priorite || null,
            perimetre: contact.perimetre || null,
            localisation: contact.localisation || null,
            linkedinUrl: contact.linkedinUrl || null,
            source: contact.source || null,
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
