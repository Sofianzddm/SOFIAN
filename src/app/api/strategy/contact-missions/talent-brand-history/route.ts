import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  listTalentBrandLastSends,
  TALENT_BRAND_RECONTACT_DAYS,
} from "@/lib/contact-missions";
import {
  INDIV_BRAND_WAVE_DAYS,
  listIndivBrandWaveSends,
} from "@/lib/contact-cooldown";

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "ADMIN",
] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

/**
 * GET /api/strategy/contact-missions/talent-brand-history?talentId=
 * - history : derniers envois marque×ce talent
 * - brandWave : marques déjà pitchées (tous talents) dans la fenêtre indiv
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!isAllowed(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const talentId = String(request.nextUrl.searchParams.get("talentId") || "").trim();
    if (!talentId) {
      return NextResponse.json({ error: "talentId requis." }, { status: 400 });
    }

    const [history, brandWave] = await Promise.all([
      listTalentBrandLastSends(talentId),
      listIndivBrandWaveSends(),
    ]);

    return NextResponse.json({
      talentId,
      recontactDays: TALENT_BRAND_RECONTACT_DAYS,
      brandWaveDays: INDIV_BRAND_WAVE_DAYS,
      history: history.map((h) => ({
        marqueId: h.marqueId,
        targetBrand: h.targetBrand,
        targetBrandKey: h.targetBrandKey,
        sentAt: h.sentAt.toISOString(),
        daysAgo: h.daysAgo,
        daysLeft: h.daysLeft,
        blocked: h.blocked,
        missionId: h.missionId,
        viaTalent: null as string | null,
        source: "talent" as const,
      })),
      brandWave: brandWave.map((w) => ({
        marqueId: w.marqueId,
        targetBrand: w.targetBrand,
        targetBrandKey: w.targetBrandKey,
        sentAt: w.sentAt.toISOString(),
        daysAgo: w.daysAgo,
        daysLeft: w.daysLeft,
        blocked: true,
        missionId: w.missionId,
        viaTalent: w.creatorName || null,
        talentId: w.talentId,
        source: "wave" as const,
      })),
    });
  } catch (error) {
    console.error("GET /api/strategy/contact-missions/talent-brand-history:", error);
    return NextResponse.json({ error: "Erreur chargement historique." }, { status: 500 });
  }
}
