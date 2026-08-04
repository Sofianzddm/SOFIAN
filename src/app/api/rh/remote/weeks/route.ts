import { NextRequest, NextResponse } from "next/server";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  getRemoteWeeksForEmployee,
  requestRemoteException,
  upsertRemoteDeclaration,
} from "@/lib/rh/remote";
import { isoWeekInfo } from "@/lib/rh/workflow";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const agreement = (session.employee.remoteAgreement === 2 ||
  session.employee.remoteAgreement === 3
    ? session.employee.remoteAgreement
    : 0) as 0 | 2 | 3;
  const info = isoWeekInfo(new Date());
  const weeks = await getRemoteWeeksForEmployee(
    session.employee.id,
    agreement,
    info.weekStart,
    4
  );
  return NextResponse.json({
    agreement,
    weeks: weeks.map((w) => ({
      ...w,
      weekStart: new Date(w.weekStart).toISOString().slice(0, 10),
      weekEnd: new Date(w.weekEnd).toISOString().slice(0, 10),
    })),
    address: await (async () => {
      const e = await (
        await import("@/lib/prisma")
      ).default.rhEmployee.findUnique({
        where: { id: session.employee.id },
      });
      return {
        line1: e?.remoteAddressLine1,
        city: e?.remoteCity,
        postalCode: e?.remotePostalCode,
        insuranceExpiresOn: e?.remoteInsuranceExpiresOn?.toISOString() ?? null,
      };
    })(),
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  const agreement = (session.employee.remoteAgreement === 2 ||
  session.employee.remoteAgreement === 3
    ? session.employee.remoteAgreement
    : 0) as 0 | 2 | 3;
  try {
    const row = await upsertRemoteDeclaration({
      employeeId: session.employee.id,
      agreementDays: agreement,
      isoYear: body.isoYear,
      isoWeek: body.isoWeek,
      weekStart: new Date(body.weekStart),
      weekEnd: new Date(body.weekEnd),
      declaredDates: (body.declaredDates as string[]).map((d) => new Date(d)),
      note: body.note,
    });
    return NextResponse.json({ declaration: row });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  try {
    const req = await requestRemoteException({
      employeeId: session.employee.id,
      date: new Date(body.date),
      compensateNextWeek: !!body.compensateNextWeek,
      motive: body.motive || "",
      isoYear: body.isoYear,
      isoWeek: body.isoWeek,
    });
    return NextResponse.json({ request: req }, { status: 201 });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
