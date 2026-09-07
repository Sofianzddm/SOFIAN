import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { writeDcAudit } from "@/lib/decision-center/audit";
import { serializeRequest } from "@/lib/decision-center/serialize";

type Ctx = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "mark_executed");
  if (denied) return denied;

  const { id } = await ctx.params;
  const row = await prisma.dcRequest.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (row.status !== "APPROVED") {
    return NextResponse.json(
      { error: "Seule une décision approuvée peut être marquée exécutée" },
      { status: 409 }
    );
  }

  const updated = await prisma.dcRequest.update({
    where: { id },
    data: {
      status: "EXECUTED",
      executedAt: new Date(),
      executionStatus: "DONE",
    },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
      comments: { include: { author: { select: { prenom: true, nom: true } } } },
    },
  });

  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: "REQUEST_EXECUTE",
    entityType: "request",
    entityId: id,
    requestId: id,
  });

  return NextResponse.json({ request: serializeRequest(updated) });
}
