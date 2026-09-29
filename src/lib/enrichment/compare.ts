/**
 * Enrichissement parallèle Apollo + Lusha + comparaison des emails.
 */

import { enrichWithApollo } from "@/lib/enrichment/apollo";
import { enrichWithLusha } from "@/lib/enrichment/lusha";
import type {
  EnrichCompareResponse,
  EnrichPersonInput,
  EnrichmentEmail,
} from "@/lib/enrichment/types";

function mergeEmails(
  a: EnrichmentEmail[],
  b: EnrichmentEmail[]
): EnrichmentEmail[] {
  const map = new Map<string, EnrichmentEmail>();
  const rank = (t: EnrichmentEmail["type"]) =>
    t === "work" ? 0 : t === "unknown" ? 1 : 2;
  for (const e of [...a, ...b]) {
    const key = e.email.toLowerCase();
    const prev = map.get(key);
    if (!prev || rank(e.type) < rank(prev.type)) {
      map.set(key, e);
    }
  }
  return Array.from(map.values()).sort(
    (x, y) => rank(x.type) - rank(y.type) || x.email.localeCompare(y.email)
  );
}

export async function compareEnrichmentProviders(
  input: EnrichPersonInput
): Promise<EnrichCompareResponse> {
  const [apollo, lusha] = await Promise.all([
    enrichWithApollo(input),
    enrichWithLusha(input),
  ]);

  const apolloSet = new Set(apollo.emails.map((e) => e.email.toLowerCase()));
  const lushaSet = new Set(lusha.emails.map((e) => e.email.toLowerCase()));
  const agreement = [...apolloSet].filter((e) => lushaSet.has(e)).sort();

  return {
    input,
    apollo,
    lusha,
    agreement,
    allEmails: mergeEmails(apollo.emails, lusha.emails),
  };
}
