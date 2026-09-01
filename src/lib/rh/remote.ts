import prisma from "@/lib/prisma";
import { remoteEntitlement } from "@/lib/rh/calculations";
import { createRhRequest, isoWeekInfo, writeRhAudit } from "@/lib/rh/workflow";
import { notifyRhRequestCreated } from "@/lib/rh/notify";

export async function getRemoteWeeksForEmployee(
  employeeId: string,
  agreementDays: 0 | 2 | 3,
  fromWeekStart: Date,
  weekCount = 4
) {
  const weeks = [];
  for (let i = 0; i < weekCount; i++) {
    const start = new Date(fromWeekStart);
    start.setDate(start.getDate() + i * 7);
    const info = isoWeekInfo(start);
    const absences = await prisma.rhLeaveDay.count({
      where: {
        employeeId,
        date: { gte: info.weekStart, lte: info.weekEnd },
        request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
      },
    });
    const decl = await prisma.rhRemoteDeclaration.findUnique({
      where: {
        employeeId_isoYear_isoWeek: {
          employeeId,
          isoYear: info.isoYear,
          isoWeek: info.isoWeek,
        },
      },
    });
    const entitlement = remoteEntitlement(agreementDays, absences);
    const declared = decl?.declaredDates?.length ?? 0;
    let verdict: "compliant" | "over" | "none" | "undeclared" = "undeclared";
    if (declared === 0 && entitlement === 0) verdict = "none";
    else if (declared === 0) verdict = "undeclared";
    else if (declared > entitlement) verdict = "over";
    else verdict = "compliant";

    weeks.push({
      isoYear: info.isoYear,
      isoWeek: info.isoWeek,
      weekStart: info.weekStart,
      weekEnd: info.weekEnd,
      absenceDays: absences,
      entitlement,
      declaredDates: (decl?.declaredDates ?? []).map((d) =>
        d.toISOString().slice(0, 10)
      ),
      declared,
      verdict,
      exceptional: decl?.exceptional ?? false,
      compensationWeek: decl?.compensationWeek ?? null,
    });
  }
  return weeks;
}

export async function upsertRemoteDeclaration(params: {
  employeeId: string;
  agreementDays: 0 | 2 | 3;
  isoYear: number;
  isoWeek: number;
  weekStart: Date;
  weekEnd: Date;
  declaredDates: Date[];
  note?: string;
}) {
  const absences = await prisma.rhLeaveDay.count({
    where: {
      employeeId: params.employeeId,
      date: { gte: params.weekStart, lte: params.weekEnd },
      request: { status: { in: ["PENDING", "APPROVED", "SIGNED"] } },
    },
  });
  const entitlement = remoteEntitlement(params.agreementDays, absences);
  if (params.declaredDates.length > entitlement) {
    throw new Error(
      `Dépassement article 1.6 : droit ${entitlement} j, déclaré ${params.declaredDates.length} j`
    );
  }

  const row = await prisma.rhRemoteDeclaration.upsert({
    where: {
      employeeId_isoYear_isoWeek: {
        employeeId: params.employeeId,
        isoYear: params.isoYear,
        isoWeek: params.isoWeek,
      },
    },
    create: {
      employeeId: params.employeeId,
      isoYear: params.isoYear,
      isoWeek: params.isoWeek,
      weekStart: params.weekStart,
      weekEnd: params.weekEnd,
      declaredDates: params.declaredDates,
      note: params.note,
    },
    update: {
      declaredDates: params.declaredDates,
      note: params.note,
    },
  });

  await writeRhAudit({
    actorId: params.employeeId,
    targetId: params.employeeId,
    action: "remote.declare",
    detail: { isoWeek: params.isoWeek, count: params.declaredDates.length },
  });

  return row;
}

export async function requestRemoteException(params: {
  employeeId: string;
  date: Date;
  compensateNextWeek: boolean;
  motive: string;
  isoYear: number;
  isoWeek: number;
}) {
  if (!params.motive.trim()) {
    throw new Error("Motif obligatoire pour un jour TT exceptionnel");
  }
  const request = await createRhRequest({
    type: "REMOTE_EXCEPTION",
    status: "PENDING",
    employeeId: params.employeeId,
    title: `TT exceptionnel · ${params.date.toISOString().slice(0, 10)}`,
    comment: params.motive,
    dateFrom: params.date,
    dateTo: params.date,
    days: 1,
    payload: {
      date: params.date.toISOString().slice(0, 10),
      compensateNextWeek: params.compensateNextWeek,
      isoYear: params.isoYear,
      isoWeek: params.isoWeek,
    },
    prefix: "TT",
  });
  void notifyRhRequestCreated({
    employeeId: params.employeeId,
    title: request.title,
    reference: request.reference,
    type: "télétravail exceptionnel",
  });
  return request;
}
