import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import {
  canViewRhEmployee,
  displayName,
  initials,
  isRhHr,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";
import { getBalancesForEmployee } from "@/lib/rh/leave";
import { isoWeekInfo } from "@/lib/rh/workflow";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const { id } = await ctx.params;
  if (!(await canViewRhEmployee(session.employee, id))) {
    return NextResponse.json({ error: "Interdit" }, { status: 403 });
  }

  const emp = await prisma.rhEmployee.findUnique({
    where: { id },
    include: {
      user: {
        select: {
          prenom: true,
          nom: true,
          email: true,
          telephone: true,
        },
      },
      documents: { orderBy: { createdAt: "desc" } },
    },
  });
  if (!emp || !emp.actif) {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  const showSalary = isRhHr(session.employee.rhRole);
  const balances = await getBalancesForEmployee(emp.id, emp.hireDate);

  const requests = await prisma.rhRequest.findMany({
    where: { employeeId: emp.id },
    orderBy: { createdAt: "desc" },
    take: 20,
  });

  const { weekStart, weekEnd } = isoWeekInfo(new Date());
  const [workDays, remoteDecls] = await Promise.all([
    prisma.rhWorkDay.findMany({
      where: {
        employeeId: emp.id,
        date: { gte: weekStart, lte: weekEnd },
      },
      orderBy: { date: "asc" },
    }),
    prisma.rhRemoteDeclaration.findMany({
      where: {
        employeeId: emp.id,
        weekStart: { lte: weekEnd },
        weekEnd: { gte: weekStart },
      },
    }),
  ]);

  const remoteDates = [
    ...new Set(
      remoteDecls.flatMap((r) =>
        r.declaredDates.map((d) => d.toISOString().slice(0, 10))
      )
    ),
  ].sort();

  return NextResponse.json({
    employee: {
      id: emp.id,
      matricule: emp.matricule,
      name: displayName(emp.user),
      initials: initials(emp.user),
      email: emp.user.email,
      telephone: emp.user.telephone,
      jobTitle: emp.jobTitle,
      department: emp.department,
      avatarColor: emp.avatarColor,
      avatarUrl: emp.avatarUrl,
      rhRole: emp.rhRole,
      hireDate: emp.hireDate.toISOString(),
      weeklyHours: emp.weeklyHours,
      remoteAgreement: emp.remoteAgreement,
      healthCover: emp.healthCover,
      grossSalary:
        showSalary && emp.grossSalary != null ? Number(emp.grossSalary) : null,
      variableSalary:
        showSalary && emp.variableSalary != null
          ? Number(emp.variableSalary)
          : null,
    },
    balances: balances.map((b) => ({
      id: b.id,
      accountCode: b.accountCode,
      label: b.label,
      periodStart: b.periodStart.toISOString(),
      periodEnd: b.periodEnd.toISOString(),
      accrued: b.accrued,
      taken: b.taken,
      remaining: b.remaining,
      bookable: b.bookable,
      expiresOn: b.expiresOn?.toISOString() ?? null,
    })),
    requests: requests.map((r) => ({
      id: r.id,
      reference: r.reference,
      type: r.type,
      status: r.status,
      title: r.title,
      comment: r.comment,
      days: r.days,
      dateFrom: r.dateFrom?.toISOString() ?? null,
      dateTo: r.dateTo?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
    })),
    week: {
      from: weekStart.toISOString().slice(0, 10),
      to: weekEnd.toISOString().slice(0, 10),
      workDays: workDays.map((w) => ({
        date: w.date.toISOString().slice(0, 10),
        place: w.place,
        half: w.half,
      })),
      remote: remoteDates,
    },
    documents: emp.documents.map((d) => ({
      id: d.id,
      kind: d.kind,
      title: d.title,
      status: d.status,
      period: d.period,
      expiresOn: d.expiresOn?.toISOString() ?? null,
      url: d.url,
    })),
  });
}

/** HR : modifier contrat collab (horaires, avenant TT, rôle…). */
export async function PATCH(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session || !isRhHr(session.employee.rhRole)) {
    return NextResponse.json({ error: "Accès RH requis" }, { status: 403 });
  }
  const { id } = await ctx.params;
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const data: Record<string, unknown> = {};
  if (body.weeklyHours != null) data.weeklyHours = Number(body.weeklyHours);
  if (body.remoteAgreement != null) {
    const n = Number(body.remoteAgreement);
    if (![0, 2, 3].includes(n)) {
      return NextResponse.json(
        { error: "Avenant TT : 0, 2 ou 3 jours" },
        { status: 400 }
      );
    }
    data.remoteAgreement = n;
  }
  if (body.healthCover === "ENROLLED" || body.healthCover === "WAIVED") {
    data.healthCover = body.healthCover;
  }
  if (body.rhRole === "COLLAB" || body.rhRole === "MANAGER" || body.rhRole === "HR") {
    data.rhRole = body.rhRole;
  }
  if (body.jobTitle != null) data.jobTitle = String(body.jobTitle);
  if (body.department != null) data.department = String(body.department);
  if (body.grossSalary != null) data.grossSalary = Number(body.grossSalary);
  if (body.variableSalary != null) {
    data.variableSalary = Number(body.variableSalary);
  }
  if (Object.keys(data).length === 0) {
    return NextResponse.json({ error: "Aucun champ à mettre à jour" }, { status: 400 });
  }
  try {
    const emp = await prisma.rhEmployee.update({
      where: { id },
      data,
    });
    const { writeRhAudit } = await import("@/lib/rh/workflow");
    await writeRhAudit({
      actorId: session.employee.id,
      targetId: id,
      action: "employee.update",
      detail: data,
    });
    return NextResponse.json({
      ok: true,
      employee: {
        weeklyHours: emp.weeklyHours,
        remoteAgreement: emp.remoteAgreement,
        healthCover: emp.healthCover,
        rhRole: emp.rhRole,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
