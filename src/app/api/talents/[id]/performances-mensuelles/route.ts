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

  const talent = await prisma.talent.findUnique({
    where: { id: talentId },
    select: { id: true },
  });
  if (!talent) {
    return { ok: false, status: 404, error: "Talent non trouvé" };
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

// GET — liste des performances mensuelles (année/mois desc)
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { id: talentId } = await params;
    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true },
    });
    if (!talent) {
      return NextResponse.json({ error: "Talent non trouvé" }, { status: 404 });
    }

    const performances = await prisma.talentPerformanceMensuelle.findMany({
      where: { talentId },
      orderBy: [{ annee: "desc" }, { mois: "desc" }],
    });

    return NextResponse.json(performances);
  } catch (error) {
    console.error("Erreur GET performances-mensuelles:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

// POST — créer ou upsert un mois
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const userRole = session.user.role;
    const userId = (session.user as { id?: string }).id;
    const { id: talentId } = await params;

    const access = await assertCanEditTalent(userId, userRole, talentId);
    if (!access.ok) {
      return NextResponse.json({ error: access.error }, { status: access.status });
    }

    const body = await request.json();
    const annee = Number(body.annee);
    const mois = Number(body.mois);

    if (!Number.isInteger(annee) || annee < 2000 || annee > 2100) {
      return NextResponse.json({ error: "Année invalide" }, { status: 400 });
    }
    if (!Number.isInteger(mois) || mois < 1 || mois > 12) {
      return NextResponse.json({ error: "Mois invalide" }, { status: 400 });
    }

    const data = {
      igMoyenneVuesReels: parseOptionalInt(body.igMoyenneVuesReels) ?? null,
      igMoyenneLikes: parseOptionalInt(body.igMoyenneLikes) ?? null,
      igMeilleurReelUrl: parseOptionalString(body.igMeilleurReelUrl) ?? null,
      igMeilleurReelVues: parseOptionalInt(body.igMeilleurReelVues) ?? null,
      ttMoyenneVues: parseOptionalInt(body.ttMoyenneVues) ?? null,
      ttMoyenneLikes: parseOptionalInt(body.ttMoyenneLikes) ?? null,
      ttMeilleurTiktokUrl: parseOptionalString(body.ttMeilleurTiktokUrl) ?? null,
      ttMeilleurTiktokVues: parseOptionalInt(body.ttMeilleurTiktokVues) ?? null,
      notes: parseOptionalString(body.notes) ?? null,
    };

    const performance = await prisma.talentPerformanceMensuelle.upsert({
      where: {
        talentId_annee_mois: { talentId, annee, mois },
      },
      create: { talentId, annee, mois, ...data },
      update: data,
    });

    return NextResponse.json(performance, { status: 201 });
  } catch (error) {
    console.error("Erreur POST performances-mensuelles:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
