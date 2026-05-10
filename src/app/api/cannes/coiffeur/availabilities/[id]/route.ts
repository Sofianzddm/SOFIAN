import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import { validateAvailabilityPayload } from "@/lib/cannes-coiffeur/availability";

export const dynamic = "force-dynamic";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;

function prismaDateOnly(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

function formatDateOnlyParis(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;
  const { id } = await params;

  const existing = await prisma.cannesCoiffeurAvailability.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    date?: string;
    startTime?: string;
    endTime?: string;
    prestationId?: string;
    breaks?: unknown;
    note?: string | null | undefined;
  };

  const startTime = body.startTime?.trim() ?? existing.startTime;
  const endTime = body.endTime?.trim() ?? existing.endTime;
  let prestationId: string | null = existing.prestationId;
  if (body.prestationId !== undefined) {
    const raw = String(body.prestationId ?? "").trim();
    if (raw === "") prestationId = null;
    else {
      const prest = await prisma.cannesCoiffeurPrestation.findUnique({ where: { id: raw }, select: { id: true } });
      if (!prest) return NextResponse.json({ error: "prestationId inconnu" }, { status: 400 });
      prestationId = raw;
    }
  }
  const breaks = body.breaks !== undefined ? body.breaks : (existing.breaks as unknown[]);

  const v = validateAvailabilityPayload({
    startTime,
    endTime,
    breaks,
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  let dateField = existing.date;
  if (body.date?.trim()) {
    const ymd = body.date.trim();
    if (!YMD_RE.test(ymd)) return NextResponse.json({ error: "date invalide" }, { status: 400 });
    dateField = prismaDateOnly(ymd);
  }

  const row = await prisma.cannesCoiffeurAvailability.update({
    where: { id },
    data: {
      date: dateField,
      startTime,
      endTime,
      prestationId,
      breaks: breaks as object,
      note:
        body.note === undefined ? existing.note : body.note?.trim() || null,
    },
    include: {
      prestation: { select: { id: true, title: true, slug: true, durationMinutes: true, bufferMinutes: true } },
    },
  });

  return NextResponse.json({
    ...row,
    date: formatDateOnlyParis(row.date),
  });
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;
  const { id } = await params;

  try {
    await prisma.cannesCoiffeurAvailability.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
