import prisma from "@/lib/prisma";
import type { Prisma, RhRequestStatus, RhRequestType } from "@prisma/client";
import { isWorkday } from "@/lib/rh/holidays";

export { isWorkday, isWeekday, isFrenchHoliday } from "@/lib/rh/holidays";

export async function nextRhReference(prefix: string): Promise<string> {
  const year = new Date().getFullYear();
  const count = await prisma.rhRequest.count({
    where: {
      reference: { startsWith: `${prefix}-${year}-` },
    },
  });
  return `${prefix}-${year}-${String(count + 1).padStart(4, "0")}`;
}

export async function writeRhAudit(params: {
  actorId?: string | null;
  targetId?: string | null;
  action: string;
  detail?: Record<string, unknown>;
}) {
  await prisma.rhAuditLog.create({
    data: {
      actorId: params.actorId ?? null,
      targetId: params.targetId ?? null,
      action: params.action,
      detail: (params.detail ?? {}) as Prisma.InputJsonValue,
    },
  });
}

export async function createRhRequest(params: {
  type: RhRequestType;
  status?: RhRequestStatus;
  employeeId: string;
  title: string;
  comment?: string;
  payload?: Record<string, unknown>;
  days?: number;
  dateFrom?: Date;
  dateTo?: Date;
  prefix?: string;
}) {
  const prefix =
    params.prefix ??
    (params.type === "LEAVE" || params.type === "UNPAID_LEAVE"
      ? "REQ"
      : params.type === "EXPENSE"
        ? "NDF"
        : params.type === "TIMESHEET"
          ? "TS"
          : params.type === "REMOTE_EXCEPTION"
            ? "TT"
            : "RH");

  const reference = await nextRhReference(prefix);
  return prisma.rhRequest.create({
    data: {
      reference,
      type: params.type,
      status: params.status ?? "PENDING",
      employeeId: params.employeeId,
      title: params.title,
      comment: params.comment,
      payload: (params.payload ?? {}) as Prisma.InputJsonValue,
      days: params.days,
      dateFrom: params.dateFrom,
      dateTo: params.dateTo,
    },
  });
}

/** ISO week helpers (lundi = début). */
export function isoWeekInfo(d: Date): {
  isoYear: number;
  isoWeek: number;
  weekStart: Date;
  weekEnd: Date;
} {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const isoYear = date.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1));
  const isoWeek = Math.ceil(
    ((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  const weekStart = new Date(d);
  const dow = (weekStart.getDay() + 6) % 7;
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - dow);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  return { isoYear, isoWeek, weekStart, weekEnd };
}

export function eachDate(from: Date, to: Date): Date[] {
  const out: Date[] = [];
  const cur = new Date(from);
  cur.setHours(0, 0, 0, 0);
  const end = new Date(to);
  end.setHours(0, 0, 0, 0);
  while (cur <= end) {
    out.push(new Date(cur));
    cur.setDate(cur.getDate() + 1);
  }
  return out;
}

export function countWeekdays(from: Date, to: Date, halfDay: boolean): number {
  const days = eachDate(from, to).filter((d) => isWorkday(d));
  if (days.length === 0) return 0;
  if (halfDay && days.length === 1) return 0.5;
  return halfDay ? days.length - 0.5 : days.length;
}
