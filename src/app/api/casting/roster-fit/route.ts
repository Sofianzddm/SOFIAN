import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  ROSTER_FIT_MAX_TALENTS,
  hasBrandResearchBrief,
  normalizeBrandResearch,
  runRosterFitForBrand,
} from "@/lib/casting-roster-fit-core";

export const maxDuration = 300;

const ALLOWED_ROLES = [
  "CASTING_MANAGER",
  "STRATEGY_PLANNER",
  "HEAD_OF_SALES",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAllowed(session.user.role)) {
      return NextResponse.json(
        {
          error:
            "Accès réservé aux rôles Casting, Strategy ou Administrateur.",
        },
        { status: 403 }
      );
    }

    if (!process.env.XAI_API_KEY?.trim()) {
      return NextResponse.json(
        { error: "Clé XAI_API_KEY non configurée sur le serveur." },
        { status: 500 }
      );
    }

    const body = await request.json().catch(() => null);
    const brandName =
      typeof body?.brandName === "string" ? body.brandName.trim() : "";
    const rawIds: unknown[] = Array.isArray(body?.talentIds)
      ? (body.talentIds as unknown[])
      : [];
    const talentIds = Array.from(
      new Set(
        rawIds
          .map((id) => String(id ?? "").trim())
          .filter((id) => id.length > 0)
      )
    ).slice(0, ROSTER_FIT_MAX_TALENTS);

    const brandResearch = normalizeBrandResearch(body?.brandResearch);

    if (!brandName || talentIds.length === 0) {
      return NextResponse.json(
        { error: "brandName et talentIds sont requis." },
        { status: 400 }
      );
    }
    if (!hasBrandResearchBrief(brandResearch)) {
      return NextResponse.json(
        {
          error:
            "brandResearch (analyse marque) requis pour juger le fit casting.",
        },
        { status: 400 }
      );
    }

    try {
      const talents = await runRosterFitForBrand({
        brandName,
        brandResearch,
        talentIds,
      });
      return NextResponse.json({ talents });
    } catch (e) {
      console.error(`roster-fit (${brandName}):`, e);
      return NextResponse.json(
        {
          error:
            e instanceof Error && e.message.includes("Aucun talent")
              ? e.message
              : "L'analyse casting n'a pas abouti (délai ou parse). Réessaie.",
        },
        { status: e instanceof Error && e.message.includes("Aucun talent") ? 404 : 502 }
      );
    }
  } catch (e) {
    console.error("POST /api/casting/roster-fit:", e);
    return NextResponse.json(
      { error: "Erreur serveur lors de l'analyse casting." },
      { status: 500 }
    );
  }
}
