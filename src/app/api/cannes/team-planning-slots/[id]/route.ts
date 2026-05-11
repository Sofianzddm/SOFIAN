import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesEditor } from "@/lib/cannes/auth";
import { isCannesTaskNotesEmpty, sanitizeCannesTaskHtml } from "@/lib/cannes/cannesTaskNotes";
import { parisYmdHhmmToUtc } from "@/lib/cannes/teamPlanningSlotTimes";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

type RouteCtx = { params: Promise<{ id: string }> };

async function findTeamSlotOrNull(id: string) {
  const slot = await prisma.cannesTeamPlanningSlot.findUnique({
    where: { id },
    include: { presence: { select: { userId: true } } },
  });
  if (!slot || !slot.presence.userId) return null;
  return slot;
}

export async function PATCH(req: NextRequest, ctx: RouteCtx) {
  const { error } = await requireCannesEditor();
  if (error) return error;

  const { id } = await ctx.params;
  const slot = await findTeamSlotOrNull(id);
  if (!slot) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

  let body: {
    date?: string;
    startTime?: string;
    endTime?: string;
    title?: string | null;
    location?: string | null;
    notes?: string | null;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const date = (body.date || "").trim();
  const startTime = (body.startTime || "").trim();
  const endTime = (body.endTime || "").trim();
  if (!date || !startTime || !endTime || !YMD_RE.test(date)) {
    return NextResponse.json({ error: "date, startTime et endTime requis" }, { status: 400 });
  }

  const startsAt = parisYmdHhmmToUtc(date, startTime);
  const endsAt = parisYmdHhmmToUtc(date, endTime);
  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: "Heures invalides" }, { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "L’heure de fin doit être après le début" }, { status: 400 });
  }

  const rawNotes = typeof body.notes === "string" ? body.notes : "";
  const notesOut = isCannesTaskNotesEmpty(rawNotes) ? null : sanitizeCannesTaskHtml(rawNotes);

  const updated = await prisma.cannesTeamPlanningSlot.update({
    where: { id: slot.id },
    data: {
      startsAt,
      endsAt,
      title: (body.title ?? "").trim(),
      location: body.location?.trim() || null,
      notes: notesOut,
    },
  });

  return NextResponse.json(updated);
}

export async function DELETE(_req: NextRequest, ctx: RouteCtx) {
  const { error } = await requireCannesEditor();
  if (error) return error;

  const { id } = await ctx.params;
  const slot = await findTeamSlotOrNull(id);
  if (!slot) return NextResponse.json({ error: "Créneau introuvable" }, { status: 404 });

  await prisma.cannesTeamPlanningSlot.delete({ where: { id: slot.id } });
  return NextResponse.json({ ok: true });
}
