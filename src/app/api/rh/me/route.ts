import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  homePathForRole,
  initials,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { getBalancesForEmployee } from "@/lib/rh/leave";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    // Peut être connecté plateforme sans profil RH
    const { getAppSession } = await import("@/lib/getAppSession");
    const app = await getAppSession(request);
    if (!app?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    return NextResponse.json(
      { error: "Profil RH non provisionné", code: "NO_RH_PROFILE" },
      { status: 403 }
    );
  }

  const { employee } = session;
  const manager = employee.managerId
    ? await prisma.rhEmployee.findUnique({
        where: { id: employee.managerId },
        include: { user: { select: { prenom: true, nom: true } } },
      })
    : null;

  const balances = await getBalancesForEmployee(employee.id, employee.hireDate);
  const bookableTotal = balances
    .filter((b) => b.accountCode !== "CP" || b.bookable > 0)
    .reduce((s, b) => s + b.bookable, 0);

  return NextResponse.json({
    employee: {
      id: employee.id,
      userId: employee.userId,
      name: displayName(employee),
      prenom: employee.prenom,
      nom: employee.nom,
      initials: initials(employee),
      email: employee.email,
      telephone: employee.telephone,
      matricule: employee.matricule,
      jobTitle: employee.jobTitle,
      department: employee.department,
      avatarColor: employee.avatarColor,
      rhRole: employee.rhRole,
      hireDate: employee.hireDate.toISOString(),
      weeklyHours: employee.weeklyHours,
      remoteAgreement: employee.remoteAgreement,
      manager: manager
        ? {
            id: manager.id,
            name: displayName(manager.user),
            initials: initials(manager.user),
          }
        : null,
    },
    balances,
    bookableTotal,
    homePath: homePathForRole(employee.rhRole),
    canAccessPeople: employee.rhRole === "MANAGER" || employee.rhRole === "HR",
  });
}
