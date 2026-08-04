import { NextRequest, NextResponse } from "next/server";
import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import {
  displayName,
  initials,
  isRhManager,
  requireRhSessionFromRequest,
} from "@/lib/rh/auth";

export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  let where: Prisma.RhRequestWhereInput;
  if (session.employee.rhRole === "HR") {
    where = { status: { in: ["PENDING", "PAUSED"] } };
  } else if (isRhManager(session.employee.rhRole)) {
    where = {
      status: { in: ["PENDING", "PAUSED"] },
      employee: {
        OR: [
          { managerId: session.employee.id },
          { id: session.employee.id },
        ],
      },
    };
  } else {
    where = {
      employeeId: session.employee.id,
      status: { in: ["PENDING", "PAUSED", "APPROVED", "REFUSED"] },
    };
  }

  const requests = await prisma.rhRequest.findMany({
    where,
    include: {
      employee: {
        include: { user: { select: { prenom: true, nom: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 100,
  });

  return NextResponse.json({
    items: requests.map((r) => ({
      id: r.id,
      reference: r.reference,
      type: r.type,
      status: r.status,
      title: r.title,
      comment: r.comment,
      days: r.days,
      dateFrom: r.dateFrom?.toISOString() ?? null,
      dateTo: r.dateTo?.toISOString() ?? null,
      payload: r.payload,
      createdAt: r.createdAt.toISOString(),
      employee: {
        id: r.employee.id,
        name: displayName(r.employee.user),
        initials: initials(r.employee.user),
        avatarColor: r.employee.avatarColor,
        matricule: r.employee.matricule,
      },
    })),
  });
}
