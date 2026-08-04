import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const all = searchParams.get("all") === "1";

  let where: { actif: boolean; managerId?: string } = { actif: true };
  if (!isRhManager(session.employee.rhRole) || (!all && session.employee.rhRole === "MANAGER")) {
    if (session.employee.rhRole === "COLLAB") {
      where = { actif: true, managerId: undefined };
      // collab: only self via separate endpoint; list returns team peers in same dept for coverage
    }
  }

  const employees = await prisma.rhEmployee.findMany({
    where: { actif: true },
    include: {
      user: { select: { prenom: true, nom: true, email: true } },
      leaveBalances: true,
    },
    orderBy: { matricule: "asc" },
  });

  // Scope: HR sees all; manager sees reports + self; collab sees department
  const filtered = employees.filter((e) => {
    if (session.employee.rhRole === "HR") return true;
    if (session.employee.rhRole === "MANAGER") {
      return e.id === session.employee.id || e.managerId === session.employee.id;
    }
    return e.department === session.employee.department;
  });

  return NextResponse.json({
    employees: filtered.map((e) => ({
      id: e.id,
      matricule: e.matricule,
      name: displayName(e.user),
      initials: initials(e.user),
      email: e.user.email,
      jobTitle: e.jobTitle,
      department: e.department,
      avatarColor: e.avatarColor,
      rhRole: e.rhRole,
      hireDate: e.hireDate.toISOString(),
      remoteAgreement: e.remoteAgreement,
      healthCover: e.healthCover,
      grossSalary: e.grossSalary ? Number(e.grossSalary) : null,
      variableSalary: e.variableSalary ? Number(e.variableSalary) : null,
      balances: e.leaveBalances,
      bookableSum: e.leaveBalances.reduce((s, b) => s + b.bookable, 0),
    })),
  });
}
