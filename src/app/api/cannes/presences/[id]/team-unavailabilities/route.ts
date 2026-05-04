import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/cannes/auth";

function utcDayKey(d: Date) {
  return d.toISOString().slice(0, 10);
}

function rangesOverlapDayKeys(startA: Date, endA: Date, startB: Date, endB: Date) {
  return utcDayKey(startA) <= utcDayKey(endB) && utcDayKey(endA) >= utcDayKey(startB);
}

type RouteCtx = { params: Promise<{ id: string }> };

export async function POST(req: NextRequest, ctx: RouteCtx) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: presenceId } = await ctx.params;
  const presence = await prisma.cannesPresence.findUnique({ where: { id: presenceId } });
  if (!presence?.userId) {
    return NextResponse.json({ error: "Présence équipe introuvable" }, { status: 404 });
  }

  let body: { startDate?: string; endDate?: string; label?: string | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  if (!body.startDate || !body.endDate) {
    return NextResponse.json({ error: "startDate et endDate requis" }, { status: 400 });
  }

  const startDate = new Date(body.startDate);
  const endDate = new Date(body.endDate);
  if (Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime())) {
    return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
  }
  if (utcDayKey(startDate) > utcDayKey(endDate)) {
    return NextResponse.json({ error: "La date de début doit être avant la fin" }, { status: 400 });
  }

  if (!rangesOverlapDayKeys(startDate, endDate, presence.arrivalDate, presence.departureDate)) {
    return NextResponse.json(
      { error: "La période doit chevaucher les dates de présence sur place" },
      { status: 400 }
    );
  }

  const row = await prisma.cannesTeamUnavailability.create({
    data: {
      presenceId,
      startDate,
      endDate,
      label: body.label?.trim() || null,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
