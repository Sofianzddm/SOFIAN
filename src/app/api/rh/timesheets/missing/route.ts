import { NextRequest, NextResponse } from "next/server";
import {
  canViewRhEmployee,
  isRhHr,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import {
  dateFromIsoWeek,
  listUnsubmittedTimesheets,
  previousIsoWeekRef,
  remindTimesheetSubmit,
} from "@/lib/rh/timesheet";

/** GET ?isoYear=&isoWeek= — feuilles non envoyées pour la semaine. */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhManager(session.employee.rhRole)) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const hr = isRhHr(session.employee.rhRole);
  const sp = request.nextUrl.searchParams;
  const prev = previousIsoWeekRef();
  const isoYear = Number(sp.get("isoYear")) || prev.isoYear;
  const isoWeek = Number(sp.get("isoWeek")) || prev.isoWeek;
  const weekStart = dateFromIsoWeek(isoYear, isoWeek);

  const items = await listUnsubmittedTimesheets({
    isoYear,
    isoWeek,
    ...(hr ? { hr: true } : { managerId: session.employee.id }),
  });

  return NextResponse.json({
    isoYear,
    isoWeek,
    label: `${isoYear}-W${String(isoWeek).padStart(2, "0")}`,
    weekStart: weekStart.toISOString().slice(0, 10),
    items,
  });
}

/**
 * POST { employeeId, isoYear, isoWeek } — envoie un rappel au salarié.
 * POST { action: "bulk", employeeIds, isoYear, isoWeek } — rappels groupés.
 */
export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhManager(session.employee.rhRole)) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const body = await request.json().catch(() => ({}));
  const prev = previousIsoWeekRef();
  const isoYear = Number(body.isoYear) || prev.isoYear;
  const isoWeek = Number(body.isoWeek) || prev.isoWeek;

  try {
    if (body.action === "bulk" && Array.isArray(body.employeeIds)) {
      const ids = (body.employeeIds as unknown[])
        .map((id) => String(id || "").trim())
        .filter(Boolean);
      let ok = 0;
      const errors: Array<{ employeeId: string; error: string }> = [];
      for (const employeeId of ids) {
        const allowed = await canViewRhEmployee(session.employee, employeeId);
        if (!allowed) {
          errors.push({ employeeId, error: "Interdit" });
          continue;
        }
        try {
          await remindTimesheetSubmit({
            employeeId,
            isoYear,
            isoWeek,
            actorId: session.employee.id,
          });
          ok += 1;
        } catch (e) {
          errors.push({
            employeeId,
            error: e instanceof Error ? e.message : "Erreur",
          });
        }
      }
      return NextResponse.json({ reminded: ok, errors });
    }

    const employeeId = String(body.employeeId || "").trim();
    if (!employeeId) {
      return NextResponse.json({ error: "employeeId requis" }, { status: 400 });
    }
    const allowed = await canViewRhEmployee(session.employee, employeeId);
    if (!allowed) {
      return NextResponse.json({ error: "Interdit" }, { status: 403 });
    }

    const result = await remindTimesheetSubmit({
      employeeId,
      isoYear,
      isoWeek,
      actorId: session.employee.id,
    });
    return NextResponse.json(result);
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
