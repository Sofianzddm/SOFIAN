import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, findCeoUserId } from "@/lib/decision-center/access";
import { writeDcAudit, notifyDcUser } from "@/lib/decision-center/audit";
import { serializeRequest } from "@/lib/decision-center/serialize";
import { canViewRequest } from "@/lib/decision-center/visibility";
import { isFinalizedStatus } from "@/lib/decision-center/constants";

type Ctx = { params: Promise<{ id: string }> };

async function loadRequest(id: string) {
  return prisma.dcRequest.findUnique({
    where: { id },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: {
        select: {
          code: true,
          title: true,
          level: true,
          visibilityScope: true,
        },
      },
      comments: {
        include: { author: { select: { prenom: true, nom: true } } },
        orderBy: { createdAt: "asc" },
      },
    },
  });
}

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const row = await loadRequest(id);
  if (!row) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  if (
    !canViewRequest({
      role: auth.ctx.dcRole,
      requesterId: row.requesterId,
      userId: auth.ctx.userId,
      scope: (row.policy?.visibilityScope ?? "ALL_DECISION_CENTER_USERS") as never,
      domain: row.domain,
    })
  ) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }
  return NextResponse.json({ request: serializeRequest(row) });
}

const patchSchema = z.object({
  title: z.string().min(3).optional(),
  context: z.string().min(3).optional(),
  question: z.string().min(3).optional(),
  optionA: z.string().min(1).optional(),
  optionB: z.string().nullable().optional(),
  optionC: z.string().nullable().optional(),
  recommendation: z.string().min(3).optional(),
  amount: z.number().nullable().optional(),
  deadline: z.string().datetime().nullable().optional(),
  businessValidatorName: z.string().nullable().optional(),
  businessValidationNote: z.string().nullable().optional(),
  submit: z.boolean().optional(),
  cancel: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const row = await loadRequest(id);
  if (!row) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  if (isFinalizedStatus(row.status as never)) {
    return NextResponse.json(
      { error: "Une décision rendue ne peut pas être modifiée" },
      { status: 409 }
    );
  }

  const isOwner = row.requesterId === auth.ctx.userId;
  const isEa = auth.ctx.dcRole === "EXECUTIVE_ASSISTANT";
  const isCeo = auth.ctx.dcRole === "CEO";
  if (!isOwner && !isEa && !isCeo) {
    return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
  }

  const parsed = patchSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }
  const data = parsed.data;

  if (data.cancel) {
    if (row.status !== "DRAFT" && row.status !== "SUBMITTED" && row.status !== "NEEDS_INFORMATION") {
      return NextResponse.json({ error: "Annulation impossible" }, { status: 409 });
    }
    const updated = await prisma.dcRequest.update({
      where: { id },
      data: { status: "CANCELLED" },
      include: {
        requester: { select: { prenom: true, nom: true, email: true } },
        policy: { select: { code: true, title: true, level: true } },
        comments: {
          include: { author: { select: { prenom: true, nom: true } } },
        },
      },
    });
    await writeDcAudit({
      actorId: auth.ctx.userId,
      action: "REQUEST_CANCEL",
      entityType: "request",
      entityId: id,
      requestId: id,
    });
    return NextResponse.json({ request: serializeRequest(updated) });
  }

  const nextStatus =
    data.submit && (row.status === "DRAFT" || row.status === "NEEDS_INFORMATION")
      ? "SUBMITTED"
      : undefined;

  const updated = await prisma.dcRequest.update({
    where: { id },
    data: {
      title: data.title,
      context: data.context,
      question: data.question,
      optionA: data.optionA,
      optionB: data.optionB,
      optionC: data.optionC,
      recommendation: data.recommendation,
      amount: data.amount,
      deadline: data.deadline === undefined ? undefined : data.deadline ? new Date(data.deadline) : null,
      businessValidatorName: data.businessValidatorName,
      businessValidationNote: data.businessValidationNote,
      businessValidatedAt: data.businessValidatorName ? new Date() : undefined,
      businessValidatorId: data.businessValidatorName ? auth.ctx.userId : undefined,
      status: nextStatus,
    },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
      comments: {
        include: { author: { select: { prenom: true, nom: true } } },
      },
    },
  });

  if (nextStatus === "SUBMITTED") {
    await writeDcAudit({
      actorId: auth.ctx.userId,
      action: "REQUEST_SUBMIT",
      entityType: "request",
      entityId: id,
      requestId: id,
    });
    const ceoId = await findCeoUserId();
    if (ceoId && (row.policy?.level === "RED" || updated.riskLevel === "CRITICAL")) {
      await notifyDcUser({
        userId: ceoId,
        actorId: auth.ctx.userId,
        titre: "Décision à arbitrer",
        message: updated.title,
        lien: `/decision-center/demandes/${updated.id}`,
      });
    }
  }

  return NextResponse.json({ request: serializeRequest(updated) });
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Une décision ne peut jamais être supprimée" },
    { status: 405 }
  );
}
