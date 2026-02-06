import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

// GET - Liste des collaborations
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const accountManagerId = searchParams.get("accountManagerId");

    const where: any = {};

    // Filtrer par Account Manager si spécifié
    if (accountManagerId) {
      where.accountManagerId = accountManagerId;
    }

    const collaborations = await prisma.collaboration.findMany({
      where,
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, photo: true },
        },
        marque: {
          select: { id: true, nom: true },
        },
        livrables: true,
        accountManager: {
          select: { id: true, prenom: true, nom: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(collaborations);
  } catch (error) {
    console.error("Erreur GET collaborations:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// POST - Créer une collaboration avec livrables
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const data = await request.json();

    if (!data.talentId || !data.marqueId || !data.livrables?.length) {
      return NextResponse.json({ message: "Champs obligatoires manquants" }, { status: 400 });
    }

    // Générer la référence en se basant sur la dernière collaboration existante
    const year = new Date().getFullYear();
    const lastCollab = await prisma.collaboration.findFirst({
      where: {
        reference: {
          startsWith: `COL-${year}-`,
        },
      },
      orderBy: {
        reference: 'desc',
      },
      select: {
        reference: true,
      },
    });

    // Extraire le numéro de la dernière collaboration
    let nextNumero = 1;
    if (lastCollab) {
      const match = lastCollab.reference.match(/COL-\d{4}-(\d{4})/);
      if (match) {
        nextNumero = parseInt(match[1], 10) + 1;
      }
    }

    const reference = `COL-${year}-${String(nextNumero).padStart(4, "0")}`;
    console.log(`🆕 Création collaboration manuelle: ${reference}`);

    // Créer la collaboration avec les livrables
    const collaboration = await prisma.collaboration.create({
      data: {
        reference,
        talentId: data.talentId,
        marqueId: data.marqueId,
        source: data.source || "INBOUND",
        description: data.description || null,
        montantBrut: parseFloat(data.montantBrut) || 0,
        commissionPercent: parseFloat(data.commissionPercent) || 20,
        commissionEuros: parseFloat(data.commissionEuros) || 0,
        montantNet: parseFloat(data.montantNet) || 0,
        isLongTerme: data.isLongTerme || false,
        statut: "NEGO",
        livrables: {
          create: data.livrables.map((l: any) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite || 1,
            prixUnitaire: parseFloat(l.prixUnitaire) || 0,
            description: l.description || null,
          })),
        },
      },
      include: {
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { nom: true } },
        livrables: true,
      },
    });

    return NextResponse.json(collaboration, { status: 201 });
  } catch (error) {
    console.error("Erreur POST collaboration:", error);
    return NextResponse.json({ message: "Erreur lors de la création" }, { status: 500 });
  }
}
