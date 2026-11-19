import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  cartoChatVpsHealth,
  isOutreachChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import {
  readOutreachRosterVps,
  recoverLatestOutreachRosterVps,
  startOutreachRosterVps,
} from "@/lib/outreach-roster-vps/run";
import type { OutreachRosterVpsTalent } from "@/lib/outreach-roster-vps/prompt";

export const maxDuration = 600;

const ALLOWED = [
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "BUSINESS_DEVELOPER",
  "ADMIN",
] as const;

/**
 * Fil serveur — analyse roster (priorité + why) pour 1 marque.
 * mode=start | read | health
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !ALLOWED.includes(session.user.role as (typeof ALLOWED)[number])
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      brandName?: string;
      company?: string;
      coveredBrands?: string[];
      market?: "FR" | "BENELUX" | "BOTH";
      talents?: OutreachRosterVpsTalent[];
      brandResearch?: Record<string, string> | null;
      endMarker?: string;
    };

    const mode =
      body.mode === "read"
        ? "read"
        : body.mode === "health"
          ? "health"
          : body.mode === "recover"
            ? "recover"
            : "start";

    if (mode === "health") {
      if (!isOutreachChatVpsConfigured()) {
        return NextResponse.json({
          ok: false,
          error: "OUTREACH_CHAT_VPS_URL manquant",
        });
      }
      const health = await cartoChatVpsHealth({ kind: "outreach" });
      return NextResponse.json(health);
    }

    const brandName = String(body.brandName || "").trim();
    if (!brandName) {
      return NextResponse.json({ error: "Marque requise" }, { status: 400 });
    }

    if (mode === "recover") {
      const result = await recoverLatestOutreachRosterVps({ brandName });
      return NextResponse.json(result);
    }

    if (mode === "read") {
      const endMarker = String(body.endMarker || "").trim();
      if (!endMarker) {
        return NextResponse.json(
          { error: "endMarker requis" },
          { status: 400 }
        );
      }
      const result = await readOutreachRosterVps({ brandName, endMarker });
      return NextResponse.json(result);
    }

    const talents = Array.isArray(body.talents) ? body.talents : [];
    if (talents.length === 0) {
      return NextResponse.json(
        { error: "Roster vide — charge des talents d’abord" },
        { status: 400 }
      );
    }

    const started = await startOutreachRosterVps({
      brandName,
      company: body.company || null,
      coveredBrands: body.coveredBrands || [],
      market: body.market || "FR",
      talents,
      brandResearch: body.brandResearch || null,
    });

    return NextResponse.json(started, { status: 202 });
  } catch (e) {
    console.error("[outreach-roster-vps]", e);
    return NextResponse.json(
      {
        error:
          e instanceof Error ? e.message : "Erreur analyse roster serveur",
      },
      { status: 500 }
    );
  }
}
