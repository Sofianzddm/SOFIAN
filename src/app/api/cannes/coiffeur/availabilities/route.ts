import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import { validateAvailabilityPayload } from "@/lib/cannes-coiffeur/availability";

export const dynamic = "force-dynamic";

const YMD_RE = /^\d{4}-\d{2}-\d{2}$/;
/** Limite anti-abus création en masse de règles (jours calendaires). */
const MAX_DAYS_BATCH = 120;

function prismaDateOnly(ymd: string): Date {
  return new Date(`${ymd}T12:00:00.000Z`);
}

export async function GET(req: NextRequest) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from")?.trim();
  const to = searchParams.get("to")?.trim();

  const where: { date?: { gte?: Date; lte?: Date } } = {};
  if (from && YMD_RE.test(from)) {
    where.date = { ...where.date, gte: prismaDateOnly(from) };
  }
  if (to && YMD_RE.test(to)) {
    where.date = { ...where.date, lte: prismaDateOnly(to) };
  }

  const rows = await prisma.cannesCoiffeurAvailability.findMany({
    where,
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: {
      prestation: { select: { id: true, title: true, slug: true, durationMinutes: true, bufferMinutes: true } },
    },
  });

  return NextResponse.json(
    rows.map((r) => ({
      ...r,
      date: formatDateOnlyParis(r.date),
      prestation: r.prestation,
    }))
  );
}

function formatDateOnlyParis(d: Date): string {
  return new Intl.DateTimeFormat("sv-SE", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    timeZone: "UTC",
  }).format(d);
}

/** Jours `yyyy-MM-dd` de `from` à `to` inclus (ordre lexicographique = calendrier pour ce format). */
function enumerateInclusiveYmd(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (true) {
    out.push(cur);
    if (cur >= to) break;
    const d = new Date(`${cur}T12:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + 1);
    cur = d.toISOString().slice(0, 10);
  }
  return out;
}

export async function POST(req: NextRequest) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    date?: string;
    dateFrom?: string;
    dateTo?: string;
    startTime?: string;
    endTime?: string;
    prestationId?: string;
    breaks?: unknown;
    note?: string | null;
  };

  const df = body.dateFrom?.trim() ?? "";
  const dt = body.dateTo?.trim() ?? "";
  const single = body.date?.trim() ?? "";

  let days: string[];

  if (df || dt) {
    if (!YMD_RE.test(df) || !YMD_RE.test(dt)) {
      return NextResponse.json(
        { error: "Plage : dateFrom et dateTo requises au format YYYY-MM-DD" },
        { status: 400 }
      );
    }
    if (df > dt) {
      return NextResponse.json({ error: "dateFrom doit etre avant ou egale a dateTo" }, { status: 400 });
    }
    days = enumerateInclusiveYmd(df, dt);
    if (days.length > MAX_DAYS_BATCH) {
      return NextResponse.json(
        { error: `Maximum ${MAX_DAYS_BATCH} jours par enregistrement (plage trop longue)` },
        { status: 400 }
      );
    }
  } else if (YMD_RE.test(single)) {
    days = [single];
  } else {
    return NextResponse.json(
      { error: "Indique date=YYYY-MM-DD pour un jour, ou dateFrom et dateTo pour une plage" },
      { status: 400 }
    );
  }

  const pv = body.prestationId;
  const rawPrest = pv === undefined || pv === null ? "" : String(pv).trim();
  const prestationId = rawPrest === "" ? null : rawPrest;

  if (prestationId) {
    const prestExists = await prisma.cannesCoiffeurPrestation.findUnique({
      where: { id: prestationId },
      select: { id: true },
    });
    if (!prestExists) {
      return NextResponse.json({ error: "prestationId inconnu" }, { status: 400 });
    }
  }

  const v = validateAvailabilityPayload({
    startTime: body.startTime ?? "",
    endTime: body.endTime ?? "",
    breaks: body.breaks ?? [],
  });
  if (!v.ok) return NextResponse.json({ error: v.error }, { status: 400 });

  const startT = body.startTime!.trim();
  const endT = body.endTime!.trim();
  const breaksData = body.breaks === undefined ? [] : (body.breaks as object);
  const noteVal = body.note?.trim() || null;

  if (days.length === 1) {
    const row = await prisma.cannesCoiffeurAvailability.create({
      data: {
        date: prismaDateOnly(days[0]),
        startTime: startT,
        endTime: endT,
        prestationId,
        breaks: breaksData,
        note: noteVal,
      },
      include: {
        prestation: { select: { id: true, title: true, slug: true, durationMinutes: true, bufferMinutes: true } },
      },
    });
    return NextResponse.json(
      { ...row, date: formatDateOnlyParis(row.date), batch: false },
      { status: 201 }
    );
  }

  // createMany exige parfois `prestationId` même à null de façon bancale → transaction de `create` (même comportement SQL).
  await prisma.$transaction(
    days.map((ymd) =>
      prisma.cannesCoiffeurAvailability.create({
        data: {
          date: prismaDateOnly(ymd),
          startTime: startT,
          endTime: endT,
          prestationId,
          breaks: breaksData,
          note: noteVal,
        },
      })
    )
  );

  return NextResponse.json(
    { ok: true, batch: true, created: days.length, dates: days },
    { status: 201 }
  );
}
