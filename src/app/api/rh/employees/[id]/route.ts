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
      manager: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
      documents: { orderBy: { createdAt: "desc" } },
      vehicle: true,
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
      managerId: emp.managerId,
      managerName: emp.manager ? displayName(emp.manager.user) : null,
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
    vehicle: emp.vehicle
      ? {
          id: emp.vehicle.id,
          label: emp.vehicle.label,
          fiscalHorsepower: emp.vehicle.fiscalHorsepower,
          yearKm: emp.vehicle.yearKm,
          carteGriseExpiresOn:
            emp.vehicle.carteGriseExpiresOn?.toISOString().slice(0, 10) ?? null,
          insuranceExpiresOn:
            emp.vehicle.insuranceExpiresOn?.toISOString().slice(0, 10) ?? null,
          licenseExpiresOn:
            emp.vehicle.licenseExpiresOn?.toISOString().slice(0, 10) ?? null,
        }
      : null,
  });
}

/** HR : modifier contrat collab (horaires, avenant TT, rôle…) + véhicule IK. */
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

  // Véhicule : CV fiscaux + validité permis (renouvellement annuel)
  if (body.vehicle && typeof body.vehicle === "object") {
    const v = body.vehicle as Record<string, unknown>;
    const hp = Math.max(1, Math.min(20, Number(v.fiscalHorsepower) || 5));
    const toDate = (raw: unknown) => {
      if (raw == null || raw === "") return null;
      const d = new Date(String(raw));
      return Number.isNaN(d.getTime()) ? null : d;
    };
    try {
      const { upsertVehicle } = await import("@/lib/rh/expenses");
      const vehicle = await upsertVehicle({
        employeeId: id,
        label: String(v.label || "Véhicule perso"),
        fiscalHorsepower: hp,
        carteGriseExpiresOn: toDate(v.carteGriseExpiresOn),
        insuranceExpiresOn: toDate(v.insuranceExpiresOn),
        licenseExpiresOn: toDate(v.licenseExpiresOn),
      });
      const { writeRhAudit } = await import("@/lib/rh/workflow");
      await writeRhAudit({
        actorId: session.employee.id,
        targetId: id,
        action: "employee.vehicle.update",
        detail: {
          fiscalHorsepower: hp,
          licenseExpiresOn: vehicle.licenseExpiresOn,
        },
      });
      return NextResponse.json({
        ok: true,
        vehicle: {
          id: vehicle.id,
          label: vehicle.label,
          fiscalHorsepower: vehicle.fiscalHorsepower,
          yearKm: vehicle.yearKm,
          carteGriseExpiresOn:
            vehicle.carteGriseExpiresOn?.toISOString().slice(0, 10) ?? null,
          insuranceExpiresOn:
            vehicle.insuranceExpiresOn?.toISOString().slice(0, 10) ?? null,
          licenseExpiresOn:
            vehicle.licenseExpiresOn?.toISOString().slice(0, 10) ?? null,
        },
      });
    } catch (e) {
      return NextResponse.json(
        { error: e instanceof Error ? e.message : "Erreur" },
        { status: 400 }
      );
    }
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
  if ("managerId" in body) {
    const raw = body.managerId;
    if (raw == null || raw === "") {
      data.managerId = null;
    } else {
      const managerId = String(raw);
      if (managerId === id) {
        return NextResponse.json(
          { error: "Un collaborateur ne peut pas être son propre manager" },
          { status: 400 }
        );
      }
      const mgr = await prisma.rhEmployee.findFirst({
        where: { id: managerId, actif: true },
        select: { id: true, rhRole: true },
      });
      if (!mgr) {
        return NextResponse.json(
          { error: "Manager introuvable" },
          { status: 400 }
        );
      }
      if (mgr.rhRole !== "MANAGER" && mgr.rhRole !== "HR") {
        return NextResponse.json(
          {
            error:
              "La personne choisie doit avoir le rôle Manager ou RH (passe-la en Manager d’abord)",
          },
          { status: 400 }
        );
      }
      data.managerId = managerId;
    }
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
      include: {
        manager: {
          include: { user: { select: { prenom: true, nom: true } } },
        },
      },
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
        managerId: emp.managerId,
        managerName: emp.manager ? displayName(emp.manager.user) : null,
      },
    });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
