import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const from = new Date(searchParams.get("from") || new Date().toISOString());
  const to = new Date(
    searchParams.get("to") ||
      new Date(from.getFullYear(), from.getMonth() + 3, 0).toISOString()
  );
  const employeeId = searchParams.get("employeeId") || session.employee.id;

  const days = await prisma.rhLeaveDay.findMany({
    where: {
      employeeId,
      date: { gte: from, lte: to },
    },
    include: { request: { select: { status: true, reference: true } } },
    orderBy: { date: "asc" },
  });

  const remote = await prisma.rhRemoteDeclaration.findMany({
    where: {
      employeeId,
      weekStart: { lte: to },
      weekEnd: { gte: from },
    },
  });
  const workRemote = await prisma.rhWorkDay.findMany({
    where: {
      employeeId,
      date: { gte: from, lte: to },
      place: "REMOTE",
    },
    select: { date: true },
  });
  const remoteDates = [
    ...new Set([
      ...remote.flatMap((r) =>
        r.declaredDates.map((d) => d.toISOString().slice(0, 10))
      ),
      ...workRemote.map((d) => d.date.toISOString().slice(0, 10)),
    ]),
  ];

  return NextResponse.json({
    leaveDays: days.map((d) => ({
      date: d.date.toISOString().slice(0, 10),
      accountCode: d.accountCode,
      halfDay: d.halfDay,
      days: d.days,
      status: d.request?.status ?? "APPROVED",
    })),
    remoteDates,
  });
}
