import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  formatRecontactHoldDate,
  parisStartOfCalendarDay,
} from "@/lib/recontact-hold";

const ALLOWED_ROLES = [
  "STRATEGY_PLANNER",
  "CASTING_MANAGER",
  "HEAD_OF",
  "ADMIN",
] as const;

const OPEN_STAGES = [
  "STRATEGY_DEFINED",
  "TO_DRAFT",
  "DRAFTED_FOR_VALIDATION",
  "TO_SEND",
] as const;

/**
 * Pose ou lève une mise en attente de recontact sur toutes les cartes ouvertes
 * de la même marque (tous talents). La date est le matin où elles reviennent
 * dans leur colonne.
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
      missionId?: string;
      until?: string | null;
      note?: string | null;
    };
    const missionId = String(body.missionId || "").trim();
    if (!missionId) {
      return NextResponse.json({ error: "missionId requis." }, { status: 400 });
    }

    const mission = await prisma.contactMission.findUnique({
      where: { id: missionId },
      select: {
        id: true,
        marqueId: true,
        targetBrandKey: true,
        targetBrand: true,
        stage: true,
        sentAt: true,
        marque: { select: { nom: true } },
      },
    });
    if (!mission) {
      return NextResponse.json({ error: "Carte introuvable." }, { status: 404 });
    }
    if (mission.sentAt || mission.stage === "SENT") {
      return NextResponse.json(
        { error: "Cette carte est déjà envoyée." },
        { status: 400 }
      );
    }

    const brandOr = [
      ...(mission.marqueId ? [{ marqueId: mission.marqueId }] : []),
      { targetBrandKey: mission.targetBrandKey },
    ];
    const where = {
      sentAt: null,
      stage: { in: [...OPEN_STAGES] },
      OR: brandOr,
    };

    const rawUntil = body.until == null ? "" : String(body.until).trim();
    const release = rawUntil === "";

    if (release) {
      const updated = await prisma.contactMission.updateMany({
        where,
        data: {
          recontactHoldUntil: null,
          recontactHoldNote: null,
          recontactHoldById: null,
        },
      });
      return NextResponse.json({
        released: true,
        updated: updated.count,
        brand: mission.marque?.nom || mission.targetBrand,
      });
    }

    const until = parisStartOfCalendarDay(rawUntil.slice(0, 10));
    if (!until) {
      return NextResponse.json({ error: "Date invalide." }, { status: 400 });
    }
    if (until.getTime() <= Date.now()) {
      return NextResponse.json(
        { error: "Choisis une date à partir de demain." },
        { status: 400 }
      );
    }

    const note = String(body.note || "").trim().slice(0, 280) || null;
    const updated = await prisma.contactMission.updateMany({
      where,
      data: {
        recontactHoldUntil: until,
        recontactHoldNote: note,
        recontactHoldById: session.user.id,
      },
    });

    return NextResponse.json({
      released: false,
      updated: updated.count,
      until: until.toISOString(),
      untilLabel: formatRecontactHoldDate(until),
      brand: mission.marque?.nom || mission.targetBrand,
    });
  } catch (error) {
    console.error("POST /api/strategy/contact-missions/recontact-hold:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
