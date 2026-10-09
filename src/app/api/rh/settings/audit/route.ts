import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhHr, displayName } from "@/lib/rh/auth";

/** Historique des changements de paramètres RH. */
export async function GET(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }
  const logs = await prisma.rhAuditLog.findMany({
    where: {
      action: {
        in: [
          "settings.update",
          "employee.update",
          "timesheet.monthlySignatures",
          "timesheet.submit",
          "timesheet.approve",
          "timesheet.refuse",
          "timesheet.requestSignature",
          "timesheet.sign",
          "leave.create",
          "leave.approve",
          "leave.refuse",
          "expense.submit",
          "expense.approve",
          "expense.refuse",
          "remote.exception",
          "request.cancel",
          "payroll.export",
          "payroll.comptable",
          "payslip.apply",
          "payslip.reject",
          "admin.forceLeave",
          "admin.adjustBalance",
          "document.upload",
        ],
      },
    },
    include: {
      actor: {
        include: { user: { select: { prenom: true, nom: true, email: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 50,
  });
  return NextResponse.json({
    items: logs.map((l) => ({
      id: l.id,
      action: l.action,
      detail: l.detail,
      createdAt: l.createdAt.toISOString(),
      actor: l.actor ? displayName(l.actor.user) : "Système",
      actorEmail: l.actor?.user.email ?? null,
    })),
  });
}
