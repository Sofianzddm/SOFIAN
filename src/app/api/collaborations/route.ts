import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

// GET - Liste des collaborations
export async function GET() {
  try {
    const collaborations = await prisma.collaboration.findMany({
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, photo: true },
        },
        marque: {
          select: { id: true, nom: true },
        },
        livrables: true,
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
    const data = await request.json();

    if (!data.talentId || !data.marqueId || !data.livrables?.length) {
      return NextResponse.json({ message: "Champs obligatoires manquants" }, { status: 400 });
    }

    // Générer la référence
    const year = new Date().getFullYear();
    const count = await prisma.collaboration.count({
      where: {
        createdAt: { gte: new Date(`${year}-01-01`), lt: new Date(`${year + 1}-01-01`) },
      },
    });
    const reference = `COL-${year}-${String(count + 1).padStart(4, "0")}`;

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
