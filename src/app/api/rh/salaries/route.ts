import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  isRhHr,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhHr(session.employee.rhRole)) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }

  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    include: {
      user: { select: { prenom: true, nom: true } },
      leaveBalances: true,
    },
    orderBy: { matricule: "asc" },
  });

  const now = new Date();
  const rows = await Promise.all(
    employees.map(async (e) => {
      const ts = await prisma.rhTimesheet.findMany({
        where: {
          employeeId: e.id,
          weekStart: {
            gte: new Date(now.getFullYear(), now.getMonth(), 1),
          },
          status: { in: ["APPROVED", "SIGNED"] },
        },
      });
      const ot25 = ts.reduce((s, t) => s + t.ot25Minutes, 0) / 60;
      const ot50 = ts.reduce((s, t) => s + t.ot50Minutes, 0) / 60;
      const seniorityYears =
        (now.getTime() - e.hireDate.getTime()) / (365.25 * 86400000);
      return {
        id: e.id,
        matricule: e.matricule,
        name: displayName(e.user),
        jobTitle: e.jobTitle,
        department: e.department,
        hireDate: e.hireDate.toISOString(),
        seniorityYears: Math.round(seniorityYears * 10) / 10,
        grossSalary: e.grossSalary ? Number(e.grossSalary) : null,
        variableSalary: e.variableSalary ? Number(e.variableSalary) : null,
        healthCover: e.healthCover,
        ot25,
        ot50,
        balances: e.leaveBalances,
      };
    })
  );

  const masse =
    rows.reduce((s, r) => s + (r.grossSalary ?? 0) + (r.variableSalary ?? 0), 0);

  return NextResponse.json({ rows, masseSalariale: masse });
}
