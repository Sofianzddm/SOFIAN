import { NextRequest, NextResponse } from "next/server";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { getBalancesForEmployee } from "@/lib/rh/leave";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const employeeId = searchParams.get("employeeId") || session.employee.id;
  if (
    employeeId !== session.employee.id &&
    session.employee.rhRole === "COLLAB"
  ) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }
  const emp = await (await import("@/lib/prisma")).default.rhEmployee.findUnique({
    where: { id: employeeId },
  });
  if (!emp) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  const balances = await getBalancesForEmployee(emp.id, emp.hireDate);
  return NextResponse.json({ balances });
}
