import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { displayName, requireRhSessionFromRequest } from "@/lib/rh/auth";
import { notifyRhRequestCreated } from "@/lib/rh/notify";
import { createRhRequest, writeRhAudit } from "@/lib/rh/workflow";

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
    avatarUrl: emp.avatarUrl,
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
  if (body.action === "contactChange" || body.action === "addressChange") {
    const proposed = (body.proposed || {}) as {
      telephone?: string;
      addressLine1?: string;
      city?: string;
      postalCode?: string;
    };
    const hasAddress = !!(
      proposed.addressLine1?.trim() ||
      proposed.city?.trim() ||
      proposed.postalCode?.trim()
    );
    const hasPhone = !!proposed.telephone?.trim();
    if (!hasAddress && !hasPhone) {
      return NextResponse.json(
        { error: "Indique au moins un téléphone ou une adresse TT" },
        { status: 400 }
      );
    }
    // Adresse TT → toujours ADDRESS_CHANGE (validation admin/HR)
    // Téléphone seul → CONTACT_CHANGE
    const type =
      body.action === "addressChange" || hasAddress
        ? "ADDRESS_CHANGE"
        : "CONTACT_CHANGE";
    const title =
      type === "ADDRESS_CHANGE"
        ? "Adresse de télétravail"
        : "Changement de coordonnées";

    const req = await createRhRequest({
      type,
      status: "PENDING",
      employeeId: session.employee.id,
      title,
      comment: body.comment || "Mise à jour demandée",
      payload: proposed,
      prefix: "RH",
    });
    await prisma.rhContactChange.create({
      data: {
        employeeId: session.employee.id,
        requestId: req.id,
        proposed,
        status: "PENDING",
      },
    });
    await notifyRhRequestCreated({
      employeeId: session.employee.id,
      title: req.title,
      reference: req.reference,
      type: type === "ADDRESS_CHANGE" ? "adresse TT" : "coordonnées",
    });
    await writeRhAudit({
      actorId: session.employee.id,
      targetId: session.employee.id,
      action:
        type === "ADDRESS_CHANGE" ? "address.request" : "contact.request",
      detail: { requestId: req.id, proposed },
    });
    return NextResponse.json({ request: req }, { status: 201 });
  }
  return NextResponse.json({ error: "Action inconnue" }, { status: 400 });
}
