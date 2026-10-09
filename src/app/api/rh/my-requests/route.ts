import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

/** Historique des demandes du salarié connecté (tous types). */
export async function GET(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const requests = await prisma.rhRequest.findMany({
    where: { employeeId: session.employee.id },
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
      reviewNote: r.reviewNote,
      days: r.days,
      dateFrom: r.dateFrom?.toISOString() ?? null,
      dateTo: r.dateTo?.toISOString() ?? null,
      createdAt: r.createdAt.toISOString(),
      reviewedAt: r.reviewedAt?.toISOString() ?? null,
    })),
  });
}
