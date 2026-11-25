/**
 * Simulateur marque — analyse via VPS (plus d’Apify / xAI).
 * Modes : vps_start | health | read_screen
 */

import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessBrandSimulator } from "@/lib/brand-simulator-access";
import {
  brandSimChatHealth,
  runBrandSimReadScreen,
  startBrandSimChat,
} from "@/lib/brand-sim-chat/run";
import { normalizeMomentContext } from "@/lib/brand-sim-chat/prompt";

/** read_screen = structure JSON après analyse longue */
export const maxDuration = 600;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessBrandSimulator(session.user.role, session.user.email)) {
      return NextResponse.json(
        { error: "Simulateur non disponible" },
        { status: 403 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      talentId?: string;
      momentContext?: string;
      endMarker?: string;
      limit?: number;
    };

    const mode =
      body.mode === "health"
        ? "health"
        : body.mode === "read_screen"
          ? "read_screen"
          : body.mode === "vps_start"
            ? "vps_start"
            : "vps_start";

    if (mode === "health") {
      const health = await brandSimChatHealth();
      return NextResponse.json(health);
    }

    const talentId = String(body.talentId || "").trim();
    if (!talentId) {
      return NextResponse.json({ error: "Talent requis" }, { status: 400 });
    }

    const momentContext = normalizeMomentContext(body.momentContext) || null;
    const limit =
      typeof body.limit === "number" && body.limit > 0
        ? Math.min(40, Math.floor(body.limit))
        : 25;

    if (mode === "vps_start") {
      const started = await startBrandSimChat({
        talentId,
        momentContext,
      });
      return NextResponse.json(started, { status: 202 });
    }

    // read_screen
    const result = await runBrandSimReadScreen({
      talentId,
      endMarker: body.endMarker ? String(body.endMarker) : undefined,
      momentContext,
      limit,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[brand-simulator]", e);
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Erreur simulateur marque (Chat VPS)",
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

/** Health GET — pratique pour sondes / UI. */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessBrandSimulator(session.user.role, session.user.email)) {
      return NextResponse.json(
        { error: "Simulateur non disponible" },
        { status: 403 }
      );
    }
    const health = await brandSimChatHealth();
    return NextResponse.json(health);
  } catch (e) {
    return NextResponse.json(
      {
        configured: true,
        ok: false,
        error: e instanceof Error ? e.message : "Worker injoignable",
      },
      { status: 200 }
    );
  }
}
