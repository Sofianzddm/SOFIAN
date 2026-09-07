import { NextRequest, NextResponse } from "next/server";
import { startOfWeek } from "date-fns";
import prisma from "@/lib/prisma";
import { requireDcApi, forbidIfMissing } from "@/lib/decision-center/access";
import { serializeRequest } from "@/lib/decision-center/serialize";
import {
  getFinanceMtdForCeo,
  getReceivablesAging,
  getSaasRenewals,
} from "@/lib/decision-center/kpis";

export async function GET(request: NextRequest) {
  const auth = await requireDcApi(request);
  if (!auth.ok) return auth.response;
  const denied = forbidIfMissing(auth.ctx, "view_digest");
  if (denied) return denied;

  const weekStart = startOfWeek(new Date(), { weekStartsOn: 1 });
  const red = await prisma.dcRequest.findMany({
    where: {
      status: { in: ["SUBMITTED", "NEEDS_INFORMATION"] },
      OR: [{ policy: { level: "RED" } }, { riskLevel: { in: ["HIGH", "CRITICAL"] } }],
    },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
    },
    orderBy: [{ riskLevel: "desc" }, { createdAt: "asc" }],
    take: 12,
  });

  const orange = await prisma.dcRequest.findMany({
    where: {
      createdAt: { gte: weekStart },
      policy: { level: "ORANGE" },
    },
    include: {
      requester: { select: { prenom: true, nom: true, email: true } },
      policy: { select: { code: true, title: true, level: true } },
    },
    take: 10,
  });

  const settings = await prisma.dcSettings.findUnique({ where: { id: "default" } });
  const saas = await getSaasRenewals(settings?.saasRenewalAlertDays ?? 60);
  const ar = await getReceivablesAging();
  const finance = await getFinanceMtdForCeo(auth.ctx.dcRole);

  return NextResponse.json({
    generatedAt: new Date().toISOString(),
    red: red.map(serializeRequest),
    orange: orange.map(serializeRequest),
    finance,
    receivables: ar,
    saas: saas.map((s) => ({
      name: s.name,
      vendor: s.vendor,
      renewalDate: s.renewalDate?.toISOString() ?? null,
      monthlyCost: Number(s.monthlyCost),
    })),
  });
}
