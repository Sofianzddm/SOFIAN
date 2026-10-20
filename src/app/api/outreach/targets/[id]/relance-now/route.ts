import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { applyCastingTemplateVars, buildOutreachRelanceTemplate } from "@/lib/casting-auto-send";
import { executeOutreachRelance } from "@/lib/outreach-send";

/**
 * Relance manuelle sur le dernier mail de cycle envoyé.
 * GET  → prévisualisation (?round=1|2)
 * POST → envoi immédiat ({ subject?, body?, round? })
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function checkRole(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

function parseRound(raw: unknown): 1 | 2 {
  return raw === 2 || raw === "2" ? 2 : 1;
}

async function loadLatestSentTouch(targetId: string) {
  return prisma.outreachTouch.findFirst({
    where: { targetId, sentAt: { not: null } },
    orderBy: { cycleNumber: "desc" },
    include: { target: true },
  });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!checkRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const round = parseRound(request.nextUrl.searchParams.get("round"));
    const touch = await loadLatestSentTouch(id);
    if (!touch) {
      return NextResponse.json(
        { error: "Aucun mail de cycle envoyé pour ce client." },
        { status: 409 }
      );
    }
    if (round === 1 && touch.relanceSentAt) {
      return NextResponse.json(
        { error: "La relance 1 a déjà été envoyée pour ce mail." },
        { status: 409 }
      );
    }
    if (round === 2) {
      if (!touch.relanceSentAt) {
        return NextResponse.json(
          { error: "La relance 1 doit partir avant la relance 2." },
          { status: 409 }
        );
      }
      if (touch.relance2SentAt) {
        return NextResponse.json(
          { error: "La relance 2 a déjà été envoyée pour ce mail." },
          { status: 409 }
        );
      }
    }

    const subjectSrc = touch.subject.trim();
    const subject = subjectSrc.toLowerCase().startsWith("re:")
      ? subjectSrc
      : `Re: ${subjectSrc}`;
    const lang: "fr" | "en" =
      touch.target.language === "en" ? "en" : "fr";

    let bodyHtml = "";
    let aiGenerated = false;
    try {
      const { generateOutreachRelanceBody } = await import(
        "@/lib/outreach-relance-ai"
      );
      const ai = await generateOutreachRelanceBody({
        touchId: touch.id,
        round,
        language: lang,
        company: touch.target.company,
        previousSubject: touch.subject,
        previousBodyHtml: touch.bodyHtml || "",
        firstSentAt: touch.sentAt,
      });
      if (ai?.bodyHtml?.trim()) {
        bodyHtml = ai.bodyHtml.trim();
        aiGenerated = true;
      }
    } catch (e) {
      console.warn(
        "[outreach/relance-now] IA soft-fail:",
        e instanceof Error ? e.message : e
      );
    }
    if (!bodyHtml) {
      bodyHtml = buildOutreachRelanceTemplate(
        touch.target.company,
        lang,
        touch.sentAt
      );
    }

    const body = applyCastingTemplateVars(bodyHtml, {
      firstname: touch.target.firstname || "",
      lastname: touch.target.lastname || "",
      company: touch.target.company || "",
    });

    return NextResponse.json({
      draft: {
        subject,
        body,
        touchId: touch.id,
        cycleNumber: touch.cycleNumber,
        round,
        aiGenerated,
      },
    });
  } catch (error) {
    console.error("GET /api/outreach/targets/[id]/relance-now:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!checkRole(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const touch = await loadLatestSentTouch(id);
    if (!touch) {
      return NextResponse.json(
        { error: "Aucun mail de cycle envoyé pour ce client." },
        { status: 409 }
      );
    }

    const body = (await request.json().catch(() => ({}))) as {
      subject?: string;
      body?: string;
      round?: 1 | 2 | "1" | "2";
    };

    const result = await executeOutreachRelance(touch.id, {
      subjectOverride: body.subject,
      bodyOverride: body.body,
      round: parseRound(body.round),
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({
      ok: true,
      messageId: result.messageId,
      round: parseRound(body.round),
    });
  } catch (error) {
    console.error("POST /api/outreach/targets/[id]/relance-now:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
