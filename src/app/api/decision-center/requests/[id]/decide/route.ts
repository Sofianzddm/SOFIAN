import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { writeDcAudit, notifyDcUser } from "@/lib/decision-center/audit";
import { serializeRequest } from "@/lib/decision-center/serialize";
import { canDecideRed } from "@/lib/decision-center/capabilities";

type Ctx = { params: Promise<{ id: string }> };

const schema = z.object({
  action: z.enum(["APPROVE_RECO", "CHOOSE_A", "CHOOSE_B", "CHOOSE_C", "REQUEST_INFO", "REJECT"]),
  comment: z.string().optional(),
});

export async function POST(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "approve_reject");
  if (denied) return denied;
  if (!canDecideRed(auth.ctx.dcRole)) {
    return NextResponse.json(
      { error: "Seulement Sofian peut rendre une décision CEO" },
      { status: 403 }
    );
  }

  const { id } = await ctx.params;
  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const row = await prisma.dcRequest.findUnique({
    where: { id },
    include: { policy: true },
  });
  if (!row) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (row.status !== "SUBMITTED" && row.status !== "NEEDS_INFORMATION") {
    return NextResponse.json({ error: "Cette demande n’est pas en attente" }, { status: 409 });
  }

  const { action, comment } = parsed.data;

  if (action === "REQUEST_INFO") {
    const updated = await prisma.dcRequest.update({
      where: { id },
      data: { status: "NEEDS_INFORMATION" },
      include: {
        requester: { select: { prenom: true, nom: true, email: true } },
        policy: { select: { code: true, title: true, level: true } },
        comments: { include: { author: { select: { prenom: true, nom: true } } } },
      },
    });
    if (comment) {
      await prisma.dcRequestComment.create({
        data: { requestId: id, authorId: auth.ctx.userId, body: comment },
      });
    }
    await writeDcAudit({
      actorId: auth.ctx.userId,
      action: "REQUEST_NEEDS_INFO",
      entityType: "request",
      entityId: id,
      requestId: id,
      comment: comment ?? null,
    });
    await notifyDcUser({
      userId: row.requesterId,
      actorId: auth.ctx.userId,
      titre: "Précision demandée",
      message: comment || `Sofian demande une précision sur ${row.title}`,
      lien: `/decision-center/demandes/${id}`,
    });
    return NextResponse.json({ request: serializeRequest(updated) });
  }

  const optionMap = {
    APPROVE_RECO: "RECOMMENDATION",
    CHOOSE_A: "A",
    CHOOSE_B: "B",
    CHOOSE_C: "C",
    REJECT: "REJECTED",
  } as const;

  const finalOption = optionMap[action];
  const status = action === "REJECT" ? "REJECTED" : "APPROVED";
  const finalDecision =
    comment ||
    (action === "APPROVE_RECO"
      ? `Recommandation approuvée : ${row.recommendation}`
      : action === "REJECT"
        ? "Refusé"
        : `Option ${finalOption} retenue`);

  const updated = await prisma.dcRequest.update({
    where: { id },
    data: {
      status,
      finalOption,
      finalDecision,
      decidedById: auth.ctx.userId,
      decidedAt: new Date(),
    },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
      comments: { include: { author: { select: { prenom: true, nom: true } } } },
    },
  });

  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: status === "APPROVED" ? "REQUEST_APPROVE" : "REQUEST_REJECT",
    entityType: "request",
    entityId: id,
    requestId: id,
    policyId: row.policyId,
    newValue: { finalOption, status },
    comment: comment ?? null,
  });

  await notifyDcUser({
    userId: row.requesterId,
    actorId: auth.ctx.userId,
    titre: status === "APPROVED" ? "Décision approuvée" : "Décision refusée",
    message: updated.title,
    lien: `/decision-center/demandes/${id}`,
  });

  return NextResponse.json({ request: serializeRequest(updated) });
}
