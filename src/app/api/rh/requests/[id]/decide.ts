import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { isRhManager, requireRhSessionFromRequest } from "@/lib/rh/auth";
import { decideLeaveRequest } from "@/lib/rh/leave";
import { decideTimesheet } from "@/lib/rh/timesheet";
import { decideExpense } from "@/lib/rh/expenses";
import { writeRhAudit } from "@/lib/rh/workflow";

type Ctx = { params: Promise<{ id: string }> };

async function decide(
  request: NextRequest,
  ctx: Ctx,
  approve: boolean
) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhManager(session.employee.rhRole)) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note : undefined;

  const req = await prisma.rhRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  try {
    if (req.type === "LEAVE" || req.type === "UNPAID_LEAVE") {
      await decideLeaveRequest({
        requestId: id,
        reviewerId: session.employee.id,
        approve,
        note,
      });
    } else if (req.type === "TIMESHEET") {
      const tsId = (req.payload as { timesheetId?: string })?.timesheetId;
      if (!tsId) throw new Error("Timesheet lié manquant");
      await decideTimesheet({
        timesheetId: tsId,
        reviewerId: session.employee.id,
        action: approve ? "approve" : "refuse",
        note,
      });
    } else if (req.type === "EXPENSE") {
      const reportId = (req.payload as { reportId?: string })?.reportId;
      if (!reportId) throw new Error("Note liée manquante");
      await decideExpense({
        reportId,
        reviewerId: session.employee.id,
        approve,
        note,
      });
    } else if (req.type === "REMOTE_EXCEPTION" || req.type === "CONTACT_CHANGE" || req.type === "ADDRESS_CHANGE") {
      await prisma.rhRequest.update({
        where: { id },
        data: {
          status: approve ? "APPROVED" : "REFUSED",
          reviewedById: session.employee.id,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      if (req.type === "REMOTE_EXCEPTION" && approve) {
        const payload = req.payload as {
          date?: string;
          compensateNextWeek?: boolean;
          isoYear?: number;
          isoWeek?: number;
        };
        if (payload.date && payload.isoYear && payload.isoWeek) {
          const date = new Date(payload.date);
          const existing = await prisma.rhRemoteDeclaration.findUnique({
            where: {
              employeeId_isoYear_isoWeek: {
                employeeId: req.employeeId,
                isoYear: payload.isoYear,
                isoWeek: payload.isoWeek,
              },
            },
          });
          const dates = existing?.declaredDates ?? [];
          if (!dates.some((d) => d.toISOString().slice(0, 10) === payload.date)) {
            dates.push(date);
          }
          const weekStart = existing?.weekStart ?? date;
          const weekEnd = existing?.weekEnd ?? date;
          await prisma.rhRemoteDeclaration.upsert({
            where: {
              employeeId_isoYear_isoWeek: {
                employeeId: req.employeeId,
                isoYear: payload.isoYear,
                isoWeek: payload.isoWeek,
              },
            },
            create: {
              employeeId: req.employeeId,
              isoYear: payload.isoYear,
              isoWeek: payload.isoWeek,
              weekStart,
              weekEnd,
              declaredDates: dates,
              exceptional: true,
              exceptionRequestId: req.id,
              compensationWeek: payload.compensateNextWeek
                ? payload.isoWeek + 1
                : null,
            },
            update: {
              declaredDates: dates,
              exceptional: true,
              exceptionRequestId: req.id,
              compensationWeek: payload.compensateNextWeek
                ? payload.isoWeek + 1
                : null,
            },
          });
        }
      }
      if (req.type === "CONTACT_CHANGE" && approve) {
        const change = await prisma.rhContactChange.findFirst({
          where: { requestId: id },
        });
        if (change) {
          const proposed = change.proposed as Record<string, string>;
          await prisma.rhEmployee.update({
            where: { id: change.employeeId },
            data: {
              remoteAddressLine1: proposed.addressLine1 ?? undefined,
              remoteCity: proposed.city ?? undefined,
              remotePostalCode: proposed.postalCode ?? undefined,
            },
          });
          if (proposed.telephone) {
            const emp = await prisma.rhEmployee.findUnique({
              where: { id: change.employeeId },
            });
            if (emp) {
              await prisma.user.update({
                where: { id: emp.userId },
                data: { telephone: proposed.telephone },
              });
            }
          }
          await prisma.rhContactChange.update({
            where: { id: change.id },
            data: { status: "APPROVED", appliedAt: new Date() },
          });
        }
      }
      await writeRhAudit({
        actorId: session.employee.id,
        targetId: req.employeeId,
        action: approve ? "request.approve" : "request.refuse",
        detail: { requestId: id, type: req.type },
      });
    } else {
      await prisma.rhRequest.update({
        where: { id },
        data: {
          status: approve ? "APPROVED" : "REFUSED",
          reviewedById: session.employee.id,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
    }
    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest, ctx: Ctx) {
  // default approve via /approve — this file is base; subroutes handle
  return NextResponse.json({ error: "Utilisez /approve ou /refuse" }, { status: 405 });
}

export { decide };
