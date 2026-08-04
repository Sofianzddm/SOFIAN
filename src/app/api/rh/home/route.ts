import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { getBalancesForEmployee } from "@/lib/rh/leave";
import { computeTrForMonth } from "@/lib/rh/expenses";
import { minutesToLabel } from "@/lib/rh/calculations";
import { isoWeekInfo } from "@/lib/rh/workflow";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const emp = session.employee;
  const balances = await getBalancesForEmployee(emp.id, emp.hireDate);
  const bookable = balances.reduce((s, b) => s + b.bookable, 0);
  const cp = balances.find((b) => b.accountCode === "CP");

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const tsMonth = await prisma.rhTimesheet.findMany({
    where: {
      employeeId: emp.id,
      weekStart: { gte: monthStart },
      status: { in: ["APPROVED", "SIGNED", "SUBMITTED"] },
    },
  });
  const ot25 = tsMonth.reduce((s, t) => s + t.ot25Minutes, 0);
  const ot50 = tsMonth.reduce((s, t) => s + t.ot50Minutes, 0);

  const drafts = await prisma.rhExpenseReport.findMany({
    where: { employeeId: emp.id, status: "DRAFT" },
  });
  const fraisTotal = drafts.reduce((s, r) => s + Number(r.totalAmount), 0);

  const pending = await prisma.rhRequest.findMany({
    where: {
      employeeId: emp.id,
      status: { in: ["PENDING", "PAUSED"] },
    },
    orderBy: { createdAt: "desc" },
    take: 10,
  });

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(today.getDate() + 1);

  const awayToday = await prisma.rhLeaveDay.findMany({
    where: {
      date: today,
      employee: { department: emp.department, actif: true },
      OR: [
        { requestId: null },
        { request: { status: { in: ["APPROVED", "PENDING", "SIGNED"] } } },
      ],
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
    },
  });

  const remoteDecls = await prisma.rhRemoteDeclaration.findMany({
    where: {
      employee: { department: emp.department, actif: true },
      weekStart: { lte: today },
      weekEnd: { gte: today },
    },
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
    },
  });
  const todayKey = today.toISOString().slice(0, 10);
  const remoteToday = remoteDecls.filter((r) =>
    r.declaredDates.some((d) => d.toISOString().slice(0, 10) === todayKey)
  );

  const unlock = new Date(emp.hireDate);
  unlock.setFullYear(unlock.getFullYear() + 1);

  const tr = await computeTrForMonth({
    employeeId: emp.id,
    year: now.getFullYear(),
    month: now.getMonth() + 1,
  });

  const info = isoWeekInfo(today);

  return NextResponse.json({
    today: {
      date: today.toISOString(),
      isoWeek: info.isoWeek,
    },
    kpis: [
      {
        id: "posable",
        label: "JOURS POSABLES",
        value: bookable.toFixed(1).replace(".", ","),
        unit: "j",
        sub: balances
          .filter((b) => b.bookable > 0)
          .map((b) => `${b.bookable.toFixed(1)} ${b.accountCode}`)
          .join(" · ") || "Aucun",
        tone: "#E5F2B5",
      },
      {
        id: "cp",
        label: "CONGÉS PAYÉS",
        value: (cp?.remaining ?? 0).toFixed(2).replace(".", ","),
        unit: "j",
        sub:
          (cp?.bookable ?? 0) > 0
            ? "Posables"
            : `Bloqués jusqu'au ${unlock.toLocaleDateString("fr-FR")}`,
        tone: "#46D6C0",
        locked: (cp?.bookable ?? 0) === 0,
      },
      {
        id: "hs",
        label: "HEURES SUPP. — MOIS",
        value: ((ot25 + ot50) / 60).toFixed(1).replace(".", ","),
        unit: "h",
        sub: `${minutesToLabel(ot25)} à 25 % · ${minutesToLabel(ot50)} à 50 %`,
        tone: "#F0C24E",
      },
      {
        id: "frais",
        label: "FRAIS EN COURS",
        value: String(Math.round(fraisTotal)),
        unit: "€",
        sub: `${drafts.length} note(s) brouillon`,
        tone: "#F2874E",
      },
    ],
    todos: pending.map((p) => ({
      id: p.id,
      bar: p.status === "PAUSED" ? "#F2604E" : "#F0C24E",
      tag: p.type,
      tagBg: p.status === "PAUSED" ? "#F2604E" : "#F0C24E",
      title: p.title,
      meta: p.comment || p.reference,
      cta: "Voir",
      target: "requests" as const,
      urgent: p.status === "PAUSED",
    })),
    awayToday: [
      ...awayToday.map((a) => ({
        name: displayName(a.employee.user),
        initials: initials(a.employee.user),
        color: a.employee.avatarColor,
        kind: a.accountCode,
      })),
      ...remoteToday.map((r) => ({
        name: displayName(r.employee.user),
        initials: initials(r.employee.user),
        color: r.employee.avatarColor,
        kind: "TT",
      })),
    ],
    tr,
    pendingCount: pending.length,
  });
}
