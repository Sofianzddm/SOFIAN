import { NextRequest, NextResponse } from "next/server";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  getOrCreateTimesheet,
  replyTimesheetPause,
  signTimesheet,
  submitTimesheet,
  updateTimesheetDays,
} from "@/lib/rh/timesheet";

type Ctx = { params: Promise<{ week: string }> };

/** week = YYYY-Www or ISO date */
function parseWeekParam(week: string): Date {
  if (/^\d{4}-W\d{2}$/.test(week)) {
    const [y, w] = week.split("-W").map(Number);
    const simple = new Date(Date.UTC(y, 0, 1 + (w - 1) * 7));
    return simple;
  }
  return new Date(week);
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { week } = await ctx.params;
  const data = await getOrCreateTimesheet(
    session.employee.id,
    parseWeekParam(week),
    session.employee.weeklyHours
  );
  return NextResponse.json(data);
}

export async function PUT(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { week } = await ctx.params;
  const body = await request.json();
  const { timesheet } = await getOrCreateTimesheet(
    session.employee.id,
    parseWeekParam(week),
    session.employee.weeklyHours
  );
  try {
    const updated = await updateTimesheetDays({
      timesheetId: timesheet.id,
      employeeId: session.employee.id,
      weeklyHours: session.employee.weeklyHours,
      days: body.days,
    });
    return NextResponse.json({ timesheet: updated });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { week } = await ctx.params;
  const body = await request.json();
  const action = body.action as string;
  const { timesheet } = await getOrCreateTimesheet(
    session.employee.id,
    parseWeekParam(week),
    session.employee.weeklyHours
  );
  try {
    if (action === "submit") {
      const result = await submitTimesheet({
        timesheetId: timesheet.id,
        employeeId: session.employee.id,
        overtimeNote: body.overtimeNote,
      });
      return NextResponse.json({ timesheet: result });
    }
    if (action === "sign") {
      const result = await signTimesheet({
        timesheetId: timesheet.id,
        employeeId: session.employee.id,
      });
      return NextResponse.json({ timesheet: result });
    }
    if (action === "reply") {
      await replyTimesheetPause({
        timesheetId: timesheet.id,
        employeeId: session.employee.id,
        reply: body.reply || "",
      });
      return NextResponse.json({ ok: true });
    }
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
