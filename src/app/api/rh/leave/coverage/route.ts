import { NextRequest, NextResponse } from "next/server";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { computeTeamCoverage } from "@/lib/rh/leave";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const from = new Date(searchParams.get("from") || Date.now());
  const to = new Date(searchParams.get("to") || Date.now());
  const coverage = await computeTeamCoverage({
    employeeId: session.employee.id,
    department: session.employee.department,
    from,
    to,
  });
  return NextResponse.json({ coverage });
}
