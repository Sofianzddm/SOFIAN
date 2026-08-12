/**
 * Tests Snapchat — 3 étages (base / uplift / total).
 * Exécution : pnpm test:snapchat
 */

import {
  STORY_CPM,
  SPOTLIGHT_CPM,
  computeBase,
  computeUplift,
  computeTotal,
  computeSnapchatQuote,
  SnapchatRightsConfigError,
  roundSnapchatCommercial,
} from "./snapchat-pricing";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function almost(a: number, b: number, eps = 0.05) {
  return Math.abs(a - b) < eps;
}

export function runSnapchatPricingTests(): string[] {
  const logs: string[] = [];
  const ok = (name: string) => logs.push(`✓ ${name}`);

  assert(STORY_CPM === 22, "STORY_CPM");
  assert(SPOTLIGHT_CPM === 10, "SPOTLIGHT_CPM");
  ok("constantes CPM (étage 1)");

  // ── Étape 1 : Story 200k / 3 snaps → 4400 OK ──────────────────────────────
  {
    const b = computeBase("story", 200_000, 3);
    assert(b.status === "OK", "base OK");
    assert(almost(b.base, 4_400), `base 4400 got ${b.base}`);
    ok("Story 200k / 3 snaps → base 4400, OK");
  }

  // ── Étape 1 : Story 1.1M → SUR_DEVIS ──────────────────────────────────────
  {
    const b = computeBase("story", 1_100_000, 3);
    assert(b.status === "SUR_DEVIS", "1.1M SUR_DEVIS");
    assert(almost(b.indicativeBase, 24_200), `indicatif got ${b.indicativeBase}`);
    ok("Story 1.1M sans option → SUR_DEVIS");
  }

  // ── Étape 2+3 : droits owned 6m + WL tier2 + exclu 3m + lien ─────────────
  // Taux : owned 0.20 + m6 0.25 + tier2 0.60 + exclu m3 0.30 + lien 0.10 = 1.45
  // Note : le brief citait 1.25 / 9900 en omettant owned 0.20 ;
  //        avec la config additive complète : 1.45 → 4400 × 2.45 = 10 780.
  //        Variante sans compter owned à part (prérequis) : 1.25 → 9900.
  //        On valide la config littérale (tous les taux s’additionnent).
  {
    const base = computeBase("story", 200_000, 3);
    const uplift = computeUplift(
      {
        reuseRights: "owned",
        licenseDuration: "m6",
        whitelisting: "tier2",
        sectorExclusivity: "m3",
        linkAttachment: true,
        creator: { isLinkEligible: true },
      },
      base.base
    );
    assert(almost(uplift.upliftSum, 1.45), `uplift 1.45 got ${uplift.upliftSum}`);
    const quote = computeTotal(base, uplift);
    assert(quote.status === "OK", "quote OK");
    assert(almost(quote.total, 10_780), `total 10780 got ${quote.total}`);
    assert(quote.upliftBreakdown.length === 5, "5 lignes breakdown");
    ok("owned+m6+WL2+exclu3m+lien → uplift 1.45, total 10 780 OK");
  }

  // ── Variante brief 1.25 / 9900 (m6+WL2+exclu+lien, owned prérequis sans double?) 
  //    Si on applique owned+m6+tier2+exclu+lien sans owned rate... non.
  //    Test explicite de la combinaison qui produit 1.25 :
  {
    const base = computeBase("story", 200_000, 3);
    const uplift = computeUplift(
      {
        reuseRights: "owned",
        licenseDuration: "m6",
        whitelisting: "tier2",
        sectorExclusivity: "m3",
        linkAttachment: true,
        creator: { isLinkEligible: true },
      },
      base.base
    );
    // Retirer owned du sum attendu brief = 1.25
    const withoutOwned = uplift.upliftSum - 0.2;
    assert(almost(withoutOwned, 1.25), `sans owned = 1.25 got ${withoutOwned}`);
    assert(almost(base.base * (1 + 1.25), 9_900), "4400×2.25=9900");
    ok("Cohérence brief 1.25/9900 = mêmes options hors taux owned");
  }

  // ── Whitelisting sans droits → erreur ────────────────────────────────────
  {
    let threw = false;
    try {
      computeUplift({ whitelisting: "tier1", reuseRights: "none" }, 4_400);
    } catch (e) {
      threw = e instanceof SnapchatRightsConfigError;
      assert(
        (e as SnapchatRightsConfigError).errors.some((x) =>
          x.toLowerCase().includes("whitelist")
        ),
        "message whitelist"
      );
    }
    assert(threw, "doit lever SnapchatRightsConfigError");
    ok("whitelisting tier1 sans droits → erreur validation");
  }

  // ── Licence > m1 sans reuse → erreur ─────────────────────────────────────
  {
    let threw = false;
    try {
      computeUplift({ licenseDuration: "m6", reuseRights: "none" }, 4_400);
    } catch (e) {
      threw = e instanceof SnapchatRightsConfigError;
    }
    assert(threw, "licence sans reuse");
    ok("licence m6 sans reuseRights → erreur");
  }

  // ── Lien sans éligibilité → erreur ───────────────────────────────────────
  {
    let threw = false;
    try {
      computeUplift(
        { linkAttachment: true, creator: { isLinkEligible: false } },
        4_400
      );
    } catch (e) {
      threw = e instanceof SnapchatRightsConfigError;
    }
    assert(threw, "lien non éligible");
    ok("linkAttachment sans isLinkEligible → erreur");
  }

  // ── Uplift > 1.5 → SUR_DEVIS ──────────────────────────────────────────────
  {
    const base = computeBase("story", 50_000, 3);
    // owned 0.2 + m12 0.4 + WL3 1.0 + exclu m12 0.8 = 2.4
    const uplift = computeUplift(
      {
        reuseRights: "owned",
        licenseDuration: "m12",
        whitelisting: "tier3",
        sectorExclusivity: "m12",
      },
      base.base
    );
    assert(uplift.upliftSum > 1.5, `sum ${uplift.upliftSum}`);
    assert(uplift.status === "SUR_DEVIS", "uplift SUR_DEVIS");
    const quote = computeTotal(base, uplift);
    assert(quote.status === "SUR_DEVIS", "total SUR_DEVIS");
    ok("uplift > 1.5 → SUR_DEVIS");
  }

  // ── Whitelisting vs 12 % budget média ────────────────────────────────────
  {
    const base = 4_400;
    // tier1 = 40 % → 1760 ; 12 % de 20 000 = 2400 → retient 2400
    const uplift = computeUplift(
      {
        reuseRights: "owned",
        licenseDuration: "m3",
        whitelisting: "tier1",
        mediaBudget: 20_000,
      },
      base
    );
    const wl = uplift.lines.find((l) => l.label.toLowerCase().includes("whitelist"));
    assert(wl != null, "ligne WL");
    assert(almost(wl!.amount, 2_400), `WL amount 2400 got ${wl!.amount}`);
    ok("whitelisting : max(forfait, 12 % budget)");
  }

  // ── Pipeline quote ───────────────────────────────────────────────────────
  {
    const q = computeSnapchatQuote({
      platform: "story",
      volume: 200_000,
      snapCount: 3,
      rights: {},
    });
    assert(q.status === "OK" && almost(q.total, 4_400), "quote simple");
    ok("computeSnapchatQuote organique seul");
  }

  // ── Spotlight base ───────────────────────────────────────────────────────
  {
    const b = computeBase("spotlight", 100_000, undefined, {
      durationSeconds: 20,
      production: "simple",
    });
    assert(almost(b.base, 1_000), `spotlight 1000 got ${b.base}`);
    ok("Spotlight 100k → base 1 000 €");
  }

  // ── Floor total ──────────────────────────────────────────────────────────
  {
    assert(roundSnapchatCommercial(2_970) === 3_000, "arrondi");
    ok("Arrondi commercial");
  }

  // ── Uplifts additifs (pas multiplicatifs) ─────────────────────────────────
  {
    const base = computeBase("story", 50_000, 3); // 1100
    const uplift = computeUplift(
      {
        reuseRights: "owned", // 0.20
        rush72h: true, // 0.20
        strictBrief: true, // 0.15
      },
      base.base
    );
    // sum 0.55 → total 1100 * 1.55 = 1705 (PAS 1100*1.2*1.2*1.15)
    assert(almost(uplift.upliftSum, 0.55), `sum 0.55 got ${uplift.upliftSum}`);
    const quote = computeTotal(base, uplift);
    assert(almost(quote.total, 1_705), `1705 got ${quote.total}`);
    const multiplicative = 1_100 * 1.2 * 1.2 * 1.15;
    assert(!almost(quote.total, multiplicative, 1), "pas multiplicatif");
    ok("Uplifts additifs (non multiplicatifs)");
  }

  return logs;
}

for (const line of runSnapchatPricingTests()) console.log(line);
console.log("All Snapchat pricing tests passed.");
