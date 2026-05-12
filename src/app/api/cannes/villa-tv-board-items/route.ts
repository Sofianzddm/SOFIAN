import { NextRequest, NextResponse } from "next/server";

import { requireCannesEditor } from "@/lib/cannes/auth";
import { isVillaTvBoardDateAllowed, normalizeVillaTvBoardTimeRange } from "@/lib/cannes/villaTvBoardDates";
import { prisma } from "@/lib/prisma";

export async function GET() {
  const { error } = await requireCannesEditor();
  if (error) return error;

  const items = await prisma.cannesVillaTvBoardItem.findMany({
    orderBy: [{ dateYmd: "asc" }, { sortOrder: "asc" }, { createdAt: "asc" }],
  });

  return NextResponse.json({ items });
}

export async function POST(req: NextRequest) {
  const { error } = await requireCannesEditor();
  if (error) return error;

  let body: {
    dateYmd?: string;
    timeLabel?: string;
    endTimeLabel?: string | null;
    title?: string;
    body?: string | null;
    sortOrder?: number;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const dateYmd = (body.dateYmd || "").trim();
  if (!dateYmd || !isVillaTvBoardDateAllowed(dateYmd)) {
    return NextResponse.json({ error: "Date invalide (jour du festival requis)" }, { status: 400 });
  }

  const title = (body.title || "").trim();
  if (!title) {
    return NextResponse.json({ error: "Titre requis" }, { status: 400 });
  }

  const times = normalizeVillaTvBoardTimeRange(dateYmd, body.timeLabel || "12:00", body.endTimeLabel);
  if (!times.ok) {
    return NextResponse.json({ error: times.error }, { status: 400 });
  }

  const sortOrder =
    typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)
      ? Math.max(0, Math.min(999, Math.floor(body.sortOrder)))
      : 0;

  const textBody =
    body.body === null || body.body === undefined ? null : String(body.body).trim() || null;

  const row = await prisma.cannesVillaTvBoardItem.create({
    data: {
      dateYmd,
      timeLabel: times.timeLabel,
      endTimeLabel: times.endTimeLabel,
      title,
      body: textBody,
      sortOrder,
    },
  });

  return NextResponse.json(row, { status: 201 });
}
