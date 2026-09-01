import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";

/** Planning équipe : leave days + TT pour gantt / absents. */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  if (!isRhManager(session.employee.rhRole)) {
    return NextResponse.json({ error: "Accès manager/RH requis" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const from = new Date(searchParams.get("from") || new Date());
  from.setHours(0, 0, 0, 0);
  const to = new Date(
    searchParams.get("to") ||
      new Date(from.getFullYear(), from.getMonth(), from.getDate() + 27)
  );
  to.setHours(23, 59, 59, 999);

  const whereEmp =
    session.employee.rhRole === "HR"
      ? { actif: true as const }
      : {
          actif: true as const,
          OR: [
            { id: session.employee.id },
            { managerId: session.employee.id },
          ],
        };

  const employees = await prisma.rhEmployee.findMany({
    where: whereEmp,
    include: { user: { select: { prenom: true, nom: true } } },
    orderBy: { department: "asc" },
  });

  const ids = employees.map((e) => e.id);
  const leaveDays = await prisma.rhLeaveDay.findMany({
    where: {
      employeeId: { in: ids },
      date: { gte: from, lte: to },
      OR: [
        { requestId: null },
        { request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } } },
      ],
    },
  });

  const remotes = await prisma.rhRemoteDeclaration.findMany({
    where: {
      employeeId: { in: ids },
      weekStart: { lte: to },
      weekEnd: { gte: from },
    },
  });
  const workDays = await prisma.rhWorkDay.findMany({
    where: {
      employeeId: { in: ids },
      date: { gte: from, lte: to },
    },
  });

  const byEmp: Record<
    string,
    Array<{ date: string; kind: string; halfDay: boolean }>
  > = {};
  for (const id of ids) byEmp[id] = [];

  for (const d of leaveDays) {
    byEmp[d.employeeId]?.push({
      date: d.date.toISOString().slice(0, 10),
      kind: d.accountCode,
      halfDay: d.halfDay,
    });
  }
  for (const r of remotes) {
    for (const dt of r.declaredDates) {
      const key = dt.toISOString().slice(0, 10);
      if (key >= from.toISOString().slice(0, 10) && key <= to.toISOString().slice(0, 10)) {
        const already = byEmp[r.employeeId]?.some((x) => x.date === key && x.kind === "TT");
        if (!already) {
          byEmp[r.employeeId]?.push({ date: key, kind: "TT", halfDay: false });
        }
      }
    }
  }
  for (const w of workDays) {
    const key = w.date.toISOString().slice(0, 10);
    const kind =
      w.place === "REMOTE"
        ? "TT"
        : w.place === "TRAVEL"
          ? "TRAVEL"
          : w.place === "SITE"
            ? "SITE"
            : "OFFICE";
    const list = byEmp[w.employeeId] ?? [];
    const idx = list.findIndex((x) => x.date === key && (x.kind === "TT" || x.kind === "OFFICE" || x.kind === "TRAVEL" || x.kind === "SITE"));
    if (idx >= 0) list[idx] = { date: key, kind, halfDay: w.half === "AM" || w.half === "PM" };
    else list.push({ date: key, kind, halfDay: w.half === "AM" || w.half === "PM" });
  }

  const todayKey = new Date().toISOString().slice(0, 10);
  const absentToday = employees
    .filter((e) => byEmp[e.id]?.some((x) => x.date === todayKey && x.kind !== "TT"))
    .map((e) => {
      const hit = byEmp[e.id]?.find((x) => x.date === todayKey);
      return {
        id: e.id,
        name: displayName(e.user),
        initials: initials(e.user),
        color: e.avatarColor,
        department: e.department,
        kind: hit?.kind || "CP",
      };
    });

  // Couverture par département
  const depts = [...new Set(employees.map((e) => e.department))];
  const coverage = depts.map((dept) => {
    const team = employees.filter((e) => e.department === dept);
    const absent = team.filter((e) =>
      byEmp[e.id]?.some((x) => x.date === todayKey && x.kind !== "TT")
    ).length;
    const present = Math.max(0, team.length - absent);
    const pct = team.length ? Math.round((present / team.length) * 100) : 100;
    return {
      dept,
      present,
      total: team.length,
      pct,
      label: `${present}/${team.length}`,
      color: pct < 60 ? "#F2604E" : pct < 80 ? "#F0C24E" : "#46D6C0",
    };
  });

  return NextResponse.json({
    from: from.toISOString().slice(0, 10),
    to: to.toISOString().slice(0, 10),
    employees: employees.map((e) => ({
      id: e.id,
      name: displayName(e.user),
      initials: initials(e.user),
      color: e.avatarColor,
      department: e.department,
      matricule: e.matricule,
      events: byEmp[e.id] || [],
    })),
    absentToday,
    coverage,
  });
}
