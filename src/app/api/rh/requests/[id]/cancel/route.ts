import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

type Ctx = { params: Promise<{ id: string }> };

/** Annulation self-service d’une demande encore en attente. */
export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const req = await prisma.rhRequest.findUnique({ where: { id } });
  if (!req) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }
  if (req.employeeId !== session.employee.id) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }
  if (req.status !== "PENDING" && req.status !== "PAUSED" && req.status !== "DRAFT") {
    return NextResponse.json(
      {
        error:
          "Seules les demandes en attente peuvent être annulées. Contacte ton manager pour une demande déjà validée.",
      },
      { status: 400 }
    );
  }

  try {
    await prisma.$transaction(async (tx) => {
      await tx.rhRequest.update({
        where: { id },
        data: { status: "CANCELLED" },
      });

      if (req.type === "LEAVE" || req.type === "UNPAID_LEAVE") {
        await tx.rhLeaveDay.deleteMany({ where: { requestId: id } });
      }

      if (req.type === "TIMESHEET") {
        const tsId = (req.payload as { timesheetId?: string })?.timesheetId;
        if (tsId) {
          await tx.rhTimesheet.updateMany({
            where: { id: tsId, employeeId: session.employee.id },
            data: { status: "DRAFT", requestId: null },
          });
        }
      }

      if (req.type === "EXPENSE") {
        const reportId = (req.payload as { reportId?: string })?.reportId;
        if (reportId) {
          await tx.rhExpenseReport.updateMany({
            where: { id: reportId, employeeId: session.employee.id },
            data: { status: "DRAFT", requestId: null },
          });
        }
      }

      if (req.type === "CONTACT_CHANGE" || req.type === "ADDRESS_CHANGE") {
        await tx.rhContactChange.updateMany({
          where: { requestId: id },
          data: { status: "CANCELLED" },
        });
      }

      await tx.rhAuditLog.create({
        data: {
          actorId: session.employee.id,
          targetId: session.employee.id,
          action: "request.cancel",
          detail: { requestId: id, type: req.type },
        },
      });
    });

    return NextResponse.json({ ok: true });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
