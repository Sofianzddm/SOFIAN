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
          : params.type === "REMOTE_EXCEPTION" || params.type === "REMOTE_PLAN"
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

/** Date calendaire → Date UTC midi (stable pour colonnes @db.Date). */
export function utcNoonFromYmd(ymd: string): Date {
  const [y, m, d] = ymd.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
}

export function ymdLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** ISO week helpers (lundi = début). Dates en UTC midi. */
export function isoWeekInfo(d: Date): {
  isoYear: number;
  isoWeek: number;
  weekStart: Date;
  weekEnd: Date;
} {
  // Ancre sur le jour calendaire local, puis calcul ISO en UTC
  const anchor = utcNoonFromYmd(ymdLocal(d));
  const day = anchor.getUTCDay() || 7; // 1=lun … 7=dim
  const thursday = new Date(anchor);
  thursday.setUTCDate(anchor.getUTCDate() + 4 - day);
  const isoYear = thursday.getUTCFullYear();
  const yearStart = new Date(Date.UTC(isoYear, 0, 1, 12));
  const isoWeek = Math.ceil(
    ((thursday.getTime() - yearStart.getTime()) / 86400000 + 1) / 7
  );
  const weekStart = new Date(anchor);
  weekStart.setUTCDate(anchor.getUTCDate() - (day - 1));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekStart.getUTCDate() + 6);
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
