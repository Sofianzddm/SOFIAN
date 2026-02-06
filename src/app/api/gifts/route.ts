import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// GET /api/gifts - Liste des demandes de gifts
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };
    const { searchParams } = new URL(req.url);
    const statut = searchParams.get("statut");
    const talentId = searchParams.get("talentId");

    // Construction de la requête selon le rôle
    let where: any = {};

    if (user.role === "TM") {
      // TM voit uniquement ses demandes
      where.tmId = user.id;
    } else if (user.role === "CM") {
      // Account Manager (CM) voit toutes les demandes
      // Optionnel : filtrer celles qui lui sont assignées
      // where.accountManagerId = user.id;
    } else if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE"].includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    if (statut && statut !== "TOUS") {
      where.statut = statut;
    }

    if (talentId) {
      where.talentId = talentId;
    }

    const demandes = await prisma.demandeGift.findMany({
      where,
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
            instagram: true,
          },
        },
        tm: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        accountManager: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
          },
        },
        marque: {
          select: {
            id: true,
            nom: true,
          },
        },
        commentaires: {
          orderBy: { createdAt: "desc" },
          take: 1,
          select: {
            id: true,
            contenu: true,
            createdAt: true,
            auteur: {
              select: {
                prenom: true,
                nom: true,
              },
            },
          },
        },
      },
      orderBy: [
        { priorite: "desc" },
        { createdAt: "desc" },
      ],
    });

    return NextResponse.json(demandes);
  } catch (error) {
    console.error("Erreur GET /api/gifts:", error);
    return NextResponse.json(
      { error: "Erreur serveur" },
      { status: 500 }
    );
  }
}

// POST /api/gifts - Créer une demande de gift
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role: string };

    // Seuls les TM peuvent créer des demandes
    if (user.role !== "TM") {
      return NextResponse.json(
        { error: "Seuls les Talent Managers peuvent créer des demandes de gifts" },
        { status: 403 }
      );
    }

    const body = await req.json();
    const {
      talentId,
      marqueId,
      typeGift,
      description,
      justification,
      valeurEstimee,
      priorite,
      dateSouhaitee,
      adresseLivraison,
      statut,
    } = body;

    // Validation
    if (!talentId || !typeGift || !description) {
      return NextResponse.json(
        { error: "Champs obligatoires manquants" },
        { status: 400 }
      );
    }

    // Vérifier que le TM gère bien ce talent
    const talent = await prisma.talent.findFirst({
      where: {
        id: talentId,
        managerId: user.id,
      },
    });

    if (!talent) {
      return NextResponse.json(
        { error: "Vous ne gérez pas ce talent" },
        { status: 403 }
      );
    }

    // Générer la référence
    const year = new Date().getFullYear();
    const lastDemande = await prisma.demandeGift.findFirst({
      where: {
        reference: {
          startsWith: `GIFT-${year}-`,
        },
      },
      orderBy: { reference: "desc" },
    });

    let nextNumber = 1;
    if (lastDemande) {
      const lastNumber = parseInt(lastDemande.reference.split("-")[2]);
      nextNumber = lastNumber + 1;
    }

    const reference = `GIFT-${year}-${nextNumber.toString().padStart(4, "0")}`;

    // Créer la demande
    const demande = await prisma.demandeGift.create({
      data: {
        reference,
        talentId,
        tmId: user.id,
        marqueId: marqueId || null,
        typeGift,
        description,
        justification: justification || null,
        valeurEstimee: valeurEstimee ? parseFloat(valeurEstimee) : null,
        priorite: priorite || "NORMALE",
        datesouhaitee: dateSouhaitee ? new Date(dateSouhaitee) : null,
        adresseLivraison: adresseLivraison || null,
        statut: statut || "EN_ATTENTE", // Par défaut EN_ATTENTE (soumise)
      },
      include: {
        talent: {
          select: {
            prenom: true,
            nom: true,
          },
        },
        marque: {
          select: {
            nom: true,
          },
        },
      },
    });

    // Créer une notification pour les Account Managers
    // TODO: Implémenter le système de notifications

    return NextResponse.json(demande, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/gifts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de la demande" },
      { status: 500 }
    );
  }
}
