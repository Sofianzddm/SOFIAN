import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  formatRecontactHoldDate,
  parisStartOfCalendarDay,
} from "@/lib/recontact-hold";

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

/**
 * Pose ou lève une mise en attente sur les contacts d'une marque Outreach.
 * Le statut (À contacter / À recontacter) ne change pas : la carte sort de
 * la file jusqu'au matin de la date, puis y revient avec la note.
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (
      !ALLOWED_ROLES.includes(
        session.user.role as (typeof ALLOWED_ROLES)[number]
      )
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      targets?: Array<{ id?: string; pipeline?: string }>;
      until?: string | null;
      note?: string | null;
    };
    const items = (Array.isArray(body.targets) ? body.targets : [])
      .map((t) => ({
        id: String(t?.id || "").trim(),
        pipeline: String(t?.pipeline || "FR").toUpperCase() === "BENELUX" ? "BENELUX" : "FR",
      }))
      .filter((t) => t.id);
    if (items.length === 0) {
      return NextResponse.json({ error: "Aucun contact." }, { status: 400 });
    }

    const rawUntil = body.until == null ? "" : String(body.until).trim();
    const release = rawUntil === "";
    let until: Date | null = null;
    if (!release) {
      until = parisStartOfCalendarDay(rawUntil.slice(0, 10));
      if (!until) {
        return NextResponse.json({ error: "Date invalide." }, { status: 400 });
      }
      if (until.getTime() <= Date.now()) {
        return NextResponse.json(
          { error: "Choisis une date à partir de demain." },
          { status: 400 }
        );
      }
    }
    const note = release ? null : String(body.note || "").trim().slice(0, 280) || null;

    const frIds = items.filter((t) => t.pipeline === "FR").map((t) => t.id);
    const beIds = items.filter((t) => t.pipeline === "BENELUX").map((t) => t.id);
    const data = {
      manualHoldUntil: until,
      manualHoldNote: note,
    };

    const [fr, be] = await Promise.all([
      frIds.length
        ? prisma.outreachTarget.updateMany({
            where: { id: { in: frIds }, status: { not: "STOPPED" } },
            data,
          })
        : Promise.resolve({ count: 0 }),
      beIds.length
        ? prisma.beneluxOutreachTarget.updateMany({
            where: { id: { in: beIds }, status: { not: "STOPPED" } },
            data,
          })
        : Promise.resolve({ count: 0 }),
    ]);

    return NextResponse.json({
      released: release,
      updated: fr.count + be.count,
      until: until ? until.toISOString() : null,
      untilLabel: until ? formatRecontactHoldDate(until) : null,
    });
  } catch (error) {
    console.error("POST /api/outreach/hold:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
