import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing, findCeoUserId } from "@/lib/decision-center/access";
import { writeDcAudit, notifyDcUser } from "@/lib/decision-center/audit";
import { newDcReference, serializeRequest } from "@/lib/decision-center/serialize";
import { canViewRequest } from "@/lib/decision-center/visibility";
import { DC_DOMAINS_TUPLE, DC_RISK_LEVELS_TUPLE, DC_RISK_TYPES_TUPLE } from "@/lib/decision-center/constants";
import type { Prisma } from "@prisma/client";

const createSchema = z.object({
  title: z.string().min(3).max(200),
  domain: z.enum(DC_DOMAINS_TUPLE),
  policyId: z.string().nullable().optional(),
  context: z.string().min(3).max(2000),
  question: z.string().min(3).max(500),
  optionA: z.string().min(1),
  optionB: z.string().optional().nullable(),
  optionC: z.string().optional().nullable(),
  recommendation: z.string().min(3),
  amount: z.number().nullable().optional(),
  currency: z.string().optional(),
  amountTaxMode: z.enum(["HT", "TTC"]).optional(),
  recurring: z.boolean().optional(),
  riskLevel: z.enum(DC_RISK_LEVELS_TUPLE).optional(),
  riskTypes: z.array(z.enum(DC_RISK_TYPES_TUPLE)).optional(),
  deadline: z.string().datetime().nullable().optional(),
  kind: z.enum(["DECISION", "POLICY_PROPOSAL"]).optional(),
  submit: z.boolean().optional(),
});

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;

  const { searchParams } = new URL(request.url);
  const status = searchParams.get("status");
  const mine = searchParams.get("mine") === "true";
  const queue = searchParams.get("queue") === "true";

  const where: Prisma.DcRequestWhereInput = {};
  if (status) where.status = status as Prisma.EnumDcRequestStatusFilter;
  if (mine) where.requesterId = auth.ctx.userId;
  if (queue) {
    where.status = { in: ["SUBMITTED", "NEEDS_INFORMATION"] };
  }

  const rows = await prisma.dcRequest.findMany({
    where,
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true, visibilityScope: true } },
    },
    orderBy: [{ riskLevel: "desc" }, { deadline: "asc" }, { createdAt: "asc" }],
    take: 200,
  });

  const visible = rows.filter((r) =>
    canViewRequest({
      role: auth.ctx.dcRole,
      requesterId: r.requesterId,
      userId: auth.ctx.userId,
      scope: (r.policy?.visibilityScope ?? "ALL_DECISION_CENTER_USERS") as never,
      domain: r.domain,
    })
  );

  return NextResponse.json({ requests: visible.map(serializeRequest) });
}

export async function POST(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "create_request");
  if (denied) return denied;

  const parsed = createSchema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Données invalides", details: parsed.error.flatten() },
      { status: 400 }
    );
  }
  const data = parsed.data;
  const policy = data.policyId
    ? await prisma.dcPolicy.findUnique({ where: { id: data.policyId } })
    : null;

  const status = data.submit ? "SUBMITTED" : "DRAFT";

  const created = await prisma.dcRequest.create({
    data: {
      reference: newDcReference(),
      kind: data.kind ?? "DECISION",
      title: data.title,
      domain: data.domain,
      requesterId: auth.ctx.userId,
      policyId: policy?.id ?? null,
      policySnapshot: policy ? (serializePolicyLite(policy) as object) : undefined,
      context: data.context,
      question: data.question,
      optionA: data.optionA,
      optionB: data.optionB ?? null,
      optionC: data.optionC ?? null,
      recommendation: data.recommendation,
      amount: data.amount ?? null,
      currency: data.currency ?? "EUR",
      amountTaxMode: data.amountTaxMode ?? "TTC",
      recurring: data.recurring ?? false,
      riskLevel: data.riskLevel ?? "MEDIUM",
      riskTypes: data.riskTypes ?? [],
      deadline: data.deadline ? new Date(data.deadline) : null,
      status,
    },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
    },
  });

  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: status === "SUBMITTED" ? "REQUEST_SUBMIT" : "REQUEST_CREATE",
    entityType: "request",
    entityId: created.id,
    requestId: created.id,
    policyId: policy?.id ?? null,
    newValue: { title: created.title, status },
  });

  const isRed =
    policy?.level === "RED" ||
    data.riskLevel === "CRITICAL" ||
    policy?.ceoVisibility === "NOTIFY" ||
    policy?.ceoVisibility === "IMMEDIATE";

  if (status === "SUBMITTED" && isRed) {
    const ceoId = await findCeoUserId();
    if (ceoId && ceoId !== auth.ctx.userId) {
      await notifyDcUser({
        userId: ceoId,
        actorId: auth.ctx.userId,
        titre:
          data.riskLevel === "CRITICAL"
            ? "Décision critique"
            : "Décision à arbitrer",
        message: created.title,
        lien: `/decision-center/demandes/${created.id}`,
      });
    }
  }

  return NextResponse.json({ request: serializeRequest(created) }, { status: 201 });
}

function serializePolicyLite(p: {
  id: string;
  code: string;
  title: string;
  level: string;
  version: number;
  autonomyRule: string;
}) {
  return {
    id: p.id,
    code: p.code,
    title: p.title,
    level: p.level,
    version: p.version,
    autonomyRule: p.autonomyRule,
  };
}
