import {
  DC_DEFAULT_SETTINGS,
  type DcLevel,
  type DcRole,
} from "./constants";

export type ThresholdVerdict = {
  level: DcLevel;
  ownerRole: DcRole;
  finalDecisionRole: DcRole;
  policyCode: string;
  reason: string;
};

export function evaluateTravelAmount(
  amountTtc: number,
  threshold = DC_DEFAULT_SETTINGS.travelThresholdTtc
): ThresholdVerdict {
  if (amountTtc <= threshold) {
    return {
      level: "GREEN",
      ownerRole: "EXECUTIVE_ASSISTANT",
      finalDecisionRole: "EXECUTIVE_ASSISTANT",
      policyCode: "TRAVEL_UNDER_200",
      reason: `Le coût total prévisionnel (${formatEur(amountTtc)}) est ≤ ${threshold} € TTC / personne.`,
    };
  }
  return {
    level: "RED",
    ownerRole: "CEO",
    finalDecisionRole: "CEO",
    policyCode: "TRAVEL_OVER_200",
    reason: `Le coût total prévisionnel (${formatEur(amountTtc)}) dépasse le seuil de ${threshold} € TTC / personne.`,
  };
}

export function evaluateSmallPurchase(
  amountTtc: number,
  threshold = DC_DEFAULT_SETTINGS.smallPurchaseThresholdTtc
): ThresholdVerdict {
  if (amountTtc <= threshold) {
    return {
      level: "GREEN",
      ownerRole: "EXECUTIVE_ASSISTANT",
      finalDecisionRole: "EXECUTIVE_ASSISTANT",
      policyCode: "PURCHASE_SMALL_UNDER_100",
      reason: `Achat ponctuel (${formatEur(amountTtc)}) ≤ ${threshold} € TTC, hors engagement récurrent.`,
    };
  }
  return {
    level: "RED",
    ownerRole: "CEO",
    finalDecisionRole: "CEO",
    policyCode: "PURCHASE_OVER_100",
    reason: `Achat (${formatEur(amountTtc)}) > ${threshold} € TTC hors budget pré-approuvé.`,
  };
}

export function evaluateReceivableAge(
  days: number,
  orangeDays = DC_DEFAULT_SETTINGS.receivableOrangeDays,
  redDays = DC_DEFAULT_SETTINGS.receivableRedDays
): ThresholdVerdict {
  if (days < 0) days = 0;
  if (days <= 30) {
    return {
      level: "GREEN",
      ownerRole: "FINANCE",
      finalDecisionRole: "FINANCE",
      policyCode: "AR_0_30",
      reason: "Relance normale (0–30 jours) : la comptabilité relance sans validation CEO.",
    };
  }
  if (days <= orangeDays) {
    return {
      level: "GREEN",
      ownerRole: "EXECUTIVE_ASSISTANT",
      finalDecisionRole: "EXECUTIVE_ASSISTANT",
      policyCode: "AR_30_45",
      reason: "Relance renforcée (30–45 jours) : Maud suit, sans décision Sofian.",
    };
  }
  if (days <= redDays) {
    return {
      level: "ORANGE",
      ownerRole: "EXECUTIVE_ASSISTANT",
      finalDecisionRole: "EXECUTIVE_ASSISTANT",
      policyCode: "AR_45_60",
      reason:
        "45–60 jours : suivi Maud + digest CEO. Pas d’action Sofian automatique si le client répond et qu’une date de paiement est crédible.",
    };
  }
  return {
    level: "RED",
    ownerRole: "CEO",
    finalDecisionRole: "CEO",
    policyCode: "AR_OVER_60",
    reason:
      "Créance > 60 jours : escalade Sofian si non-paiement persistant, silence, promesse non tenue, montant important, client stratégique ou litige.",
  };
}

export function evaluatePricingVsFloor(
  proposedPrice: number,
  floorPrice: number
): ThresholdVerdict {
  if (proposedPrice >= floorPrice) {
    return {
      level: "GREEN",
      ownerRole: "HEAD_OF_SALES",
      finalDecisionRole: "HEAD_OF_SALES",
      policyCode: "SALES_ABOVE_FLOOR",
      reason:
        "Le tarif reste au-dessus du prix plancher : Leyna peut décider, sans règle arbitraire de −10 %.",
    };
  }
  return {
    level: "RED",
    ownerRole: "CEO",
    finalDecisionRole: "CEO",
    policyCode: "SALES_BELOW_FLOOR",
    reason: "Le tarif est sous le prix plancher : validation Sofian obligatoire.",
  };
}

export function evaluateRecurringCommitment(
  monthlyCost: number,
  months: number
): { total: number; treatAsSignificant: boolean } {
  const total = monthlyCost * months;
  return {
    total,
    treatAsSignificant: total > DC_DEFAULT_SETTINGS.smallPurchaseThresholdTtc,
  };
}

export function formatEur(amount: number): string {
  return `${amount.toLocaleString("fr-FR", {
    minimumFractionDigits: amount % 1 === 0 ? 0 : 2,
    maximumFractionDigits: 2,
  })} €`;
}

export function isActivePolicyVisible(isActive: boolean): boolean {
  return isActive;
}
