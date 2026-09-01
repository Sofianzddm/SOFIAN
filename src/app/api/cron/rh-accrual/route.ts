import { NextRequest, NextResponse } from "next/server";
import { accrueAllActiveEmployees } from "@/lib/rh/leave";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  if (auth !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  const n = await accrueAllActiveEmployees();
  return NextResponse.json({ ok: true, employees: n });
}
