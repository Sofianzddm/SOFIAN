import { NextRequest, NextResponse } from "next/server";
import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireRhHr } from "@/lib/rh/auth";
import { adjustLeaveBalance, debitLeaveBalance } from "@/lib/rh/leave";
import { BALANCE_ACCOUNTS } from "@/lib/rh/calculations";
import { writeRhAudit } from "@/lib/rh/workflow";

/** Saisie admin forcée (tracée) — débite aussi les soldes si compte posable. */
export async function POST(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }
  const body = await request.json();
  const targetId = body.employeeId as string;
  const target = await prisma.rhEmployee.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json(
      { error: "Collaborateur introuvable" },
      { status: 404 }
    );
  }

  try {
    if (body.action === "forceLeave") {
      const from = new Date(body.from);
      const to = new Date(body.to);
      const accountCode = body.accountCode as RhLeaveAccount;
      const minutes =
        body.minutes != null ? Number(body.minutes) : null;
      const { createRhRequest, eachDate, isWorkday } = await import(
        "@/lib/rh/workflow"
      );
      const { assertRecupMinutes } = await import("@/lib/rh/calculations");
      const { getRhSettings } = await import("@/lib/rh/settings");

      if (minutes != null) {
        const settings = await getRhSettings();
        assertRecupMinutes(minutes, {
          min: settings.recupMinMinutes,
          max: settings.recupMaxMinutes,
          step: settings.recupStepMinutes,
        });
        const days =
          Math.round((minutes / settings.workdayMinutes) * 10000) / 10000;
        const request = await prisma.$transaction(async () => {
          const req = await createRhRequest({
            type: accountCode === "UNPAID" ? "UNPAID_LEAVE" : "LEAVE",
            status: "APPROVED",
            employeeId: target.id,
            title: `Admin · ${accountCode} · ${minutes} min`,
            comment: body.comment || "Saisie admin forcée",
            days,
            dateFrom: from,
            dateTo: from,
            payload: { accountCode, forced: true, minutes },
          });
          await prisma.rhRequest.update({
            where: { id: req.id },
            data: {
              reviewedById: session.employee.id,
              reviewedAt: new Date(),
              reviewNote: "Force admin",
            },
          });
          await prisma.rhLeaveDay.create({
            data: {
              employeeId: target.id,
              requestId: req.id,
              date: from,
              accountCode,
              halfDay: false,
              half: "H",
              days,
              minutes,
            },
          });
          if (BALANCE_ACCOUNTS.has(accountCode) && accountCode !== "UNPAID") {
            await debitLeaveBalance({
              employeeId: target.id,
              hireDate: target.hireDate,
              accountCode,
              days,
            });
          }
          await writeRhAudit({
            actorId: session.employee.id,
            targetId: target.id,
            action: "admin.forceLeave",
            detail: { requestId: req.id, days, minutes, accountCode },
          });
          return req;
        });
        return NextResponse.json({ ok: true, request });
      }

      const weekdayDates =
        accountCode === "SS"
          ? eachDate(from, to)
          : eachDate(from, to).filter((d) => isWorkday(d));
      if (weekdayDates.length === 0) {
        throw new Error("Aucune journée ouvrée dans la période");
      }
      const days =
        body.halfDay && weekdayDates.length === 1
          ? 0.5
          : body.halfDay
            ? Math.max(0.5, weekdayDates.length - 0.5)
            : weekdayDates.length;

      const request = await prisma.$transaction(async () => {
        const req = await createRhRequest({
          type: accountCode === "UNPAID" ? "UNPAID_LEAVE" : "LEAVE",
          status: "APPROVED",
          employeeId: target.id,
          title: `Admin · ${accountCode} · ${days} j`,
          comment: body.comment || "Saisie admin forcée",
          days,
          dateFrom: from,
          dateTo: to,
          payload: { accountCode, forced: true },
        });
        await prisma.rhRequest.update({
          where: { id: req.id },
          data: {
            reviewedById: session.employee.id,
            reviewedAt: new Date(),
            reviewNote: "Force admin",
          },
        });
        await prisma.rhLeaveDay.createMany({
          data: weekdayDates.map((date, idx) => {
            const isHalf =
              !!body.halfDay &&
              (weekdayDates.length === 1 || idx === weekdayDates.length - 1);
            return {
              employeeId: target.id,
              requestId: req.id,
              date,
              accountCode,
              halfDay: isHalf,
              half: isHalf ? "AM" : "FULL",
              days: isHalf ? 0.5 : 1,
            };
          }),
        });
        if (BALANCE_ACCOUNTS.has(accountCode) && accountCode !== "UNPAID") {
          await debitLeaveBalance({
            employeeId: target.id,
            hireDate: target.hireDate,
            accountCode,
            days,
          });
        }
        await writeRhAudit({
          actorId: session.employee.id,
          targetId: target.id,
          action: "admin.forceLeave",
          detail: { requestId: req.id, days, accountCode },
        });
        return req;
      });

      return NextResponse.json({ ok: true, request });
    }

    if (body.action === "adjustBalance") {
      const accountCode = body.accountCode as RhLeaveAccount;
      const hasHours =
        body.remainingHours != null && body.remainingHours !== "";
      const hasDays =
        !hasHours && body.remaining != null && body.remaining !== "";
      const remainingHours = hasHours ? Number(body.remainingHours) : null;
      const remainingDays = hasDays ? Number(body.remaining) : null;
      if (hasHours && !Number.isFinite(remainingHours)) {
        throw new Error("Solde en heures invalide");
      }
      if (hasDays && !Number.isFinite(remainingDays)) {
        throw new Error("Solde restant invalide");
      }
      const accrued =
        body.accrued != null && body.accrued !== ""
          ? Number(body.accrued)
          : null;

      const result = await adjustLeaveBalance({
        employeeId: target.id,
        hireDate: target.hireDate,
        accountCode,
        remainingHours,
        remainingDays,
        accrued,
      });

      await writeRhAudit({
        actorId: session.employee.id,
        targetId: target.id,
        action: "admin.adjustBalance",
        detail: {
          accountCode,
          balanceId: result.balance.id,
          periodStart: result.balance.periodStart,
          previousRemaining: result.previousRemaining,
          previousBookable: result.previousBookable,
          remaining: result.remaining,
          remainingHours: result.remainingHours,
          bookable: result.bookable,
          bookableHours: result.bookableHours,
          taken: result.taken,
          accrued: result.accrued,
        },
      });
      return NextResponse.json({
        ok: true,
        remaining: result.remaining,
        remainingHours: result.remainingHours,
        bookable: result.bookable,
        bookableHours: result.bookableHours,
        previousRemaining: result.previousRemaining,
      });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
