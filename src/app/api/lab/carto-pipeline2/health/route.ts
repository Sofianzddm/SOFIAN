import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessCartoAiPipeline } from "@/lib/carto-ai/constants";
import {
  cartoChatVpsHealth,
  isCartoChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !canAccessCartoAiPipeline({
        email: session.user.email,
        role: session.user.role,
      })
    ) {
      return NextResponse.json({ error: "Lab non disponible" }, { status: 403 });
    }

    if (!isCartoChatVpsConfigured()) {
      return NextResponse.json({
        configured: false,
        ok: false,
        error:
          "CARTO_CHAT_VPS_URL manquant — ex: http://127.0.0.1:3847 via tunnel SSH",
      });
    }

    const health = await cartoChatVpsHealth();
    return NextResponse.json({ configured: true, ...health });
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
