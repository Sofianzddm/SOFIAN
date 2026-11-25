import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  cartoChatVpsHealth,
  isCartoChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    if (!isCartoChatVpsConfigured()) {
      return NextResponse.json({
        configured: false,
        ok: false,
        error:
          "CARTO_CHAT_VPS_URL manquant — ex: http://127.0.0.1:3847 via tunnel SSH",
      });
    }

    const health = await cartoChatVpsHealth({ kind: "carto" });
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
