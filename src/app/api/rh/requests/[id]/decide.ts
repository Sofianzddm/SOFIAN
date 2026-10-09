import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canDecideRhRequest,
  requireRhHr,
} from "@/lib/rh/auth";
import { decideLeaveRequest } from "@/lib/rh/leave";
import { decideTimesheet } from "@/lib/rh/timesheet";
import { decideExpense } from "@/lib/rh/expenses";
import { isoWeekInfo, writeRhAudit } from "@/lib/rh/workflow";
import { notifyRhDecision } from "@/lib/rh/notify";
import { applyRemotePlan, setWorkDay } from "@/lib/rh/office";

type Ctx = { params: Promise<{ id: string }> };

async function decide(
  request: NextRequest,
  ctx: Ctx,
  approve: boolean
) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json(
      {
        error: "Réservé à l’admin RH (connexion sécurisée)",
        code: "RH_MFA_REQUIRED",
      },
      { status: 403 }
    );
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => ({}));
  const note = typeof body.note === "string" ? body.note : undefined;

  const req = await prisma.rhRequest.findUnique({ where: { id } });
  if (!req) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (!(await canDecideRhRequest(session.employee, req.employeeId))) {
    return NextResponse.json(
      {
        error:
          "Tu ne peux valider que les demandes de ton équipe (pas les tiennes).",
      },
      { status: 403 }
    );
  }

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
    } else if (
      req.type === "REMOTE_EXCEPTION" ||
      req.type === "REMOTE_PLAN" ||
      req.type === "CONTACT_CHANGE" ||
      req.type === "ADDRESS_CHANGE" ||
      req.type === "PAUSE_AMEND"
    ) {
      await prisma.rhRequest.update({
        where: { id },
        data: {
          status: approve ? "APPROVED" : "REFUSED",
          reviewedById: session.employee.id,
          reviewedAt: new Date(),
          reviewNote: note,
        },
      });
      if (req.type === "REMOTE_PLAN" && approve) {
        const payload = req.payload as {
          dates?: string[];
        };
        const dates = (payload.dates || []).map((d) => d.slice(0, 10));
        const emp = await prisma.rhEmployee.findUnique({
          where: { id: req.employeeId },
          select: { remoteAgreement: true },
        });
        const agreement =
          emp?.remoteAgreement === 2 || emp?.remoteAgreement === 3
            ? emp.remoteAgreement
            : 0;
        await applyRemotePlan({
          employeeId: req.employeeId,
          dates,
          agreementDays: agreement as 0 | 2 | 3,
        });
      }
      if (req.type === "REMOTE_EXCEPTION" && approve) {
        const payload = req.payload as {
          date?: string;
          compensateNextWeek?: boolean;
          isoYear?: number;
          isoWeek?: number;
        };
        if (payload.date && payload.isoYear && payload.isoWeek) {
          const date = new Date(`${payload.date}T12:00:00`);
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
          const nextStart = new Date(weekStart);
          nextStart.setDate(nextStart.getDate() + 7);
          const nextWeek = isoWeekInfo(nextStart);
          const emp = await prisma.rhEmployee.findUnique({
            where: { id: req.employeeId },
            select: { remoteAgreement: true },
          });
          const agreement =
            emp?.remoteAgreement === 2 || emp?.remoteAgreement === 3
              ? emp.remoteAgreement
              : 0;
          await setWorkDay({
            employeeId: req.employeeId,
            date,
            place: "REMOTE",
            agreementDays: agreement as 0 | 2 | 3,
            allowOverEntitlement: true,
          });
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
                ? nextWeek.isoWeek
                : null,
            },
            update: {
              declaredDates: dates,
              exceptional: true,
              exceptionRequestId: req.id,
              compensationWeek: payload.compensateNextWeek
                ? nextWeek.isoWeek
                : null,
            },
          });
        }
      }
      if (req.type === "PAUSE_AMEND" && approve) {
        // Validation manager = OK métier ; pas d'écriture horaires auto
      }
      if (
        (req.type === "CONTACT_CHANGE" || req.type === "ADDRESS_CHANGE") &&
        approve
      ) {
        const change = await prisma.rhContactChange.findFirst({
          where: { requestId: id },
        });
        const proposed = (change?.proposed ||
          (req.payload as Record<string, string>) ||
          {}) as Record<string, string>;
        const employeeId = change?.employeeId || req.employeeId;
        await prisma.rhEmployee.update({
          where: { id: employeeId },
          data: {
            ...(proposed.addressLine1
              ? { remoteAddressLine1: proposed.addressLine1 }
              : {}),
            ...(proposed.city ? { remoteCity: proposed.city } : {}),
            ...(proposed.postalCode
              ? { remotePostalCode: proposed.postalCode }
              : {}),
          },
        });
        if (proposed.telephone) {
          const emp = await prisma.rhEmployee.findUnique({
            where: { id: employeeId },
          });
          if (emp) {
            await prisma.user.update({
              where: { id: emp.userId },
              data: { telephone: proposed.telephone },
            });
          }
        }
        if (change) {
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
      void notifyRhDecision({
        employeeId: req.employeeId,
        title: req.title,
        reference: req.reference,
        approved: approve,
        note,
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
