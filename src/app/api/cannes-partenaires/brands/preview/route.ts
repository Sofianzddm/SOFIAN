import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import {
  cannesBrandsChatHealth,
  runCannesBrandsReadScreen,
  startCannesBrandsChat,
} from "@/lib/cannes-partenaires/brands-run";

export const maxDuration = 600;

/**
 * Analyse Chat « quelles marques contacter » pour Festival de Cannes.
 * Modes : vps_start | health | read_screen
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      focus?: string;
      endMarker?: string;
      limit?: number;
    };

    const mode =
      body.mode === "health"
        ? "health"
        : body.mode === "read_screen"
          ? "read_screen"
          : "vps_start";

    if (mode === "health") {
      const health = await cannesBrandsChatHealth();
      return NextResponse.json(health);
    }

    const focus = typeof body.focus === "string" ? body.focus : null;

    if (mode === "vps_start") {
      const started = await startCannesBrandsChat({ focus });
      return NextResponse.json(started, { status: 202 });
    }

    const result = await runCannesBrandsReadScreen({
      endMarker: body.endMarker ? String(body.endMarker) : undefined,
      focus,
      limit:
        typeof body.limit === "number" && body.limit > 0
          ? Math.min(45, Math.max(20, Math.floor(body.limit)))
          : 35,
    });
    return NextResponse.json(result);
  } catch (e) {
    console.error("[cannes-partenaires/brands] preview:", e);
    const status =
      e && typeof e === "object" && "status" in e
        ? Number((e as { status: number }).status) || 500
        : 500;
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Erreur analyse marques Cannes",
      },
      { status: status >= 400 && status < 600 ? status : 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }
    const health = await cannesBrandsChatHealth();
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
