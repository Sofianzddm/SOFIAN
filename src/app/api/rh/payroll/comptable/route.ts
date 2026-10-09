import { NextRequest, NextResponse } from "next/server";
import { requireRhHr } from "@/lib/rh/auth";
import { generateAccountantMonthlyExport } from "@/lib/rh/payroll-comptable";
import { writeRhAudit } from "@/lib/rh/workflow";

/**
 * Export mensuel complet pour l’expert-comptable (HR only).
 * GET ?year=2026&month=10
 */
export async function GET(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }

  const { searchParams } = new URL(request.url);
  const now = new Date();
  const year = Number(searchParams.get("year") || now.getFullYear());
  const month = Number(searchParams.get("month") || now.getMonth() + 1);

  if (
    !Number.isInteger(year) ||
    year < 2020 ||
    year > 2100 ||
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json(
      { error: "Paramètres year/month invalides" },
      { status: 400 }
    );
  }

  try {
    const { buffer, filename } = await generateAccountantMonthlyExport({
      year,
      month,
    });
    await writeRhAudit({
      actorId: session.employee.id,
      action: "payroll.comptable",
      detail: { year, month, filename },
    });
    return new NextResponse(new Uint8Array(buffer), {
      status: 200,
      headers: {
        "Content-Type":
          "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "Content-Disposition": `attachment; filename="${filename}"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (e) {
    console.error("Export comptable RH:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Export impossible" },
      { status: 500 }
    );
  }
}
