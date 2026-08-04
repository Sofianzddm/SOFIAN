import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { parseParisDateTimeLocalToUtc } from "@/lib/agency-outreach-send";

/**
 * POST → reprogramme la relance J+3 de plusieurs contacts agence.
 * Body : { targetIds: string[], relanceScheduledAt: string }
 * (datetime-local heure Paris, ou ISO)
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;
const MAX_BULK = 100;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      targetIds?: string[];
      relanceScheduledAt?: string;
    };

    const targetIds = Array.isArray(body.targetIds)
      ? [...new Set(body.targetIds.filter((id) => typeof id === "string" && id.trim()))]
      : [];

    if (targetIds.length === 0) {
      return NextResponse.json({ error: "Aucun contact sélectionné." }, { status: 400 });
    }
    if (targetIds.length > MAX_BULK) {
      return NextResponse.json(
        { error: `Maximum ${MAX_BULK} contacts par opération.` },
        { status: 400 }
      );
    }

    const raw = String(body.relanceScheduledAt || "").trim();
    if (!raw) {
      return NextResponse.json(
        { error: "Indiquez la nouvelle date de relance." },
        { status: 400 }
      );
    }
    const scheduled =
      parseParisDateTimeLocalToUtc(raw) ||
      (() => {
        const d = new Date(raw);
        return Number.isNaN(d.getTime()) ? null : d;
      })();
    if (!scheduled) {
      return NextResponse.json({ error: "Date de relance invalide." }, { status: 400 });
    }

    const targets = await prisma.agencyOutreachTarget.findMany({
      where: { id: { in: targetIds } },
      select: {
        id: true,
        email: true,
        touches: {
          where: { sentAt: { not: null } },
          orderBy: { cycleNumber: "desc" },
          take: 1,
          select: {
            id: true,
            relanceSentAt: true,
            repliedAt: true,
          },
        },
      },
    });

    let updated = 0;
    const skipped: { email: string; reason: string }[] = [];

    for (const target of targets) {
      const touch = target.touches[0];
      if (!touch) {
        skipped.push({ email: target.email, reason: "Aucun mail envoyé" });
        continue;
      }
      if (touch.relanceSentAt) {
        skipped.push({ email: target.email, reason: "Relance déjà envoyée" });
        continue;
      }
      if (touch.repliedAt) {
        skipped.push({ email: target.email, reason: "A déjà répondu" });
        continue;
      }

      await prisma.agencyOutreachTouch.update({
        where: { id: touch.id },
        data: {
          relanceScheduledAt: scheduled,
          relanceCancelledAt: null,
          relanceCancelledById: null,
        },
      });
      updated += 1;
    }

    const missing = targetIds.length - targets.length;
    if (missing > 0) {
      skipped.push({ email: "—", reason: `${missing} contact(s) introuvable(s)` });
    }

    return NextResponse.json({
      ok: true,
      updated,
      skipped,
      relanceScheduledAt: scheduled.toISOString(),
    });
  } catch (error) {
    console.error("POST /api/agency-outreach/reschedule-relance-bulk:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
