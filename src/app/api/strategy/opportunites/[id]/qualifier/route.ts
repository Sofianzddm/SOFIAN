import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy, sanitizeOpportuniteForRole } from "@/app/api/strategy/_utils";

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
      contacts?: unknown;
      statut?: string;
      contactQualifie?: boolean;
    };

    if (!Array.isArray(body.contacts)) {
      return NextResponse.json({ error: "contacts doit etre un tableau" }, { status: 400 });
    }

    const opportunite = await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        contacts: body.contacts,
        statut: body.statut?.trim() || "IDENTIFIEE",
        contactQualifie: body.contactQualifie ?? true,
      },
    });

    return NextResponse.json({ opportunite: sanitizeOpportuniteForRole(role, opportunite) });
  } catch (error) {
    console.error("Erreur PATCH /api/strategy/opportunites/[id]/qualifier:", error);
    return NextResponse.json(
      { error: "Erreur lors de la qualification de l'opportunite" },
      { status: 500 }
    );
  }
}
