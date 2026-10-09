import { NextRequest, NextResponse } from "next/server";
import { requireRhHr } from "@/lib/rh/auth";
import {
  applyPayslipScan,
  getPayslipMonthStatus,
} from "@/lib/rh/payslip";
import prisma from "@/lib/prisma";
import { writeRhAudit } from "@/lib/rh/workflow";

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
    !Number.isInteger(month) ||
    month < 1 ||
    month > 12
  ) {
    return NextResponse.json({ error: "year/month invalides" }, { status: 400 });
  }

  const data = await getPayslipMonthStatus({ year, month });
  return NextResponse.json(data);
}

export async function POST(request: NextRequest) {
  const session = await requireRhHr(request);
  if (!session) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }

  const body = await request.json();
  try {
    if (body.action === "apply") {
      const scan = await applyPayslipScan({
        scanId: body.scanId,
        actorId: session.employee.id,
        verified: {
          cpAcquis: body.cpAcquis != null ? Number(body.cpAcquis) : undefined,
          cpPris: body.cpPris != null ? Number(body.cpPris) : undefined,
          cpSolde: body.cpSolde != null ? Number(body.cpSolde) : undefined,
          rttAcquis: body.rttAcquis != null ? Number(body.rttAcquis) : undefined,
          rttPris: body.rttPris != null ? Number(body.rttPris) : undefined,
          rttSolde: body.rttSolde != null ? Number(body.rttSolde) : undefined,
          grossSalary:
            body.grossSalary != null ? Number(body.grossSalary) : undefined,
          netPay: body.netPay != null ? Number(body.netPay) : undefined,
        },
      });
      return NextResponse.json({ ok: true, scan });
    }

    if (body.action === "reject") {
      const scan = await prisma.rhPayslipScan.update({
        where: { id: body.scanId },
        data: { status: "REJECTED", note: body.note || null },
      });
      await writeRhAudit({
        actorId: session.employee.id,
        targetId: scan.employeeId,
        action: "payslip.reject",
        detail: { scanId: scan.id },
      });
      return NextResponse.json({ ok: true, scan });
    }

    if (body.action === "applyAllPending") {
      const year = Number(body.year);
      const month = Number(body.month);
      const pending = await prisma.rhPayslipScan.findMany({
        where: {
          periodYear: year,
          periodMonth: month,
          status: "PENDING_VERIFY",
        },
      });
      const results: Array<{ id: string; ok: boolean; error?: string }> = [];
      for (const s of pending) {
        try {
          await applyPayslipScan({
            scanId: s.id,
            actorId: session.employee.id,
            verified: {},
          });
          results.push({ id: s.id, ok: true });
        } catch (e) {
          results.push({
            id: s.id,
            ok: false,
            error: e instanceof Error ? e.message : "Erreur",
          });
        }
      }
      return NextResponse.json({ ok: true, results });
    }

    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
