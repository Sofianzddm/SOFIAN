import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy } from "@/app/api/strategy/_utils";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      statut?: string;
      budgetEstime?: number | null;
      typeActivation?: string | null;
      talents?: unknown;
      ownerId?: string | null;
      montantFinal?: number | null;
      dateActivation?: string | null;
      angleNote?: string | null;
    };

    const updated = await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        statut: body.statut?.trim() || undefined,
        budgetEstime: typeof body.budgetEstime === "number" ? body.budgetEstime : body.budgetEstime === null ? null : undefined,
        typeActivation: body.typeActivation === null ? null : body.typeActivation?.trim() || undefined,
        talents: Array.isArray(body.talents) ? body.talents : undefined,
        ownerId: body.ownerId === undefined ? undefined : body.ownerId,
        montantFinal:
          typeof body.montantFinal === "number"
            ? body.montantFinal
            : body.montantFinal === null
              ? null
              : undefined,
        dateActivation:
          body.dateActivation === undefined
            ? undefined
            : body.dateActivation
              ? new Date(body.dateActivation)
              : null,
        angleNote: body.angleNote === null ? null : body.angleNote?.trim() || undefined,
      },
    });

    return NextResponse.json({ opportunite: updated });
  } catch (error) {
    console.error("Erreur PATCH /api/strategy/opportunites/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise a jour de l'opportunite" },
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
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    await prisma.opportuniteMarque.delete({ where: { id } });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/strategy/opportunites/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de l'opportunite" },
      { status: 500 }
    );
  }
}
