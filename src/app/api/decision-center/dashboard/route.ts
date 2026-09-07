import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { requireDcApi } from "@/lib/decision-center/access";
import {
  getDecisionKpis,
  getFinanceMtdForCeo,
  getReceivablesAging,
  getSaasRenewals,
  getSignedUnbilledCount,
} from "@/lib/decision-center/kpis";
import { serializeRequest } from "@/lib/decision-center/serialize";
import { hasCapability } from "@/lib/decision-center/capabilities";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;

  const kpis = await getDecisionKpis(auth.ctx.dcRole);
  const settings = await prisma.dcSettings.findUnique({ where: { id: "default" } });
  const alertDays = settings?.saasRenewalAlertDays ?? 60;

  const queue = await prisma.dcRequest.findMany({
    where: { status: { in: ["SUBMITTED", "NEEDS_INFORMATION"] } },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
    },
    orderBy: [{ riskLevel: "desc" }, { deadline: "asc" }, { createdAt: "asc" }],
    take: 30,
  });

  const saas = hasCapability(auth.ctx.dcRole, "manage_subscriptions") ||
    hasCapability(auth.ctx.dcRole, "view_ceo_dashboard")
    ? await getSaasRenewals(alertDays)
    : [];

  const ar =
    hasCapability(auth.ctx.dcRole, "view_ceo_dashboard") ||
    hasCapability(auth.ctx.dcRole, "view_ea_dashboard")
      ? await getReceivablesAging()
      : null;

  const signedUnbilled = hasCapability(auth.ctx.dcRole, "view_ceo_dashboard")
    ? await getSignedUnbilledCount()
    : null;

  const finance = await getFinanceMtdForCeo(auth.ctx.dcRole);

  const mySales = auth.ctx.dcRole === "HEAD_OF_SALES"
    ? await prisma.dcRequest.findMany({
        where: { requesterId: auth.ctx.userId },
        include: {
          requester: { select: { prenom: true, nom: true, email: true } },
          policy: { select: { code: true, title: true, level: true } },
        },
        orderBy: { createdAt: "desc" },
        take: 10,
      })
    : [];

  return NextResponse.json({
    role: auth.ctx.dcRole,
    kpis,
    queue: queue.map(serializeRequest),
    saas: saas.map((s) => ({
      id: s.id,
      name: s.name,
      vendor: s.vendor,
      monthlyCost: Number(s.monthlyCost),
      annualCost: s.annualCost == null ? null : Number(s.annualCost),
      renewalDate: s.renewalDate?.toISOString() ?? null,
      status: s.status,
    })),
    receivables: ar,
    signedUnbilled,
    finance,
    mySales: mySales.map(serializeRequest),
  });
}
