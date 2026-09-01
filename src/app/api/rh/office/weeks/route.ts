import { NextRequest, NextResponse } from "next/server";
import type { RhWorkPlace } from "@prisma/client";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { getOfficeWeek, nextWorkPlace, setWorkDay } from "@/lib/rh/office";
import { isoWeekInfo } from "@/lib/rh/workflow";
import prisma from "@/lib/prisma";

function agreementOf(n: number): 0 | 2 | 3 {
  return n === 2 || n === 3 ? n : 0;
}

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const agreement = agreementOf(session.employee.remoteAgreement);
  const info = isoWeekInfo(new Date());
  const weeks = await getOfficeWeek({
    employeeId: session.employee.id,
    agreementDays: agreement,
    weekStart: info.weekStart,
    weekCount: 4,
  });
  const e = await prisma.rhEmployee.findUnique({
    where: { id: session.employee.id },
  });
  return NextResponse.json({
    agreement,
    weeks: weeks.map((w) => ({
      ...w,
      weekStart: new Date(w.weekStart).toISOString().slice(0, 10),
      weekEnd: new Date(w.weekEnd).toISOString().slice(0, 10),
    })),
    address: {
      line1: e?.remoteAddressLine1,
      city: e?.remoteCity,
      postalCode: e?.remotePostalCode,
      insuranceExpiresOn: e?.remoteInsuranceExpiresOn?.toISOString() ?? null,
    },
  });
}

export async function PUT(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  const date = new Date(String(body.date));
  const agreement = agreementOf(session.employee.remoteAgreement);
  const iso = date.toISOString().slice(0, 10);
  const existing = await prisma.rhWorkDay.findFirst({
    where: {
      employeeId: session.employee.id,
      date: new Date(`${iso}T00:00:00.000Z`),
    },
  });
  const place = (body.place as RhWorkPlace) || nextWorkPlace(existing?.place ?? null);
  try {
    await setWorkDay({
      employeeId: session.employee.id,
      date,
      place,
      agreementDays: agreement,
    });
    return NextResponse.json({ ok: true, place });
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur" },
      { status: 400 }
    );
  }
}
