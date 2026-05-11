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
    date?: string;
    startTime?: string;
    endTime?: string;
    title?: string | null;
    location?: string | null;
    notes?: string | null;
    presenceIds?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Corps invalide" }, { status: 400 });
  }

  const date = (body.date || "").trim();
  const startTime = (body.startTime || "").trim();
  const endTime = (body.endTime || "").trim();

  if (!date || !startTime || !endTime) {
    return NextResponse.json(
      { error: "date (yyyy-MM-dd), startTime et endTime (HH:mm) requis" },
      { status: 400 }
    );
  }
  if (!YMD_RE.test(date)) {
    return NextResponse.json({ error: "date invalide" }, { status: 400 });
  }

  const rawIds = Array.isArray(body.presenceIds) ? body.presenceIds : [];
  const presenceIds = [...new Set(rawIds.map((x) => String(x).trim()).filter(Boolean))];
  if (presenceIds.length === 0) {
    return NextResponse.json({ error: "presenceIds: au moins une présence requise" }, { status: 400 });
  }

  const presences = await prisma.cannesPresence.findMany({
    where: { id: { in: presenceIds }, userId: { not: null } },
    select: { id: true },
  });

  if (presences.length !== presenceIds.length) {
    return NextResponse.json(
      { error: "Présences invalides : uniquement des collaborateurs équipe (avec userId)." },
      { status: 400 }
    );
  }

  const startsAt = parisYmdHhmmToUtc(date, startTime);
  const endsAt = parisYmdHhmmToUtc(date, endTime);
  if (!startsAt || !endsAt) {
    return NextResponse.json({ error: "Heures invalides (format HH:mm)" }, { status: 400 });
  }
  if (endsAt.getTime() <= startsAt.getTime()) {
    return NextResponse.json({ error: "L’heure de fin doit être après le début" }, { status: 400 });
  }

  const title = (body.title ?? "").trim();
  const location = body.location?.trim() || null;
  const rawNotes = typeof body.notes === "string" ? body.notes : "";
  const notesOut = isCannesTaskNotesEmpty(rawNotes) ? null : sanitizeCannesTaskHtml(rawNotes);

  const created = await prisma.$transaction(
    presenceIds.map((presenceId) =>
      prisma.cannesTeamPlanningSlot.create({
        data: {
          presenceId,
          startsAt,
          endsAt,
          title,
          location,
          notes: notesOut,
        },
      })
    )
  );

  return NextResponse.json({ created: created.length }, { status: 201 });
}
