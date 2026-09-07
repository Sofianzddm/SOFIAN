import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { writeDcAudit } from "@/lib/decision-center/audit";
import { serializePolicy } from "@/lib/decision-center/serialize";
import type { DcDomain, DcLevel, DcRole } from "@/lib/decision-center/constants";
import { DC_DOMAINS_TUPLE, DC_LEVELS_TUPLE, DC_ROLES_TUPLE } from "@/lib/decision-center/constants";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "view_matrix");
  if (denied) return denied;

  const { searchParams } = new URL(request.url);
  const domain = searchParams.get("domain");
  const owner = searchParams.get("owner");
  const level = searchParams.get("level");
  const active = searchParams.get("active");
  const q = (searchParams.get("q") || "").trim().toLowerCase();

  const policies = await prisma.dcPolicy.findMany({
    where: {
      ...(domain ? { domain: domain as DcDomain } : {}),
      ...(owner ? { ownerRole: owner as DcRole } : {}),
      ...(level ? { level: level as DcLevel } : {}),
      ...(active === "true" ? { isActive: true } : {}),
      ...(active === "false" ? { isActive: false } : {}),
    },
    orderBy: [{ domain: "asc" }, { title: "asc" }],
  });

  const filtered = q
    ? policies.filter((p) =>
        [p.code, p.title, p.description, p.autonomyRule, ...p.keywords]
          .join(" ")
          .toLowerCase()
          .includes(q)
      )
    : policies;

  return NextResponse.json({ policies: filtered.map(serializePolicy) });
}

const createSchema = z.object({
  code: z.string().min(3).max(80).regex(/^[A-Z0-9_]+$/),
  domain: z.enum(DC_DOMAINS_TUPLE),
  title: z.string().min(3).max(200),
  description: z.string().min(3),
  ownerRole: z.enum(DC_ROLES_TUPLE),
  executorRole: z.enum(DC_ROLES_TUPLE).nullable().optional(),
  finalDecisionRole: z.enum(DC_ROLES_TUPLE),
  level: z.enum(DC_LEVELS_TUPLE),
  autonomyRule: z.string().min(3),
  thresholdType: z.string().nullable().optional(),
  thresholdValue: z.number().nullable().optional(),
  thresholdUnit: z.string().nullable().optional(),
  escalationRule: z.string().min(1),
  justificationRequired: z.boolean().optional(),
  recommendationRequired: z.boolean().optional(),
  evidenceRequired: z.boolean().optional(),
  ceoVisibility: z.enum(["NONE", "DIGEST", "NOTIFY", "IMMEDIATE"]).optional(),
  visibilityScope: z
    .enum(["ALL_DECISION_CENTER_USERS", "CEO_OFFICE", "CEO_ONLY", "SALES"])
    .optional(),
  keywords: z.array(z.string()).optional(),
  examples: z.array(z.string()).optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "create_policy");
  if (denied) return denied;

  const body = createSchema.safeParse(await request.json());
  if (!body.success) {
    return NextResponse.json({ error: "Données invalides", details: body.error.flatten() }, { status: 400 });
  }

  const existing = await prisma.dcPolicy.findUnique({
    where: { code: body.data.code },
  });
  if (existing) {
    return NextResponse.json({ error: "Code déjà utilisé" }, { status: 409 });
  }

  const policy = await prisma.dcPolicy.create({
    data: {
      ...body.data,
      createdById: auth.ctx.userId,
      updatedById: auth.ctx.userId,
    },
  });
  await prisma.dcPolicyVersion.create({
    data: {
      policyId: policy.id,
      version: 1,
      snapshot: body.data,
      createdById: auth.ctx.userId,
    },
  });
  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: "POLICY_CREATE",
    entityType: "policy",
    entityId: policy.id,
    policyId: policy.id,
    newValue: body.data,
  });

  return NextResponse.json({ policy: serializePolicy(policy) }, { status: 201 });
}
