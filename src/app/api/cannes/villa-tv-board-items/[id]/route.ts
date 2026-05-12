import { NextRequest, NextResponse } from "next/server";

import { requireCannesEditor } from "@/lib/cannes/auth";
import { isVillaTvBoardDateAllowed, normalizeVillaTvBoardTimeRange } from "@/lib/cannes/villaTvBoardDates";
import { prisma } from "@/lib/prisma";

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesEditor();
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

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

  const existing = await prisma.cannesVillaTvBoardItem.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
  }

  const data: {
    dateYmd?: string;
    timeLabel?: string;
    endTimeLabel?: string | null;
    title?: string;
    body?: string | null;
    sortOrder?: number;
  } = {};

  if (body.dateYmd !== undefined) {
    const y = String(body.dateYmd).trim();
    if (!isVillaTvBoardDateAllowed(y)) {
      return NextResponse.json({ error: "Date invalide" }, { status: 400 });
    }
    data.dateYmd = y;
  }

  if (body.title !== undefined) {
    const t = String(body.title).trim();
    if (!t) return NextResponse.json({ error: "Titre requis" }, { status: 400 });
    data.title = t;
  }

  if (body.body !== undefined) {
    data.body = body.body === null ? null : String(body.body).trim() || null;
  }

  if (body.sortOrder !== undefined) {
    if (typeof body.sortOrder === "number" && Number.isFinite(body.sortOrder)) {
      data.sortOrder = Math.max(0, Math.min(999, Math.floor(body.sortOrder)));
    }
  }

  const touchesSlot =
    body.dateYmd !== undefined || body.timeLabel !== undefined || body.endTimeLabel !== undefined;

  if (touchesSlot) {
    const mergedDate = data.dateYmd ?? existing.dateYmd;
    const mergedStart = body.timeLabel !== undefined ? String(body.timeLabel).trim() || "12:00" : existing.timeLabel;
    let mergedEnd: string | null | undefined;
    if (body.endTimeLabel !== undefined) {
      mergedEnd =
        body.endTimeLabel === null || String(body.endTimeLabel).trim() === ""
          ? null
          : String(body.endTimeLabel).trim();
    } else {
      mergedEnd = existing.endTimeLabel;
    }

    const norm = normalizeVillaTvBoardTimeRange(mergedDate, mergedStart, mergedEnd);
    if (!norm.ok) {
      return NextResponse.json({ error: norm.error }, { status: 400 });
    }

    if (body.dateYmd !== undefined || body.timeLabel !== undefined) {
      data.timeLabel = norm.timeLabel;
    }
    if (body.endTimeLabel !== undefined) {
      data.endTimeLabel = norm.endTimeLabel;
    } else if (body.dateYmd !== undefined || body.timeLabel !== undefined) {
      data.endTimeLabel = norm.endTimeLabel;
    }
  }

  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }

  const row = await prisma.cannesVillaTvBoardItem.update({
    where: { id },
    data,
  });

  return NextResponse.json(row);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesEditor();
  if (error) return error;

  const { id } = await params;
  if (!id) {
    return NextResponse.json({ error: "id requis" }, { status: 400 });
  }

  try {
    await prisma.cannesVillaTvBoardItem.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Entrée introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
