import type { Prisma } from "@prisma/client";
import { nanoid } from "nanoid";

export function newDcReference(): string {
  const year = new Date().getFullYear();
  return `DC-${year}-${nanoid(6).toUpperCase()}`;
}

export function policyToSearchable(p: {
  id: string;
  code: string;
  domain: string;
  title: string;
  description: string;
  ownerRole: string;
  executorRole: string | null;
  finalDecisionRole: string;
  level: string;
  autonomyRule: string;
  thresholdType: string | null;
  thresholdValue: Prisma.Decimal | number | null;
  thresholdUnit: string | null;
  escalationRule: string;
  keywords: string[];
  examples: string[];
  isActive: boolean;
}) {
  return {
    id: p.id,
    code: p.code,
    domain: p.domain as never,
    title: p.title,
    description: p.description,
    ownerRole: p.ownerRole as never,
    executorRole: p.executorRole as never,
    finalDecisionRole: p.finalDecisionRole as never,
    level: p.level as never,
    autonomyRule: p.autonomyRule,
    thresholdType: p.thresholdType,
    thresholdValue:
      p.thresholdValue == null ? null : Number(p.thresholdValue),
    thresholdUnit: p.thresholdUnit,
    escalationRule: p.escalationRule,
    keywords: p.keywords,
    examples: p.examples,
    isActive: p.isActive,
  };
}

export function serializePolicy(p: {
  id: string;
  code: string;
  domain: string;
  title: string;
  description: string;
  ownerRole: string;
  executorRole: string | null;
  finalDecisionRole: string;
  level: string;
  autonomyRule: string;
  thresholdType: string | null;
  thresholdValue: Prisma.Decimal | number | null;
  thresholdUnit: string | null;
  escalationRule: string;
  justificationRequired: boolean;
  recommendationRequired: boolean;
  evidenceRequired: boolean;
  ceoVisibility: string;
  visibilityScope: string;
  keywords: string[];
  examples: string[];
  isActive: boolean;
  version: number;
  effectiveFrom: Date;
  updatedAt: Date;
}) {
  return {
    ...policyToSearchable(p),
    justificationRequired: p.justificationRequired,
    recommendationRequired: p.recommendationRequired,
    evidenceRequired: p.evidenceRequired,
    ceoVisibility: p.ceoVisibility,
    visibilityScope: p.visibilityScope,
    version: p.version,
    effectiveFrom: p.effectiveFrom.toISOString(),
    updatedAt: p.updatedAt.toISOString(),
  };
}

export function serializeRequest(r: {
  id: string;
  reference: string;
  kind: string;
  title: string;
  domain: string;
  requesterId: string;
  requester?: { prenom: string; nom: string; email: string };
  policyId: string | null;
  policy?: { code: string; title: string; level: string } | null;
  policySnapshot: Prisma.JsonValue | null;
  context: string;
  question: string;
  optionA: string;
  optionB: string | null;
  optionC: string | null;
  recommendation: string;
  amount: Prisma.Decimal | number | null;
  currency: string;
  amountTaxMode: string;
  recurring: boolean;
  riskLevel: string;
  riskTypes: string[];
  deadline: Date | null;
  status: string;
  finalDecision: string | null;
  finalOption: string | null;
  decidedById: string | null;
  decidedAt: Date | null;
  executionStatus: string | null;
  executedAt: Date | null;
  businessValidatorName: string | null;
  businessValidatedAt: Date | null;
  businessValidationNote: string | null;
  createdAt: Date;
  updatedAt: Date;
  comments?: {
    id: string;
    body: string;
    createdAt: Date;
    author: { prenom: string; nom: string };
  }[];
}) {
  return {
    id: r.id,
    reference: r.reference,
    kind: r.kind,
    title: r.title,
    domain: r.domain,
    requesterId: r.requesterId,
    requesterName: r.requester
      ? `${r.requester.prenom} ${r.requester.nom}`.trim()
      : null,
    policyId: r.policyId,
    policyCode: r.policy?.code ?? null,
    policyTitle: r.policy?.title ?? null,
    policyLevel: r.policy?.level ?? null,
    context: r.context,
    question: r.question,
    optionA: r.optionA,
    optionB: r.optionB,
    optionC: r.optionC,
    recommendation: r.recommendation,
    amount: r.amount == null ? null : Number(r.amount),
    currency: r.currency,
    amountTaxMode: r.amountTaxMode,
    recurring: r.recurring,
    riskLevel: r.riskLevel,
    riskTypes: r.riskTypes,
    deadline: r.deadline?.toISOString() ?? null,
    status: r.status,
    finalDecision: r.finalDecision,
    finalOption: r.finalOption,
    decidedById: r.decidedById,
    decidedAt: r.decidedAt?.toISOString() ?? null,
    executionStatus: r.executionStatus,
    executedAt: r.executedAt?.toISOString() ?? null,
    businessValidatorName: r.businessValidatorName,
    businessValidatedAt: r.businessValidatedAt?.toISOString() ?? null,
    businessValidationNote: r.businessValidationNote,
    createdAt: r.createdAt.toISOString(),
    updatedAt: r.updatedAt.toISOString(),
    comments: (r.comments ?? []).map((c) => ({
      id: c.id,
      body: c.body,
      createdAt: c.createdAt.toISOString(),
      authorName: `${c.author.prenom} ${c.author.nom}`.trim(),
    })),
  };
}
