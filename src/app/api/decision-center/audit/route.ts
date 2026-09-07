import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "view_audit");
  if (denied) return denied;

  const logs = await prisma.dcAuditLog.findMany({
    orderBy: { createdAt: "desc" },
    take: 100,
    include: {
      actor: { select: { prenom: true, nom: true, email: true } },
    },
  });

  return NextResponse.json({
    logs: logs.map((l) => ({
      id: l.id,
      action: l.action,
      entityType: l.entityType,
      entityId: l.entityId,
      policyId: l.policyId,
      requestId: l.requestId,
      comment: l.comment,
      oldValue: l.oldValue,
      newValue: l.newValue,
      createdAt: l.createdAt.toISOString(),
      actorName: l.actor
        ? `${l.actor.prenom} ${l.actor.nom}`.trim()
        : null,
    })),
  });
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Les audits ne peuvent pas être supprimés" },
    { status: 405 }
  );
}
