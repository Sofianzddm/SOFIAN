import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";

const ABSENCE_CODES = new Set([
  "CP",
  "RTT",
  "RECUP",
  "SS",
  "UNPAID",
  "SCHOOL",
  "AUTHORIZED",
]);

/** YYYY-MM-DD depuis une colonne @db.Date (UTC). */
function ymdUtc(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Calendrier officiel équipe — accessible à tous les collaborateurs RH.
 * ?kind=ABSENCE → absences validées / en cours
 * ?kind=TT → télétravail uniquement
 */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const kind = (searchParams.get("kind") || "ABSENCE").toUpperCase();
  if (kind !== "ABSENCE" && kind !== "TT") {
    return NextResponse.json(
      { error: "kind doit être ABSENCE ou TT" },
      { status: 400 }
    );
  }

  const from = new Date(searchParams.get("from") || new Date().toISOString());
  from.setUTCHours(0, 0, 0, 0);
  const toDefault = new Date(
    Date.UTC(from.getUTCFullYear(), from.getUTCMonth() + 2, 0, 23, 59, 59)
  );
  const to = new Date(searchParams.get("to") || toDefault.toISOString());
  to.setUTCHours(23, 59, 59, 999);

  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    include: { user: { select: { prenom: true, nom: true } } },
    orderBy: [{ department: "asc" }, { matricule: "asc" }],
  });
  const ids = employees.map((e) => e.id);
  const empMeta = Object.fromEntries(
    employees.map((e) => [
      e.id,
      {
        id: e.id,
        name: displayName(e.user),
        initials: initials(e.user),
        color: e.avatarColor,
        department: e.department,
      },
    ])
  );

  type Entry = {
    date: string;
    employeeId: string;
    name: string;
    initials: string;
    color: string;
    department: string;
    kind: string;
    halfDay: boolean;
    status: string;
  };

  const entries: Entry[] = [];

  if (kind === "ABSENCE") {
    const leaveDays = await prisma.rhLeaveDay.findMany({
      where: {
        employeeId: { in: ids },
        date: { gte: from, lte: to },
        OR: [
          { requestId: null },
          {
            request: {
              status: { in: ["PENDING", "APPROVED", "SIGNED", "PAUSED"] },
            },
          },
        ],
      },
      include: { request: { select: { status: true } } },
    });

    for (const d of leaveDays) {
      if (!ABSENCE_CODES.has(d.accountCode)) continue;
      const meta = empMeta[d.employeeId];
      if (!meta) continue;
      const status = d.request?.status || "APPROVED";
      entries.push({
        date: ymdUtc(d.date),
        employeeId: d.employeeId,
        name: meta.name,
        initials: meta.initials,
        color: meta.color,
        department: meta.department,
        kind: d.accountCode,
        halfDay: d.halfDay,
        status,
      });
    }
  } else {
    const [remotes, workDays] = await Promise.all([
      prisma.rhRemoteDeclaration.findMany({
        where: {
          employeeId: { in: ids },
          weekStart: { lte: to },
          weekEnd: { gte: from },
        },
      }),
      prisma.rhWorkDay.findMany({
        where: {
          employeeId: { in: ids },
          date: { gte: from, lte: to },
          place: "REMOTE",
        },
      }),
    ]);

    const fromKey = ymdUtc(from);
    const toKey = ymdUtc(to);
    const seen = new Set<string>();

    for (const w of workDays) {
      const date = ymdUtc(w.date);
      const meta = empMeta[w.employeeId];
      if (!meta) continue;
      const key = `${w.employeeId}:${date}`;
      seen.add(key);
      entries.push({
        date,
        employeeId: w.employeeId,
        name: meta.name,
        initials: meta.initials,
        color: meta.color,
        department: meta.department,
        kind: "TT",
        halfDay: w.half === "AM" || w.half === "PM",
        status: "APPROVED",
      });
    }

    for (const r of remotes) {
      const meta = empMeta[r.employeeId];
      if (!meta) continue;
      for (const dt of r.declaredDates) {
        const date = ymdUtc(dt);
        if (date < fromKey || date > toKey) continue;
        const key = `${r.employeeId}:${date}`;
        if (seen.has(key)) continue;
        seen.add(key);
        entries.push({
          date,
          employeeId: r.employeeId,
          name: meta.name,
          initials: meta.initials,
          color: meta.color,
          department: meta.department,
          kind: "TT",
          halfDay: false,
          status: r.exceptional ? "EXCEPTION" : "DECLARED",
        });
      }
    }
  }

  entries.sort((a, b) =>
    a.date === b.date
      ? a.name.localeCompare(b.name, "fr")
      : a.date.localeCompare(b.date)
  );

  const byDate: Record<string, Entry[]> = {};
  for (const e of entries) {
    (byDate[e.date] ??= []).push(e);
  }

  return NextResponse.json({
    kind,
    from: ymdUtc(from),
    to: ymdUtc(to),
    entries,
    byDate,
    employeeCount: employees.length,
  });
}
