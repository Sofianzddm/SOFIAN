import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import {
  cartoChatVpsHealth,
  isOutreachChatVpsConfigured,
} from "@/lib/carto-chat-vps/vps-client";
import {
  readOutreachMailVps,
  recoverLatestOutreachMailVps,
  startOutreachMailVps,
} from "@/lib/outreach-mail-vps/run";
import type {
  OutreachMailVpsContact,
  OutreachMailVpsRosterAnalysis,
  OutreachMailVpsTalent,
} from "@/lib/outreach-mail-vps/prompt";

export const maxDuration = 600;

const ALLOWED = [
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "BUSINESS_DEVELOPER",
  "ADMIN",
] as const;

/**
 * Fil serveur — 1 marque outreach.
 * mode=start | read | recover | health
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !ALLOWED.includes(
        session.user.role as (typeof ALLOWED)[number]
      )
    ) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      mode?: string;
      brandName?: string;
      company?: string;
      coveredBrands?: string[];
      market?: "FR" | "BENELUX" | "BOTH";
      contacts?: OutreachMailVpsContact[];
      talents?: OutreachMailVpsTalent[];
      fromEmail?: string | null;
      outreachStatus?: string | null;
      brandResearch?: Record<string, string> | null;
      rosterAnalysis?: OutreachMailVpsRosterAnalysis | null;
      draftContext?: string | null;
      language?: "fr" | "en";
      endMarker?: string;
    };

    const mode =
      body.mode === "read"
        ? "read"
        : body.mode === "recover"
          ? "recover"
          : body.mode === "health"
            ? "health"
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
      const result = await recoverLatestOutreachMailVps({ brandName });
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
      const result = await readOutreachMailVps({ brandName, endMarker });
      return NextResponse.json(result);
    }

    const talents = Array.isArray(body.talents) ? body.talents : [];
    if (talents.length === 0) {
      return NextResponse.json(
        { error: "Sélectionne au moins un talent" },
        { status: 400 }
      );
    }

    const started = await startOutreachMailVps({
      brandName,
      company: body.company || null,
      coveredBrands: body.coveredBrands || [],
      market: body.market || "FR",
      contacts: Array.isArray(body.contacts) ? body.contacts : [],
      talents,
      fromEmail: body.fromEmail || null,
      outreachStatus: body.outreachStatus || null,
      brandResearch: body.brandResearch || null,
      rosterAnalysis: body.rosterAnalysis || null,
      draftContext: body.draftContext || null,
      language: body.language === "en" ? "en" : "fr",
    });

    return NextResponse.json(started, { status: 202 });
  } catch (e) {
    console.error("[outreach-mail-vps]", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur fil serveur VPS" },
      { status: 500 }
    );
  }
}
