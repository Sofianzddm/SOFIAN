import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { executeBeneluxOutreachReschedule } from "@/lib/benelux-outreach-send";

/**
 * POST → met plusieurs prospects BENELUX « en attente » sans envoyer de mail.
 * Body : { targetIds: string[] }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const MAX_BULK = 25;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      targetIds?: string[];
    };
    const targetIds = Array.isArray(body.targetIds)
      ? body.targetIds.filter((id) => typeof id === "string" && id.trim())
      : [];

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Aucun prospect." }, { status: 400 });
    }
    if (targetIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK} prospects par opération.` },
        { status: 400 }
      );
    }

    const targets = await prisma.beneluxOutreachTarget.findMany({
      where: { id: { in: targetIds } },
      select: { id: true, email: true },
    });
    if (targets.length === 0) {
      return NextResponse.json({ error: "Prospects introuvables." }, { status: 404 });
    }

    let rescheduled = 0;
    const failed: { email: string; error: string }[] = [];
    let lastMessage: string | null = null;

    for (const target of targets) {
      const result = await executeBeneluxOutreachReschedule(target.id);
      if (result.ok) {
        rescheduled += 1;
        lastMessage = result.reason;
      } else {
        failed.push({ email: target.email, error: result.error });
      }
    }

    return NextResponse.json({ rescheduled, failed, message: lastMessage });
  } catch (error) {
    console.error("POST /api/benelux-outreach/reschedule-bulk:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
