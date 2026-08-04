import { NextRequest, NextResponse } from "next/server";
import { requireRhHr } from "@/lib/rh/auth";
import { generatePayrollLeaveExport } from "@/lib/rh/payroll";

export async function GET(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }
  const { searchParams } = new URL(request.url);
  const from = new Date(searchParams.get("from") || new Date(new Date().getFullYear(), new Date().getMonth(), 1));
  const to = new Date(
    searchParams.get("to") ||
      new Date(new Date().getFullYear(), new Date().getMonth() + 1, 0)
  );

  const buf = await generatePayrollLeaveExport({ from, to });
  return new NextResponse(new Uint8Array(buf), {
    status: 200,
    headers: {
      "Content-Type":
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="export-paie-absences.xlsx"`,
    },
  });
}
