import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = (session.user.role || "") as string;
    if (role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      dateActivation?: string | null;
      montantFinal?: number | null;
      statutLivraison?: string;
    };

    const deal = await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        dateActivation:
          body.dateActivation === undefined
            ? undefined
            : body.dateActivation
              ? new Date(body.dateActivation)
              : null,
        montantFinal:
          typeof body.montantFinal === "number"
            ? body.montantFinal
            : body.montantFinal === null
              ? null
              : undefined,
        statutLivraison: body.statutLivraison?.trim() || undefined,
      },
    });

    return NextResponse.json({ deal });
  } catch (error) {
    console.error("Erreur PATCH /api/strategy/deals/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise a jour du deal" }, { status: 500 });
  }
}
