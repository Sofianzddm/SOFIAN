import { NextRequest, NextResponse } from "next/server";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { computeTrForMonth } from "@/lib/rh/expenses";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = Number(searchParams.get("year") || now.getFullYear());
  const month = Number(searchParams.get("month") || now.getMonth() + 1);
  const tr = await computeTrForMonth({
    employeeId: session.employee.id,
    year,
    month,
  });
  return NextResponse.json({ tr });
}
