import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession, resolveProspectionActor } from "@/lib/getAppSession";
import {
  findDossierProspectionById,
  listDossiersProspection,
} from "@/lib/prospectionDossiersDb";

/** Jamais de cache CDN / data cache sur la liste (évite une liste vide figée en prod). */
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const actor = await resolveProspectionActor(session);
    const globalProspectionView =
      actor.role === "ADMIN" || actor.role === "HEAD_OF_INFLUENCE";

    // Chargement sans include direct sur `user` : si un userId est orphelin (compte supprimé,
    // données migrées), un include Prisma peut faire échouer toute la liste — on charge les users à part.
    const [fichiers, dossiersPayload] = await Promise.all([
      prisma.fichierProspection.findMany({
        where: globalProspectionView ? undefined : { userId: actor.userId },
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
      }),
      globalProspectionView
        ? listDossiersProspection(true, actor.userId)
        : Promise.resolve([]),
    ]);

    const dossierNomById = new Map(
      dossiersPayload.map((d) => [d.id, d.nom] as const)
    );

    console.info(
      "[prospection-api] GET",
      JSON.stringify({
        fichiersCount: fichiers.length,
        jwtUserId: session.user.id,
        actorUserId: actor.userId,
        role: actor.role,
        resolution: actor.resolution,
        globalProspectionView,
        idsMatch: session.user.id === actor.userId,
      })
    );

    const userIds = [...new Set(fichiers.map((f) => f.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, prenom: true, nom: true },
    });
    const userById = new Map(users.map((u) => [u.id, u]));

    const fichiersPayload = fichiers.map((f) => {
      const u = userById.get(f.userId);
      const showDossierMeta = globalProspectionView;
      return {
        id: f.id,
        titre: f.titre,
        mois: f.mois,
        annee: f.annee,
        createdAt: f.createdAt,
        updatedAt: f.updatedAt,
        dossierId: showDossierMeta ? f.dossierId : null,
        dossier:
          showDossierMeta && f.dossierId != null
            ? {
                id: f.dossierId,
                nom: dossierNomById.get(f.dossierId) ?? "Dossier",
              }
            : null,
        user: {
          id: f.userId,
          name: u ? `${u.prenom} ${u.nom}`.trim() : "Utilisateur inconnu",
          image: null as string | null,
        },
        _count: { contacts: f._count.contacts },
        contactsGagnes: f.contacts.length,
      };
    });

    return NextResponse.json({
      fichiers: fichiersPayload,
      dossiers: dossiersPayload.map((d) => ({
        id: d.id,
        nom: d.nom,
        fichierCount: d.fichierCount,
      })),
    });
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
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const actor = await resolveProspectionActor(session);
    const userId = actor.userId;
    const role = actor.role;
    const canManageDossiers =
      role === "ADMIN" || role === "HEAD_OF_INFLUENCE";

    console.info(
      "[prospection-api] POST",
      JSON.stringify({
        jwtUserId: session.user.id,
        actorUserId: actor.userId,
        role: actor.role,
        resolution: actor.resolution,
      })
    );

    if (!["ADMIN", "HEAD_OF_INFLUENCE", "TM"].includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json();
    const { titre, mois, annee, dossierId: dossierIdRaw } = body as {
      titre?: string;
      mois?: number;
      annee?: number;
      dossierId?: string | null;
    };

    let dossierId: string | null | undefined = undefined;
    if (canManageDossiers && dossierIdRaw !== undefined) {
      if (dossierIdRaw === null || dossierIdRaw === "") {
        dossierId = null;
      } else {
        const d = await findDossierProspectionById(String(dossierIdRaw).trim());
        if (!d || d.userId !== userId) {
          return NextResponse.json(
            { error: "Dossier invalide ou non autorisé" },
            { status: 400 }
          );
        }
        dossierId = d.id;
      }
    }

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
        ...(dossierId !== undefined && { dossierId }),
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

