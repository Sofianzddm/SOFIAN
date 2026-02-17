import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// GET - Liste des négociations (filtrée par rôle)
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const { searchParams } = new URL(request.url);
    const statut = searchParams.get("statut");
    const tmId = searchParams.get("tmId");

    // Construire le where selon le rôle
    const where: any = {};

    // TM ne voit que ses négos
    if (session.user.role === "TM") {
      where.tmId = session.user.id;
    }
    // Head Of et Admin voient tout (possibilité de filtrer par TM)
    else if (tmId) {
      where.tmId = tmId;
    }

    if (statut) {
      where.statut = statut;
    }

    const negociations = await prisma.negociation.findMany({
      where,
      include: {
        tm: {
          select: { id: true, prenom: true, nom: true },
        },
        talent: {
          select: { id: true, prenom: true, nom: true, photo: true },
        },
        marque: {
          select: { id: true, nom: true, secteur: true },
        },
        livrables: true,
        validateur: {
          select: { id: true, prenom: true, nom: true },
        },
        _count: {
          select: { commentaires: true },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json(negociations);
  } catch (error) {
    console.error("Erreur GET négociations:", error);
    return NextResponse.json({ message: "Erreur" }, { status: 500 });
  }
}

// POST - Créer une négociation
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const data = await request.json();

    if (!data.talentId) {
      return NextResponse.json({ message: "Talent obligatoire" }, { status: 400 });
    }
    // Marque : soit marqueId (existant), soit nomMarqueSaisi (texte libre → fiche marque créée à la validation)
    const hasMarque = data.marqueId || (data.nomMarqueSaisi && String(data.nomMarqueSaisi).trim());
    if (!hasMarque) {
      return NextResponse.json({ message: "Nom de la marque obligatoire" }, { status: 400 });
    }

    // Générer la référence NEG-2026-0001
    const year = new Date().getFullYear();
    const compteur = await prisma.compteur.upsert({
      where: { type_annee: { type: "NEG", annee: year } },
      update: { dernierNumero: { increment: 1 } },
      create: { type: "NEG", annee: year, dernierNumero: 1 },
    });
    const reference = `NEG-${year}-${String(compteur.dernierNumero).padStart(4, "0")}`;

    const nomMarqueSaisi = data.nomMarqueSaisi ? String(data.nomMarqueSaisi).trim() : null;
    const marqueId = data.marqueId || null;

    // Créer la négociation (marqueId optionnel si nomMarqueSaisi fourni)
    const negociation = await prisma.negociation.create({
      data: {
        reference,
        tmId: session.user.id, // Le TM connecté
        talentId: data.talentId,
        marqueId,
        nomMarqueSaisi: nomMarqueSaisi || null,
        contactMarque: data.contactMarque || null,
        emailContact: data.emailContact || null,
        source: data.source || "INBOUND",
        brief: data.brief || null,
        budgetMarque: data.budgetMarque ? parseFloat(data.budgetMarque) : null,
        budgetSouhaite: data.budgetSouhaite ? parseFloat(data.budgetSouhaite) : null,
        dateDeadline: data.dateDeadline ? new Date(data.dateDeadline) : null,
        statut: "BROUILLON", // Créer en brouillon, le TM devra soumettre
        livrables: {
          create: (data.livrables || []).map((l: any) => ({
            typeContenu: l.typeContenu,
            quantite: l.quantite || 1,
            prixDemande: l.prixDemande ? parseFloat(l.prixDemande) : null,
            prixSouhaite: l.prixSouhaite ? parseFloat(l.prixSouhaite) : null,
            description: l.description || null,
          })),
        },
      },
      include: {
        tm: { select: { prenom: true, nom: true } },
        talent: { select: { prenom: true, nom: true } },
        marque: { select: { id: true, nom: true } },
        livrables: true,
      },
    });

    return NextResponse.json(negociation, { status: 201 });
  } catch (error) {
    console.error("Erreur POST négociation:", error);
    return NextResponse.json({ message: "Erreur lors de la création" }, { status: 500 });
  }
}
