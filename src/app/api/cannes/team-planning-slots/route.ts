import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesEditor } from "@/lib/cannes/auth";
import { isCannesTaskNotesEmpty, sanitizeCannesTaskHtml } from "@/lib/cannes/cannesTaskNotes";
import { parisYmdHhmmToUtc } from "@/lib/cannes/teamPlanningSlotTimes";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: NextRequest) {
  const { error } = await requireCannesEditor();
  if (error) return error;

  let body: {
    presenceId?: string;
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

  const presenceId = (body.presenceId || "").trim();
  const date = (body.date || "").trim();
  const startTime = (body.startTime || "").trim();
  const endTime = (body.endTime || "").trim();

  if (!presenceId || !date || !startTime || !endTime) {
    return NextResponse.json(
      { error: "presenceId, date (yyyy-MM-dd), startTime et endTime (HH:mm) requis" },
      { status: 400 }
    );
  }
  if (!YMD_RE.test(date)) {
    return NextResponse.json({ error: "date invalide" }, { status: 400 });
  }

  const presence = await prisma.cannesPresence.findUnique({ where: { id: presenceId } });
  if (!presence?.userId) {
    return NextResponse.json({ error: "Présence équipe introuvable" }, { status: 404 });
  }

  const startsAt = parisYmdHhmmToUtc(date, startTime);
  const endsAt = parisYmdHhmmToUtc(date, endTime);
  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: "Heures invalides (format HH:mm)" }, { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "L’heure de fin doit être après le début" }, { status: 400 });
  }

  const rawNotes = typeof body.notes === "string" ? body.notes : "";
  const notesOut = isCannesTaskNotesEmpty(rawNotes) ? null : sanitizeCannesTaskHtml(rawNotes);

  const row = await prisma.cannesTeamPlanningSlot.create({
    data: {
      presenceId,
      startsAt,
      endsAt,
      title: (body.title ?? "").trim(),
      location: body.location?.trim() || null,
      notes: notesOut,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
