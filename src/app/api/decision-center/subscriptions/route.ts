import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { DC_ROLES_TUPLE } from "@/lib/decision-center/constants";
import { writeDcAudit } from "@/lib/decision-center/audit";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "manage_subscriptions");
  if (denied) return denied;

  const rows = await prisma.dcSubscription.findMany({
    orderBy: [{ status: "asc" }, { renewalDate: "asc" }],
  });
  return NextResponse.json({
    subscriptions: rows.map((s) => ({
      ...s,
      monthlyCost: Number(s.monthlyCost),
      annualCost: s.annualCost == null ? null : Number(s.annualCost),
    })),
  });
}

const schema = z.object({
  name: z.string().min(2),
  vendor: z.string().min(1),
  ownerRole: z.enum(DC_ROLES_TUPLE),
  monthlyCost: z.number().nonnegative(),
  annualCost: z.number().nullable().optional(),
  currency: z.string().optional(),
  renewalDate: z.string().datetime().nullable().optional(),
  noticePeriodDays: z.number().int().nullable().optional(),
  autoRenew: z.boolean().optional(),
  paymentMethodLabel: z.string().nullable().optional(),
  usageStatus: z.string().nullable().optional(),
  status: z.enum(["ACTIVE", "PENDING_RENEWAL", "TO_REVIEW", "CANCELLED"]).optional(),
  notes: z.string().nullable().optional(),
});

export async function POST(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "manage_subscriptions");
  if (denied) return denied;

  const parsed = schema.safeParse(await request.json());
  if (!parsed.success) {
    return NextResponse.json({ error: "Données invalides" }, { status: 400 });
  }

  const created = await prisma.dcSubscription.create({
    data: {
      ...parsed.data,
      currency: parsed.data.currency ?? "EUR",
      renewalDate: parsed.data.renewalDate ? new Date(parsed.data.renewalDate) : null,
    },
  });
  await writeDcAudit({
    actorId: auth.ctx.userId,
    action: "SUBSCRIPTION_CREATE",
    entityType: "subscription",
    entityId: created.id,
    newValue: { name: created.name, vendor: created.vendor },
  });
  return NextResponse.json({
    subscription: {
      ...created,
      monthlyCost: Number(created.monthlyCost),
      annualCost: created.annualCost == null ? null : Number(created.annualCost),
    },
  }, { status: 201 });
}
