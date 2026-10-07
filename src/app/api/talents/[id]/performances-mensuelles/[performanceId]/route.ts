import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { getTalentIdsAccessibles } from "@/lib/delegations";

const EDIT_ROLES = ["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"];

function parseOptionalInt(value: unknown): number | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === "") return null;
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n);
}

function parseOptionalString(value: unknown): string | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}

async function assertCanEditTalent(
  userId: string | undefined,
  userRole: string,
  talentId: string
): Promise<{ ok: true } | { ok: false; status: number; error: string }> {
  if (!EDIT_ROLES.includes(userRole)) {
    return { ok: false, status: 403, error: "Permissions insuffisantes" };
  }

  if (userRole === "TM") {
    if (!userId) {
      return { ok: false, status: 401, error: "Non autorisé" };
    }
    const talentIds = await getTalentIdsAccessibles(userId);
    if (!talentIds.includes(talentId)) {
      return {
        ok: false,
        status: 403,
        error:
          "Vous ne pouvez modifier que vos propres talents ou ceux dont vous avez le relais",
      };
    }
  }

  return { ok: true };
}

// PATCH — mettre à jour une performance existante
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; performanceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userRole = session.user.role;
    const userId = (session.user as { id?: string }).id;
    const { id: talentId, performanceId } = await params;

    const access = await assertCanEditTalent(userId, userRole, talentId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await prisma.talentPerformanceMensuelle.findFirst({
      where: { id: performanceId, talentId },
    });
    if (!existing) {
      return NextResponse.json({ error: "Performance non trouvée" }, { status: 404 });
    }

    const body = await request.json();
    const updateData: Record<string, unknown> = {};

    if (body.annee !== undefined) {
      const annee = Number(body.annee);
      if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
        return NextResponse.json({ error: "Année invalide" }, { status: 400 });
      }
      updateData.annee = annee;
    }
    if (body.mois !== undefined) {
      const mois = Number(body.mois);
      if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
        return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
      }
      updateData.mois = mois;
    }

    const intFields = [
      "igMoyenneVuesReels",
      "igMoyenneLikes",
      "igMeilleurReelVues",
      "ttMoyenneVues",
      "ttMoyenneLikes",
      "ttMeilleurTiktokVues",
    ] as const;
    for (const field of intFields) {
      if (body[field] !== undefined) {
        updateData[field] = parseOptionalInt(body[field]) ?? null;
      }
    }

    const stringFields = [
      "igMeilleurReelUrl",
      "ttMeilleurTiktokUrl",
      "notes",
    ] as const;
    for (const field of stringFields) {
      if (body[field] !== undefined) {
        updateData[field] = parseOptionalString(body[field]) ?? null;
      }
    }

    try {
      const performance = await prisma.talentPerformanceMensuelle.update({
        where: { id: performanceId },
        data: updateData,
      });
      return NextResponse.json(performance);
    } catch (err: unknown) {
      // Conflit d'unicité si on change année/mois vers un mois déjà existant
      if (
        err &&
        typeof err === "object" &&
        "code" in err &&
        (err as { code: string }).code === "P2002"
      ) {
        return NextResponse.json(
          { error: "Une performance existe déjà pour ce mois" },
          { status: 409 }
        );
      }
      throw err;
    }
  } catch (error) {
    console.error("Erreur PATCH performances-mensuelles:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// DELETE — supprimer une performance
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string; performanceId: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userRole = session.user.role;
    const userId = (session.user as { id?: string }).id;
    const { id: talentId, performanceId } = await params;

    const access = await assertCanEditTalent(userId, userRole, talentId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const existing = await prisma.talentPerformanceMensuelle.findFirst({
      where: { id: performanceId, talentId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Performance non trouvée" }, { status: 404 });
    }

    await prisma.talentPerformanceMensuelle.delete({
      where: { id: performanceId },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE performances-mensuelles:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
