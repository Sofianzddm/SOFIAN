import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CANNES_OPP_STATUTS,
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";

async function assertCannesOpp(id: string) {
  return prisma.opportuniteMarque.findFirst({
    where: {
      id,
      projet: { slug: CANNES_PARTENAIRES_SLUG },
    },
  });
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user.role || "") as string;
    if (!canAccessCannesPartenaires(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const existing = await assertCannesOpp(id);
    if (!existing) {
      return NextResponse.json({ error: "Opportunité introuvable" }, { status: 404 });
    }

    const body = (await request.json()) as {
      statut?: string;
      angleNote?: string | null;
      ownerId?: string | null;
    };

    const statut =
      body.statut &&
      CANNES_OPP_STATUTS.includes(
        body.statut as (typeof CANNES_OPP_STATUTS)[number]
      )
        ? body.statut
        : undefined;

    const updated = await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        statut,
        angleNote:
          body.angleNote === null
            ? null
            : body.angleNote?.trim() || undefined,
        ownerId: body.ownerId === undefined ? undefined : body.ownerId,
      },
    });

    return NextResponse.json({ opportunite: updated });
  } catch (error) {
    console.error("PATCH /api/cannes-partenaires/opportunites/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user.role || "") as string;
    if (!canAccessCannesPartenaires(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const existing = await assertCannesOpp(id);
    if (!existing) {
      return NextResponse.json({ error: "Opportunité introuvable" }, { status: 404 });
    }

    await prisma.opportuniteMarque.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/cannes-partenaires/opportunites/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression" },
      { status: 500 }
    );
  }
}
