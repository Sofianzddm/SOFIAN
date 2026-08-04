import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  addExpenseLine,
  createExpenseReport,
  submitExpenseReport,
} from "@/lib/rh/expenses";

const MONTHS_FR = [
  "Janvier",
  "Février",
  "Mars",
  "Avril",
  "Mai",
  "Juin",
  "Juillet",
  "Août",
  "Septembre",
  "Octobre",
  "Novembre",
  "Décembre",
];

function summarize(lines: Array<{
  amount: unknown;
  vatAmount: unknown;
  reimbursedAmount: unknown;
  isMileage: boolean;
  km: number | null;
  status: string;
  missingReceipt: boolean;
}>) {
  let horsKm = 0;
  let vat = 0;
  let mileage = 0;
  let distance = 0;
  let reimbursed = 0;
  for (const l of lines) {
    const amount = Number(l.amount);
    const vatAmount = Number(l.vatAmount);
    const rem =
      l.reimbursedAmount == null ? amount : Number(l.reimbursedAmount);
    reimbursed += rem;
    vat += vatAmount;
    if (l.isMileage) {
      mileage += amount;
      distance += Number(l.km || 0);
    } else {
      horsKm += amount;
    }
  }
  return {
    horsKm: Math.round(horsKm * 100) / 100,
    vat: Math.round(vat * 100) / 100,
    mileage: Math.round(mileage * 100) / 100,
    distance: Math.round(distance * 100) / 100,
    reimbursed: Math.round(reimbursed * 100) / 100,
    total: Math.round((horsKm + mileage) * 100) / 100,
    warnings: lines.filter((l) => l.status === "review" || l.missingReceipt || l.status === "missing").length,
  };
}

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const employee = await prisma.rhEmployee.findUnique({
    where: { id: session.employee.id },
    include: {
      user: { select: { prenom: true, nom: true } },
      manager: { include: { user: { select: { prenom: true, nom: true } } } },
    },
  });

  const reports = await prisma.rhExpenseReport.findMany({
    where: { employeeId: session.employee.id },
    include: {
      lines: { orderBy: [{ date: "asc" }, { createdAt: "asc" }] },
    },
    orderBy: { createdAt: "desc" },
  });

  const vehicle = await prisma.rhVehicle.findUnique({
    where: { employeeId: session.employee.id },
  });

  const managerName = employee?.manager
    ? `${employee.manager.user.prenom} ${employee.manager.user.nom}`.toUpperCase()
    : null;
  const declarant = employee
    ? `${employee.user.prenom} ${employee.user.nom}`
    : `${session.employee.prenom} ${session.employee.nom}`;

  return NextResponse.json({
    declarant,
    managerName,
    reports: reports.map((r, idx) => {
      const summary = summarize(r.lines);
      return {
        id: r.id,
        number: r.number,
        label:
          r.label ||
          `${MONTHS_FR[r.periodMonth - 1] || r.periodMonth} ${r.periodYear}`,
        periodTitle: `${MONTHS_FR[r.periodMonth - 1] || r.periodMonth} ${r.periodYear}`,
        status: r.status,
        periodMonth: r.periodMonth,
        periodYear: r.periodYear,
        totalAmount: Number(r.totalAmount),
        createdAt: r.createdAt,
        paidBy: "Collaborateur",
        nextApprover: r.status === "SUBMITTED" ? managerName : null,
        summary,
        lines: r.lines.map((l, i) => ({
          id: l.id,
          n: i + 1,
          date: l.date,
          category: l.category,
          label: l.label,
          nature: l.isMileage ? "Frais kilométriques" : l.category,
          amount: Number(l.amount),
          vatRate: Number(l.vatRate),
          vatAmount: Number(l.vatAmount),
          reimbursed:
            l.reimbursedAmount == null
              ? Number(l.amount)
              : Number(l.reimbursedAmount),
          receiptUrl: l.receiptUrl,
          receiptName: l.receiptName,
          missingReceipt: l.missingReceipt,
          comment: l.comment,
          isMileage: l.isMileage,
          km: l.km,
          status: l.status,
          warning: l.status === "review" || l.missingReceipt || l.status === "missing",
        })),
        _idx: idx,
      };
    }),
    vehicle,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  try {
    if (body.action === "create") {
      const month = body.periodMonth || new Date().getMonth() + 1;
      const year = body.periodYear || new Date().getFullYear();
      const report = await createExpenseReport({
        employeeId: session.employee.id,
        label:
          body.label ||
          `${MONTHS_FR[month - 1] || month} ${year}`,
        periodMonth: month,
        periodYear: year,
      });
      return NextResponse.json({ report }, { status: 201 });
    }
    if (body.action === "addLine") {
      const line = await addExpenseLine({
        reportId: body.reportId,
        employeeId: session.employee.id,
        date: new Date(body.date),
        category: body.category,
        label: body.label,
        amount: Number(body.amount),
        vatRate: body.vatRate != null ? Number(body.vatRate) : undefined,
        vatAmount: body.vatAmount != null ? Number(body.vatAmount) : undefined,
        reimbursedAmount:
          body.reimbursedAmount != null ? Number(body.reimbursedAmount) : null,
        receiptUrl: body.receiptUrl,
        receiptName: body.receiptName,
        missingReceipt: body.missingReceipt,
        comment: body.comment,
        isCompanyMeal: body.isCompanyMeal,
        isTravelMeal: body.isTravelMeal,
        isMileage: body.isMileage,
        km: body.km,
        fiscalHp: body.fiscalHp,
      });
      return NextResponse.json({ line }, { status: 201 });
    }
    if (body.action === "submit") {
      const report = await submitExpenseReport({
        reportId: body.reportId,
        employeeId: session.employee.id,
      });
      return NextResponse.json({ report });
    }
    return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
