import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { displayName, requireRhSessionFromRequest } from "@/lib/rh/auth";
import { createRhRequest } from "@/lib/rh/workflow";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const emp = await prisma.rhEmployee.findUnique({
    where: { id: session.employee.id },
    include: {
      user: true,
      documents: { orderBy: { createdAt: "desc" } },
      vehicle: true,
      manager: { include: { user: { select: { prenom: true, nom: true } } } },
    },
  });
  if (!emp) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  return NextResponse.json({
    contact: {
      email: emp.user.email,
      telephone: emp.user.telephone,
      address: {
        line1: emp.remoteAddressLine1,
        city: emp.remoteCity,
        postalCode: emp.remotePostalCode,
        country: emp.remoteCountry,
      },
    },
    contract: {
      type: "CDI",
      hireDate: emp.hireDate.toISOString(),
      weeklyHours: emp.weeklyHours,
      jobTitle: emp.jobTitle,
      department: emp.department,
      manager: emp.manager ? displayName(emp.manager.user) : null,
      remoteAgreement: emp.remoteAgreement,
    },
    mutuelle: {
      status: emp.healthCover,
    },
    documents: emp.documents,
    vehicle: emp.vehicle,
  });
}

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const body = await request.json();
  if (body.action === "contactChange") {
    const req = await createRhRequest({
      type: "CONTACT_CHANGE",
      status: "PENDING",
      employeeId: session.employee.id,
      title: "Changement de coordonnées",
      comment: body.comment,
      payload: body.proposed || {},
      prefix: "RH",
    });
    await prisma.rhContactChange.create({
      data: {
        employeeId: session.employee.id,
        requestId: req.id,
        proposed: body.proposed || {},
        status: "PENDING",
      },
    });
    return NextResponse.json({ request: req }, { status: 201 });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
