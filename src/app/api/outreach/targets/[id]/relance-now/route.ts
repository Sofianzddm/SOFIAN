import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { applyCastingTemplateVars, buildDefaultRelanceTemplate } from "@/lib/casting-auto-send";
import { executeOutreachRelance } from "@/lib/outreach-send";

/**
 * Relance manuelle J+3 sur le dernier mail de cycle envoyé.
 * GET  → prévisualisation (sujet + corps) sans envoi
 * POST → envoi immédiat ({ subject?, body? } pour personnaliser)
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function checkRole(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
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
    const touch = await loadLatestSentTouch(id);
    if (!touch) {
      return NextResponse.json(
        { error: "Aucun mail de cycle envoyé pour ce client." },
        { status: 409 }
      );
    }
    if (touch.relanceSentAt) {
      return NextResponse.json(
        { error: "Une relance a déjà été envoyée pour ce mail." },
        { status: 409 }
      );
    }

    const subjectSrc = touch.subject.trim();
    const subject = subjectSrc.toLowerCase().startsWith("re:")
      ? subjectSrc
      : `Re: ${subjectSrc}`;
    const body = applyCastingTemplateVars(
      buildDefaultRelanceTemplate(
        touch.target.company,
        touch.target.language === "en" ? "en" : "fr"
      ),
      {
        firstname: touch.target.firstname || "",
        lastname: touch.target.lastname || "",
        company: touch.target.company || "",
      }
    );

    return NextResponse.json({
      draft: { subject, body, touchId: touch.id, cycleNumber: touch.cycleNumber },
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
    };

    const result = await executeOutreachRelance(touch.id, {
      subjectOverride: body.subject,
      bodyOverride: body.body,
    });

    if (!result.ok) {
      return NextResponse.json({ error: result.error }, { status: 422 });
    }

    return NextResponse.json({ ok: true, messageId: result.messageId });
  } catch (error) {
    console.error("POST /api/outreach/targets/[id]/relance-now:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
