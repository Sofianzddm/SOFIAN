import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  isRhHr,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { minutesToLabel } from "@/lib/rh/calculations";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  // Inbox validations = admin RH uniquement
  if (!isRhHr(session.employee.rhRole)) {
    return NextResponse.json({ items: [] });
  }

  const where: Prisma.RhRequestWhereInput = {
    status: { in: ["PENDING", "PAUSED"] },
    employeeId: { not: session.employee.id },
  };

  const requests = await prisma.rhRequest.findMany({
    where,
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
      expenseReport: {
        include: {
          lines: { orderBy: { date: "asc" } },
        },
      },
      timesheet: {
        include: { days: { orderBy: { date: "asc" } } },
      },
      leaveDays: { orderBy: { date: "asc" }, take: 31 },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  // Enrichir si la relation n’est pas liée (payload-only)
  const items = await Promise.all(
    requests.map(async (r) => {
      const payload = r.payload as Record<string, unknown>;
      let detail: Record<string, unknown> = {
        comment: r.comment,
        reviewNote: r.reviewNote,
      };

      if (r.type === "LEAVE" || r.type === "UNPAID_LEAVE") {
        detail = {
          ...detail,
          accountCode: payload.accountCode,
          leaveDays: r.leaveDays.map((d) => ({
            date: d.date.toISOString().slice(0, 10),
            halfDay: d.halfDay,
            days: d.days,
          })),
          coverage: payload.coverage,
        };
      }

      if (r.type === "EXPENSE") {
        let report = r.expenseReport;
        if (!report && typeof payload.reportId === "string") {
          report = await prisma.rhExpenseReport.findUnique({
            where: { id: payload.reportId },
            include: { lines: { orderBy: { date: "asc" } } },
          });
        }
        const allTalentIds = [
          ...new Set(
            (report?.lines || []).flatMap((l) => l.talentIds || [])
          ),
        ];
        const talentRows = allTalentIds.length
          ? await prisma.talent.findMany({
              where: { id: { in: allTalentIds } },
              select: { id: true, prenom: true, nom: true },
            })
          : [];
        const talentLabel = Object.fromEntries(
          talentRows.map((t) => [t.id, `${t.prenom} ${t.nom}`.trim()])
        );

        detail = {
          ...detail,
          reportId: report?.id,
          totalAmount: report ? Number(report.totalAmount) : null,
          lines: (report?.lines || []).map((l) => ({
            date: l.date.toISOString().slice(0, 10),
            category: l.category,
            label: l.label,
            amount: Number(l.amount),
            receiptUrl: l.receiptUrl,
            missingReceipt: l.missingReceipt,
            isMileage: l.isMileage,
            km: l.km,
            justification: l.justification,
            ocrVerified: l.ocrVerified,
            talentIds: l.talentIds || [],
            talentLabels: (l.talentIds || []).map(
              (id) => talentLabel[id] || id
            ),
          })),
        };
      }

      if (r.type === "TIMESHEET") {
        let ts = r.timesheet;
        if (!ts && typeof payload.timesheetId === "string") {
          ts = await prisma.rhTimesheet.findUnique({
            where: { id: payload.timesheetId },
            include: { days: { orderBy: { date: "asc" } } },
          });
        }
        detail = {
          ...detail,
          timesheetId: ts?.id,
          week: ts
            ? `${ts.isoYear}-W${String(ts.isoWeek).padStart(2, "0")}`
            : null,
          totalLabel: ts ? minutesToLabel(ts.totalMinutes) : null,
          ot25Label: ts ? minutesToLabel(ts.ot25Minutes) : null,
          ot50Label: ts ? minutesToLabel(ts.ot50Minutes) : null,
          overtimeNote: ts?.overtimeNote || payload.overtimeNote,
          days: (ts?.days || []).map((d) => ({
            date: d.date.toISOString().slice(0, 10),
            totalMinutes: d.totalMinutes,
            totalLabel: minutesToLabel(d.totalMinutes),
            slots: d.slots,
            note: d.note,
          })),
        };
      }

      if (r.type === "REMOTE_PLAN" || r.type === "REMOTE_EXCEPTION") {
        const dates = Array.isArray(payload.dates)
          ? (payload.dates as string[]).map((d) => String(d).slice(0, 10))
          : payload.date
            ? [String(payload.date).slice(0, 10)]
            : [];
        detail = {
          ...detail,
          dates,
          date: payload.date ? String(payload.date).slice(0, 10) : null,
          compensateNextWeek: !!payload.compensateNextWeek,
          week:
            payload.isoYear && payload.isoWeek
              ? `${payload.isoYear}-W${String(payload.isoWeek).padStart(2, "0")}`
              : null,
        };
      }

      if (r.type === "ADDRESS_CHANGE" || r.type === "CONTACT_CHANGE") {
        detail = {
          ...detail,
          proposed: payload.proposed || payload,
        };
      }

      return {
        id: r.id,
        reference: r.reference,
        type: r.type,
        status: r.status,
        title: r.title,
        comment: r.comment,
        days: r.days,
        dateFrom: r.dateFrom?.toISOString() ?? null,
        dateTo: r.dateTo?.toISOString() ?? null,
        payload: r.payload,
        detail,
        createdAt: r.createdAt.toISOString(),
        employee: {
          id: r.employee.id,
          name: displayName(r.employee.user),
          initials: initials(r.employee.user),
          avatarColor: r.employee.avatarColor,
          avatarUrl: r.employee.avatarUrl,
          matricule: r.employee.matricule,
        },
      };
    })
  );

  return NextResponse.json({ items });
}
