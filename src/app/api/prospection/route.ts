import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/** Jamais de cache CDN / data cache sur la liste (évite une liste vide figée en prod). */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = (session.user.role || "") as string;
    const globalProspectionView = role === "ADMIN" || role === "HEAD_OF_INFLUENCE";

    // Chargement sans include direct sur `user` : si un userId est orphelin (compte supprimé,
    // données migrées), un include Prisma peut faire échouer toute la liste — on charge les users à part.
    const fichiers = await prisma.fichierProspection.findMany({
      where: globalProspectionView ? undefined : { userId: session.user.id },
      include: {
        _count: {
          select: { contacts: true },
        },
        contacts: {
          where: { statut: "GAGNE" },
          select: { id: true },
        },
      },
      orderBy: { updatedAt: "desc" },
    });

    const userIds = [...new Set(fichiers.map((f) => f.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, prenom: true, nom: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const fichiersPayload = fichiers.map((f) => {
      const u = userById.get(f.userId);
      return {
        id: f.id,
        titre: f.titre,
        mois: f.mois,
        annee: f.annee,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        user: {
          id: f.userId,
          name: u ? `${u.prenom} ${u.nom}`.trim() : "Utilisateur inconnu",
          image: null as string | null,
        },
        _count: { contacts: f._count.contacts },
        contactsGagnes: f.contacts.length,
      };
    });
    return NextResponse.json({ fichiers: fichiersPayload });
  } catch (error) {
    console.error("Erreur GET /api/prospection:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des fichiers de prospection" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = (session.user.role || "") as string;

    if (!["ADMIN", "HEAD_OF_INFLUENCE", "TM"].includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json();
    const { titre, mois, annee } = body as {
      titre?: string;
      mois?: number;
      annee?: number;
    };

    const now = new Date();
    const moisValue = typeof mois === "number" && mois >= 1 && mois <= 12 ? mois : now.getMonth() + 1;
    const anneeValue = typeof annee === "number" && annee >= 2000 ? annee : now.getFullYear();

    let finalTitre = (titre || "").trim();
    if (!finalTitre) {
      // Construire "Prénom - Mois Année"
      const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { prenom: true, nom: true },
      });
      const prenom = user?.prenom || (session.user.name || "").split(" ")[0] || "Moi";
      const dateRef = new Date(anneeValue, moisValue - 1, 1);
      const moisLabel = dateRef
        .toLocaleDateString("fr-FR", { month: "long" })
        .replace(/^\p{Letter}/u, (c) => c.toUpperCase());
      finalTitre = `${prenom} - ${moisLabel} ${anneeValue}`;
    }

    const fichier = await prisma.fichierProspection.create({
      data: {
        titre: finalTitre,
        mois: moisValue,
        annee: anneeValue,
        userId,
      },
    });

    return NextResponse.json(
      {
        id: fichier.id,
        titre: fichier.titre,
        mois: fichier.mois,
        annee: fichier.annee,
        createdAt: fichier.createdAt,
        updatedAt: fichier.updatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/prospection:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du fichier de prospection" },
      { status: 500 }
    );
  }
}

