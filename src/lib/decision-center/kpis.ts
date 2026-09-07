import { startOfWeek } from "date-fns";
import prisma from "@/lib/prisma";
import type { DcRole } from "./constants";
import { hasCapability } from "./capabilities";

export async function getDecisionKpis(role: DcRole) {
  const now = new Date();
  const weekStart = startOfWeek(now, { weekStartsOn: 1 });

  const openStatuses = ["SUBMITTED", "NEEDS_INFORMATION"] as [
    "SUBMITTED",
    "NEEDS_INFORMATION",
  ];

  const [toDecide, exceptions, urgent, decidedThisWeek] = await Promise.all([
    prisma.dcRequest.count({
      where: {
        status: { in: openStatuses },
        OR: [{ policy: { level: "RED" } }, { riskLevel: "CRITICAL" }],
      },
    }),
    prisma.dcRequest.count({
      where: {
        status: { in: ["SUBMITTED", "NEEDS_INFORMATION"] },
        policy: { level: "ORANGE" },
      },
    }),
    prisma.dcRequest.count({
      where: {
        status: { in: openStatuses },
        deadline: { lte: new Date(now.getTime() + 48 * 3600 * 1000) },
      },
    }),
    prisma.dcRequest.count({
      where: {
        decidedAt: { gte: weekStart },
        status: { in: ["APPROVED", "REJECTED", "EXECUTED", "CLOSED"] },
      },
    }),
  ]);

  const pendingExecution = await prisma.dcRequest.count({
    where: { status: "APPROVED", executedAt: null },
  });

  const drafts = await prisma.dcRequest.count({
    where: { status: "DRAFT" },
  });

  return {
    toDecide,
    exceptions,
    urgent,
    decidedThisWeek,
    pendingExecution,
    drafts,
  };
}

export async function getSaasRenewals(alertDays: number) {
  const until = new Date();
  until.setDate(until.getDate() + alertDays);
  return prisma.dcSubscription.findMany({
    where: {
      status: { in: ["ACTIVE", "PENDING_RENEWAL", "TO_REVIEW"] },
      renewalDate: { lte: until, not: null },
    },
    orderBy: { renewalDate: "asc" },
    take: 20,
  });
}

export async function getReceivablesAging(): Promise<{
  over30: number;
  over45: number;
  over60: number;
} | null> {
  try {
    const overdue = await prisma.document.findMany({
      where: {
        type: "FACTURE",
        statut: { in: ["ENVOYE", "VALIDE"] },
        datePaiement: null,
        dateEcheance: { not: null, lt: new Date() },
      },
      select: { dateEcheance: true },
    });
    const now = Date.now();
    let over30 = 0;
    let over45 = 0;
    let over60 = 0;
    for (const d of overdue) {
      if (!d.dateEcheance) continue;
      const days = Math.floor(
        (now - d.dateEcheance.getTime()) / (1000 * 3600 * 24)
      );
      if (days > 60) over60 += 1;
      else if (days > 45) over45 += 1;
      else if (days > 30) over30 += 1;
    }
    return { over30: over30 + over45 + over60, over45: over45 + over60, over60 };
  } catch {
    return null;
  }
}

export async function getSignedUnbilledCount(): Promise<number | null> {
  try {
    return prisma.collaboration.count({
      where: {
        statut: { in: ["GAGNE", "EN_COURS", "PUBLIE"] },
        documents: { none: { type: "FACTURE" } },
      },
    });
  } catch {
    return null;
  }
}

export async function getFinanceMtdForCeo(role: DcRole): Promise<{
  caTotal: number;
  margeMoyenne: number;
} | null> {
  if (!hasCapability(role, "view_ceo_dashboard")) return null;
  try {
    const { getFinanceStats, resolvePeriode } = await import(
      "@/lib/finance/analytics"
    );
    const periode = resolvePeriode({ type: "mois" });
    const stats = await getFinanceStats(periode);
    return { caTotal: stats.caTotal, margeMoyenne: stats.margeMoyenne };
  } catch {
    return null;
  }
}
