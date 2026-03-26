import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ADMIN_ROLES = ["ADMIN", "HEAD_OF_INFLUENCE"] as const;

async function getSessionAndFichier(request: NextRequest, id: string) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return { error: NextResponse.json({ error: "Non autorisé" }, { status: 401 }) };
  }

  const userId = session.user.id;
  const role = (session.user.role || "") as string;

  const fichier = await prisma.fichierProspection.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          id: true,
          prenom: true,
          nom: true,
        },
      },
      contacts: {
        orderBy: { createdAt: "asc" },
        include: {
          _count: {
            select: {
              commentaires: true,
            },
          },
        },
      },
    },
  });

  if (!fichier) {
    return { error: NextResponse.json({ error: "Fichier introuvable" }, { status: 404 }) };
  }

  const canSeeAll = ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
  const isOwner = fichier.userId === userId;

  if (!canSeeAll && !isOwner) {
    return { error: NextResponse.json({ error: "Accès refusé" }, { status: 403 }) };
  }

  return { session, fichier, role, userId };
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getSessionAndFichier(request, id);
    if ("error" in result) return result.error;

    const { fichier } = result;

    return NextResponse.json({
      id: fichier.id,
      titre: fichier.titre,
      mois: fichier.mois,
      annee: fichier.annee,
      createdAt: fichier.createdAt,
      updatedAt: fichier.updatedAt,
      user: {
        id: fichier.user.id,
        name: `${fichier.user.prenom} ${fichier.user.nom}`.trim(),
      },
      contacts: fichier.contacts.map((c: any) => ({
        ...c,
        commentCount: c._count?.commentaires || 0,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/prospection/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement du fichier de prospection" },
      { status: 500 }
    );
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getSessionAndFichier(request, id);
    if ("error" in result) return result.error;

    const { role } = result;

    // HEAD_OF_INFLUENCE & ADMIN peuvent modifier tous les fichiers
    if (!["ADMIN", "HEAD_OF_INFLUENCE", "TM"].includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json();
    const { titre } = body as { titre?: string };
    const finalTitre = (titre || "").trim();

    if (!finalTitre) {
      return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    }

    const updated = await prisma.fichierProspection.update({
      where: { id },
      data: { titre: finalTitre },
    });

    return NextResponse.json({
      id: updated.id,
      titre: updated.titre,
      mois: updated.mois,
      annee: updated.annee,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    });
  } catch (error) {
    console.error("Erreur PATCH /api/prospection/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour du fichier de prospection" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const result = await getSessionAndFichier(request, id);
    if ("error" in result) return result.error;

    const { role, fichier, userId } = result;

    const isOwner = fichier.userId === userId;
    const isAdmin = role === "ADMIN";

    // HEAD_OF_INFLUENCE ne peut pas supprimer
    if (!isAdmin && !isOwner) {
      return NextResponse.json({ error: "Suppression non autorisée" }, { status: 403 });
    }

    await prisma.fichierProspection.delete({
      where: { id },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/prospection/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du fichier de prospection" },
      { status: 500 }
    );
  }
}

