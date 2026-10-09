import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { createRhRequest } from "@/lib/rh/workflow";
import { notifyRhRequestCreated } from "@/lib/rh/notify";

const schema = z.object({
  date: z.string().min(8),
  fromBreak: z.string().regex(/^\d{2}:\d{2}$/),
  toBreak: z.string().regex(/^\d{2}:\d{2}$/),
  motive: z.string().min(3).max(2000),
});

/** Aménagement horaire (ex. décalage pause déjeuner) → validation manager. */
export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const raw = await request.json().catch(() => null);
  const parsed = schema.safeParse(raw);
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const body = parsed.data;
  const date = new Date(`${body.date.slice(0, 10)}T12:00:00`);
  const req = await createRhRequest({
    type: "PAUSE_AMEND",
    status: "PENDING",
    employeeId: session.employee.id,
    title: `Aménagement pause · ${body.date.slice(0, 10)}`,
    comment: body.motive,
    dateFrom: date,
    dateTo: date,
    days: 0,
    payload: {
      date: body.date.slice(0, 10),
      fromBreak: body.fromBreak,
      toBreak: body.toBreak,
      motive: body.motive,
    },
    prefix: "AH",
  });
  void notifyRhRequestCreated({
    employeeId: session.employee.id,
    title: req.title,
    reference: req.reference,
    type: "aménagement horaire",
  });
  return NextResponse.json({ request: req }, { status: 201 });
}
