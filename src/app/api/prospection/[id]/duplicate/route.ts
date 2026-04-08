import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ADMIN_ROLES = ["ADMIN", "HEAD_OF_INFLUENCE"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userId = session.user.id;
    const role = (session.user.role || "") as string;

    const original = await prisma.fichierProspection.findUnique({
      where: { id },
      include: {
        user: {
          select: {
            id: true,
          },
        },
        contacts: {
          where: {
            NOT: {
              statut: {
                in: ["GAGNE", "PERDU"],
              },
            },
          },
        },
      },
    });

    if (!original) {
      return NextResponse.json(
        { error: "Fichier introuvable" },
        { status: 404 }
      );
    }

    const canSeeAll = ADMIN_ROLES.includes(role as (typeof ADMIN_ROLES)[number]);
    const isOwner = original.userId === userId;

    if (!canSeeAll && !isOwner) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const duplicated = await prisma.fichierProspection.create({
      data: {
        titre: `${original.titre} (copie)`,
        mois: original.mois,
        annee: original.annee,
        userId: original.userId,
        dossierId: canSeeAll ? original.dossierId : null,
      },
    });

    if (original.contacts.length > 0) {
      await prisma.prospectionContact.createMany({
        data: original.contacts.map((c: any) => ({
          fichierId: duplicated.id,
          nomOpportunite: c.nomOpportunite,
          prenom: c.prenom,
          nom: c.nom,
          email: c.email,
          talentId: c.talentId ?? null,
          notes: c.notes ?? null,
          montantBrut: c.montantBrut ?? null,
          // On repart sans état / actions planifiées
          statut: "EN_ATTENTE",
          prochainStatut: null,
          prochainDate: null,
          actionPrevue: null,
          derniereFait: null,
          actionUpdatedAt: null,
        })),
      });
    }

    return NextResponse.json(
      {
        id: duplicated.id,
        titre: duplicated.titre,
        mois: duplicated.mois,
        annee: duplicated.annee,
        createdAt: duplicated.createdAt,
        updatedAt: duplicated.updatedAt,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/prospection/[id]/duplicate:", error);
    return NextResponse.json(
      { error: "Erreur lors de la duplication du fichier de prospection" },
      { status: 500 }
    );
  }
}

