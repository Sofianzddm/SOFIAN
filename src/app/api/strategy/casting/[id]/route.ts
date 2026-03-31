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
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const body = (await request.json()) as {
      statut?: string;
      dateArrivee?: string | null;
      dateDepart?: string | null;
      notes?: string | null;
    };

    const updated = await prisma.participantVilla.update({
      where: { id },
      data: {
        statut: body.statut?.trim() || undefined,
        dateArrivee: body.dateArrivee === undefined ? undefined : body.dateArrivee ? new Date(body.dateArrivee) : null,
        dateDepart: body.dateDepart === undefined ? undefined : body.dateDepart ? new Date(body.dateDepart) : null,
        notes: body.notes === undefined ? undefined : body.notes,
      },
    });

    return NextResponse.json({ participant: updated });
  } catch (error) {
    console.error("Erreur PATCH /api/strategy/casting/[id]:", error);
    return NextResponse.json({ error: "Erreur lors de la mise a jour du participant" }, { status: 500 });
  }
}
