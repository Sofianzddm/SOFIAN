import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { writeDcAudit } from "@/lib/decision-center/audit";
import { serializePolicy } from "@/lib/decision-center/serialize";
import { DC_DOMAINS_TUPLE, DC_LEVELS_TUPLE, DC_ROLES_TUPLE } from "@/lib/decision-center/constants";

type Ctx = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const { id } = await ctx.params;
  const policy = await prisma.dcPolicy.findUnique({ where: { id } });
  if (!policy) return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  return NextResponse.json({ policy: serializePolicy(policy) });
}

const patchSchema = z.object({
  title: z.string().min(3).max(200).optional(),
  description: z.string().min(3).optional(),
  ownerRole: z.enum(DC_ROLES_TUPLE).optional(),
  executorRole: z.enum(DC_ROLES_TUPLE).nullable().optional(),
  finalDecisionRole: z.enum(DC_ROLES_TUPLE).optional(),
  level: z.enum(DC_LEVELS_TUPLE).optional(),
  autonomyRule: z.string().min(3).optional(),
  thresholdType: z.string().nullable().optional(),
  thresholdValue: z.number().nullable().optional(),
  thresholdUnit: z.string().nullable().optional(),
  escalationRule: z.string().min(1).optional(),
  justificationRequired: z.boolean().optional(),
  recommendationRequired: z.boolean().optional(),
  evidenceRequired: z.boolean().optional(),
  ceoVisibility: z.enum(["NONE", "DIGEST", "NOTIFY", "IMMEDIATE"]).optional(),
  visibilityScope: z
    .enum(["ALL_DECISION_CENTER_USERS", "CEO_OFFICE", "CEO_ONLY", "SALES"])
    .optional(),
  isActive: z.boolean().optional(),
  changeReason: z.string().optional(),
  domain: z.enum(DC_DOMAINS_TUPLE).optional(),
});

export async function PATCH(request: NextRequest, ctx: Ctx) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "edit_policy");
  if (denied) return denied;

  const { id } = await ctx.params;
  const body = patchSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const existing = await prisma.dcPolicy.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const { changeReason, ...fields } = body.data;
  const nextVersion = existing.version + 1;

  const updated = await prisma.$transaction(async (tx) => {
    const policy = await tx.dcPolicy.update({
      where: { id },
      data: {
        ...fields,
        version: nextVersion,
        effectiveFrom: new Date(),
        updatedById: auth.ctx.userId,
      },
    });
    await tx.dcPolicyVersion.create({
      data: {
        policyId: id,
        version: nextVersion,
        snapshot: serializePolicy(policy),
        changeReason: changeReason ?? null,
        createdById: auth.ctx.userId,
      },
    });
    return policy;
  });

  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: fields.isActive === false ? "POLICY_DEACTIVATE" : "POLICY_UPDATE",
    entityType: "policy",
    entityId: id,
    policyId: id,
    oldValue: serializePolicy(existing),
    newValue: serializePolicy(updated),
    comment: changeReason ?? null,
  });

  return NextResponse.json({ policy: serializePolicy(updated) });
}

export async function DELETE() {
  return NextResponse.json(
    { error: "Les règles ne sont jamais supprimées. Désactivez-les." },
    { status: 405 }
  );
}
