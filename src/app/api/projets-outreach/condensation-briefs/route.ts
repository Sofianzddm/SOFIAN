import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { isProjetsOutreachRole } from "@/lib/projets-outreach";
import {
  getCondensationSiblingBriefs,
  getMissionCastingGate,
} from "@/lib/brand-condensation";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!isProjetsOutreachRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const missionId = String(request.nextUrl.searchParams.get("missionId") || "").trim();
    if (!missionId) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }

    const gate = await getMissionCastingGate(missionId, {
      role: session.user.role,
    });
    const briefs = await getCondensationSiblingBriefs(missionId);

    return NextResponse.json({
      gate,
      condensationBriefs: briefs ?? [],
    });
  } catch (error) {
    console.error("GET /api/projets-outreach/condensation-briefs:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
