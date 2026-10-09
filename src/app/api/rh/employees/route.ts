import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  isRhHr,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    include: {
      user: { select: { prenom: true, nom: true, email: true } },
      leaveBalances: true,
    },
    orderBy: { matricule: "asc" },
  });

  // Scope: HR sees all; manager sees reports + self; collab sees department peers
  const filtered = employees.filter((e) => {
    if (session.employee.rhRole === "HR") return true;
    if (session.employee.rhRole === "MANAGER") {
      return e.id === session.employee.id || e.managerId === session.employee.id;
    }
    return e.department === session.employee.department;
  });

  const showSalary = isRhHr(session.employee.rhRole);
  // Soldes absences : soi + HR + manager (reports). Collab ne voit pas les soldes des pairs.
  const canSeeBalances = (targetId: string) => {
    if (targetId === session.employee.id) return true;
    if (session.employee.rhRole === "HR") return true;
    if (session.employee.rhRole === "MANAGER") {
      const target = filtered.find((e) => e.id === targetId);
      return target?.managerId === session.employee.id;
    }
    return false;
  };

  return NextResponse.json({
    employees: filtered.map((e) => {
      const showBalances = canSeeBalances(e.id);
      return {
        id: e.id,
        matricule: e.matricule,
        name: displayName(e.user),
        initials: initials(e.user),
        email: e.user.email,
        jobTitle: e.jobTitle,
        department: e.department,
        avatarColor: e.avatarColor,
        avatarUrl: e.avatarUrl,
        rhRole: e.rhRole,
        hireDate: e.hireDate.toISOString(),
        remoteAgreement: e.remoteAgreement,
        healthCover: e.healthCover,
        // Salaires : HR uniquement (évite fuite collab / manager)
        grossSalary: showSalary && e.grossSalary ? Number(e.grossSalary) : null,
        variableSalary:
          showSalary && e.variableSalary ? Number(e.variableSalary) : null,
        balances: showBalances ? e.leaveBalances : [],
        bookableSum: showBalances
          ? e.leaveBalances.reduce((s, b) => s + b.bookable, 0)
          : 0,
      };
    }),
  });
}
