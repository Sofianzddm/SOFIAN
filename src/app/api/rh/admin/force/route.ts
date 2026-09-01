import { NextRequest, NextResponse } from "next/server";
import type { RhLeaveAccount } from "@prisma/client";
import prisma from "@/lib/prisma";
import { requireRhHr } from "@/lib/rh/auth";
import { writeRhAudit } from "@/lib/rh/workflow";

/** Saisie admin forcée (tracée). */
export async function POST(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }
  const body = await request.json();
  const targetId = body.employeeId as string;
  const target = await prisma.rhEmployee.findUnique({ where: { id: targetId } });
  if (!target) {
    return NextResponse.json({ error: "Collaborateur introuvable" }, { status: 404 });
  }

  try {
    if (body.action === "forceLeave") {
      const from = new Date(body.from);
      const to = new Date(body.to);
      const accountCode = body.accountCode as RhLeaveAccount;
      const { createRhRequest, eachDate, isWorkday } = await import(
        "@/lib/rh/workflow"
      );
      const weekdayDates =
        accountCode === "SS"
          ? eachDate(from, to)
          : eachDate(from, to).filter((d) => isWorkday(d));
      const days =
        body.halfDay && weekdayDates.length === 1
          ? 0.5
          : body.halfDay
            ? Math.max(0.5, weekdayDates.length - 0.5)
            : weekdayDates.length;
      const request = await createRhRequest({
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
        where: { id: request.id },
        data: {
          reviewedById: session.employee.id,
          reviewedAt: new Date(),
          reviewNote: "Force admin",
        },
      });
      await prisma.rhLeaveDay.createMany({
        data: weekdayDates.map((date) => ({
          employeeId: target.id,
          requestId: request.id,
          date,
          accountCode,
          halfDay: !!body.halfDay,
          half: body.halfDay ? "AM" : null,
          days: body.halfDay ? 0.5 : 1,
        })),
      });
      await writeRhAudit({
        actorId: session.employee.id,
        targetId: target.id,
        action: "admin.forceLeave",
        detail: { requestId: request.id, ...body },
      });
      return NextResponse.json({ ok: true, request });
    }

    if (body.action === "adjustBalance") {
      const bal = await prisma.rhLeaveBalance.findFirst({
        where: {
          employeeId: target.id,
          accountCode: body.accountCode,
        },
        orderBy: { periodStart: "desc" },
      });
      if (!bal) throw new Error("Solde introuvable");
      await prisma.rhLeaveBalance.update({
        where: { id: bal.id },
        data: {
          accrued: body.accrued ?? bal.accrued,
          remaining: body.remaining ?? bal.remaining,
          bookable: body.bookable ?? bal.bookable,
        },
      });
      await writeRhAudit({
        actorId: session.employee.id,
        targetId: target.id,
        action: "admin.adjustBalance",
        detail: body,
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
