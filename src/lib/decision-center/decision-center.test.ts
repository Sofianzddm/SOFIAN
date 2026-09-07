/**
 * Tests Decision Center — exécution : pnpm test:decision-center
 */
import {
  canPhysicallyDeleteRequest,
  isDecisionCenterEmail,
  isFinalizedStatus,
  phase1RoleForEmail,
  DECISION_CENTER_ALLOWED_EMAILS,
} from "./constants";
import {
  canAccessAdmin,
  canAdministerPolicies,
  canDecideRed,
  canSeeVisibility,
  capabilitiesForRole,
  hasCapability,
} from "./capabilities";
import {
  evaluatePricingVsFloor,
  evaluateReceivableAge,
  evaluateRecurringCommitment,
  evaluateSmallPurchase,
  evaluateTravelAmount,
  isActivePolicyVisible,
} from "./engine";
import { extractAmountEuros, extractDays, searchPolicies } from "./matcher";
import { DC_POLICY_SEEDS } from "./policies-seed";
import type { SearchablePolicy } from "./matcher";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

export function runDecisionCenterTests(): string[] {
  const logs: string[] = [];
  const ok = (name: string) => logs.push(`✓ ${name}`);

  // ——— Permissions / whitelist ———
  assert(!isDecisionCenterEmail("ines@glowupagence.fr"), "ines blocked");
  assert(!isDecisionCenterEmail("admin@example.com"), "random blocked");
  assert(isDecisionCenterEmail("s.zeddam@glowupagence.fr"), "sofian allowed");
  assert(isDecisionCenterEmail("sofian@glowupagence.fr"), "sofian alias allowed");
  assert(isDecisionCenterEmail("maud@glowupagence.fr"), "maud allowed");
  assert(isDecisionCenterEmail("leyna@glowupagence.fr"), "leyna allowed");
  assert(isDecisionCenterEmail("S.Zeddam@GlowUpAgence.fr"), "case insensitive");
  assert(DECISION_CENTER_ALLOWED_EMAILS.length === 4, "exactly 4 emails");
  ok("utilisateur non whitelisté inaccessible");

  assert(phase1RoleForEmail("s.zeddam@glowupagence.fr") === "CEO", "sofian CEO");
  assert(phase1RoleForEmail("sofian@glowupagence.fr") === "CEO", "sofian alias CEO");
  assert(phase1RoleForEmail("maud@glowupagence.fr") === "EXECUTIVE_ASSISTANT", "maud EA");
  assert(phase1RoleForEmail("leyna@glowupagence.fr") === "HEAD_OF_SALES", "leyna HoS");
  ok("Sofian / Maud / Leyna — rôles phase 1");

  assert(canDecideRed("CEO"), "sofian decide red");
  assert(!canDecideRed("EXECUTIVE_ASSISTANT"), "maud pas de RED");
  assert(!canDecideRed("HEAD_OF_SALES"), "leyna pas de RED");
  assert(hasCapability("CEO", "view_audit"), "sofian audit");
  assert(hasCapability("CEO", "edit_policy"), "sofian admin");
  assert(!hasCapability("EXECUTIVE_ASSISTANT", "edit_policy"), "maud pas edit published direct");
  assert(!canAdministerPolicies("HEAD_OF_SALES"), "leyna pas admin globale");
  assert(!canAccessAdmin("HEAD_OF_SALES"), "leyna pas admin");
  assert(!hasCapability("HEAD_OF_SALES", "view_sensitive_hr"), "leyna pas RH sensible");
  assert(!canSeeVisibility("HEAD_OF_SALES", "CEO_ONLY"), "leyna pas CEO_ONLY");
  assert(canSeeVisibility("CEO", "CEO_ONLY"), "sofian CEO_ONLY");
  assert(canSeeVisibility("EXECUTIVE_ASSISTANT", "CEO_OFFICE"), "maud CEO office");
  assert(!canSeeVisibility("EXECUTIVE_ASSISTANT", "CEO_ONLY"), "maud pas CEO_ONLY");
  ok("Sofian full access · Maud pas de décision RED · Leyna pas d’administration");

  // ——— Travel ———
  assert(evaluateTravelAmount(199).policyCode === "TRAVEL_UNDER_200", "199 maud");
  assert(evaluateTravelAmount(199).level === "GREEN", "199 green");
  assert(evaluateTravelAmount(200).policyCode === "TRAVEL_UNDER_200", "200 maud");
  assert(evaluateTravelAmount(200).ownerRole === "EXECUTIVE_ASSISTANT", "200 owner maud");
  assert(evaluateTravelAmount(200.01).policyCode === "TRAVEL_OVER_200", "200.01 sofian");
  assert(evaluateTravelAmount(200.01).level === "RED", "200.01 red");
  assert(evaluateTravelAmount(200.01).finalDecisionRole === "CEO", "200.01 ceo");
  ok("Travel 199/200 Maud · 200.01 Sofian");

  // ——— Small purchase ———
  assert(evaluateSmallPurchase(100).level === "GREEN", "100 maud");
  assert(evaluateSmallPurchase(100.01).level === "RED", "100.01 sofian");
  ok("Small purchase 100 Maud · 100.01 Sofian");

  // ——— Receivables ———
  assert(evaluateReceivableAge(30).level === "GREEN", "30 green");
  assert(evaluateReceivableAge(45).level === "GREEN", "45 green maud");
  assert(evaluateReceivableAge(50).level === "ORANGE", "50 orange");
  assert(evaluateReceivableAge(61).level === "RED", ">60 red");
  ok("Receivables 30 GREEN · 45 ORANGE-cadre Maud · >60 RED");

  // ——— Pricing ———
  assert(evaluatePricingVsFloor(5000, 4500).level === "GREEN", "above floor leyna");
  assert(evaluatePricingVsFloor(4400, 4500).level === "RED", "below floor sofian");
  ok("Pricing au-dessus plancher Leyna · sous plancher Sofian");

  // ——— Recurring ———
  const rec = evaluateRecurringCommitment(120, 24);
  assert(rec.total === 2880, `commitment 2880 got ${rec.total}`);
  assert(rec.treatAsSignificant, "not a small purchase");
  ok("SaaS 120€ x 24 mois = engagement 2880 €");

  // ——— History ———
  assert(!canPhysicallyDeleteRequest("APPROVED"), "no delete approved");
  assert(!canPhysicallyDeleteRequest("DRAFT"), "no delete even draft");
  assert(isFinalizedStatus("APPROVED"), "finalized");
  ok("Une décision finalisée ne peut pas être supprimée");

  // ——— Inactive policy ———
  assert(isActivePolicyVisible(true), "active visible");
  assert(!isActivePolicyVisible(false), "inactive hidden from active list");
  ok("Policy inactive hors règles actives");

  // ——— Search examples ———
  const searchable: SearchablePolicy[] = DC_POLICY_SEEDS.map((p) => ({
    ...p,
    isActive: true,
  }));
  const bagage = searchPolicies("bagage 50 euros", searchable);
  assert(bagage[0]?.verdictOverride?.level === "GREEN", "bagage green");
  assert(
    bagage[0]?.policy.code === "TRAVEL_UNDER_200" ||
      bagage[0]?.policy.code === "TRAVEL_ANCILLARY",
    `bagage code ${bagage[0]?.policy.code}`
  );
  ok("Recherche bagage 50 € → Maud");

  const train = searchPolicies("train 250 euros", searchable);
  assert(train[0]?.verdictOverride?.level === "RED", "train 250 red");
  assert(train[0]?.verdictOverride?.cta === "prepare", "train 250 prepare");
  ok("Recherche train 250 € → Sofian + CTA");

  const nego = searchPolicies("négocier 4500 au lieu de 5000", searchable);
  assert(nego[0]?.verdictOverride?.headline.toLowerCase().includes("plancher") ||
    nego[0]?.verdictOverride?.reason.toLowerCase().includes("plancher"), "nego plancher");
  ok("Négociation 4500 vs 5000 → plancher, pas −10 %");

  assert(extractAmountEuros("billet 180 €") === 180, "extract 180");
  assert(extractAmountEuros("billet 200.01 €") === 200.01, "extract 200.01");
  assert(extractDays("impayé 70 jours") === 70, "extract 70 days");
  ok("Parse montant / jours");

  const codes = DC_POLICY_SEEDS.map((p) => p.code);
  assert(new Set(codes).size === codes.length, "unique policy codes");
  assert(codes.includes("TRAVEL_UNDER_200"), "TRAVEL_UNDER_200");
  assert(codes.includes("FINANCE_ADVANCE_TALENT"), "ADVANCE");
  assert(codes.includes("CRM_CONTACT_CREATE"), "CRM");
  assert(codes.length >= 80, `at least 80 policies, got ${codes.length}`);
  ok(`Seed : ${codes.length} règles, codes uniques`);

  void capabilitiesForRole("CEO");
  return logs;
}

if (process.argv[1]?.includes("decision-center.test")) {
  try {
    const logs = runDecisionCenterTests();
    logs.forEach((l) => console.log(l));
    console.log(`\n${logs.length} assertions OK`);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}
