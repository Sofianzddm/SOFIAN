/**
 * Cache localStorage du batch Outreach Clients
 * (marque / talent / Leyna) — partagé barre batch ↔ CastingComposer.
 */

export type OutreachCachedBrandResearch = {
  recentCampaigns: string;
  newProducts: string;
  availabilityFrEu?: string;
  brandPositioning: string;
  influenceStrategy: string;
};

export type OutreachCachedTalentResearchItem = {
  talentId: string;
  name: string;
  whoTheyAre: string;
  whatTheyDo?: string;
  profileAnalysis?: string;
  contentThemes: string;
  whyRelevant: string;
  proofPoints: string;
  sourcesUsed?: string;
};

export type OutreachCachedLeynaExchange = {
  hasExchange: boolean;
  hasSentNoReplyOnly?: boolean;
  tone?: "tu" | "vous" | null;
  bannerLabel?: string | null;
  alerts?: string[];
  promptBlockFr?: string;
  promptBlockEn?: string;
  scanStatus?: "ok" | "empty" | "failed";
  fetchedAt?: string | null;
  contacts?: Array<{
    email: string;
    subject?: string | null;
    tone?: "tu" | "vous" | null;
    notes?: string;
    alerts?: string[];
    lastExchangeAt?: string | null;
    clientSnippet?: string | null;
    status?: "exchange" | "sent_no_reply";
    messageCount?: number;
  }>;
};

function brandResearchKey(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "")
    .trim();
}

function brandResearchKeys(name: string): string[] {
  const trimmed = String(name || "").trim();
  if (!trimmed) return [];
  const lower = trimmed.toLowerCase();
  const noSpace = lower.replace(/\s+/g, "");
  const normalized = brandResearchKey(trimmed);
  return Array.from(new Set([normalized, lower, noSpace].filter(Boolean)));
}

export function outreachClientsCacheScope(market: "FR" | "BENELUX"): string {
  return `outreach-clients:${market}`;
}

function readStorageRaw(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const local = localStorage.getItem(storageKey);
    if (local) return local;
    const session = sessionStorage.getItem(storageKey);
    if (session) {
      try {
        localStorage.setItem(storageKey, session);
      } catch {
        // quota
      }
      return session;
    }
  } catch {
    // private mode
  }
  return null;
}

function loadJsonCache<T>(storageKey: string): Record<string, T> {
  try {
    const raw = readStorageRaw(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, T>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

function saveJsonCache<T>(storageKey: string, cache: Record<string, T>) {
  if (typeof window === "undefined") return;
  const raw = JSON.stringify(cache);
  try {
    localStorage.setItem(storageKey, raw);
  } catch {
    // quota / private mode
  }
  try {
    sessionStorage.setItem(storageKey, raw);
  } catch {
    // ignore
  }
}

export function lookupOutreachBrandCache<T>(
  cache: Record<string, T>,
  ...names: Array<string | null | undefined>
): T | null {
  for (const n of names) {
    for (const key of brandResearchKeys(String(n || ""))) {
      if (key && cache[key] != null) return cache[key];
    }
  }
  return null;
}

export function hasOutreachBrandCacheEntry(
  cache: Record<string, unknown>,
  ...names: Array<string | null | undefined>
): boolean {
  return lookupOutreachBrandCache(cache, ...names) != null;
}

/** Marchés à lire/écrire pour un contact (FR+BE → les deux caches). */
export function outreachCacheMarketsForContact(opts: {
  pipeline?: "FR" | "BENELUX" | null;
  alsoInSiblingMarket?: boolean;
}): Array<"FR" | "BENELUX"> {
  if (opts.alsoInSiblingMarket) return ["FR", "BENELUX"];
  return [opts.pipeline === "BENELUX" ? "BENELUX" : "FR"];
}

/** Fusionne plusieurs caches marché (premier trouvé gagne par clé). */
export function mergeOutreachCaches<T>(
  caches: Array<Record<string, T>>
): Record<string, T> {
  const out: Record<string, T> = {};
  for (const c of caches) {
    for (const [k, v] of Object.entries(c)) {
      if (out[k] == null) out[k] = v;
    }
  }
  return out;
}

export function loadOutreachBrandResearchCache(market: "FR" | "BENELUX") {
  return loadJsonCache<OutreachCachedBrandResearch>(
    `po-brand-research:${outreachClientsCacheScope(market)}`
  );
}

/** Charge et fusionne le cache marque sur un ou plusieurs marchés. */
export function loadOutreachBrandResearchCacheMarkets(
  markets: Array<"FR" | "BENELUX">
) {
  return mergeOutreachCaches(
    markets.map((m) => loadOutreachBrandResearchCache(m))
  );
}

export function saveOutreachBrandResearchCache(
  market: "FR" | "BENELUX",
  cache: Record<string, OutreachCachedBrandResearch>
) {
  saveJsonCache(
    `po-brand-research:${outreachClientsCacheScope(market)}`,
    cache
  );
}

export function loadOutreachTalentResearchCache(market: "FR" | "BENELUX") {
  return loadJsonCache<OutreachCachedTalentResearchItem[]>(
    `po-talent-research:${outreachClientsCacheScope(market)}`
  );
}

export function loadOutreachTalentResearchCacheMarkets(
  markets: Array<"FR" | "BENELUX">
) {
  return mergeOutreachCaches(
    markets.map((m) => loadOutreachTalentResearchCache(m))
  );
}

export function saveOutreachTalentResearchCache(
  market: "FR" | "BENELUX",
  cache: Record<string, OutreachCachedTalentResearchItem[]>
) {
  saveJsonCache(
    `po-talent-research:${outreachClientsCacheScope(market)}`,
    cache
  );
}

export function loadOutreachLeynaExchangeCache(market: "FR" | "BENELUX") {
  return loadJsonCache<OutreachCachedLeynaExchange>(
    `po-leyna-exchange:v6:${outreachClientsCacheScope(market)}`
  );
}

export function loadOutreachLeynaExchangeCacheMarkets(
  markets: Array<"FR" | "BENELUX">
) {
  return mergeOutreachCaches(
    markets.map((m) => loadOutreachLeynaExchangeCache(m))
  );
}

export function saveOutreachLeynaExchangeCache(
  market: "FR" | "BENELUX",
  cache: Record<string, OutreachCachedLeynaExchange>
) {
  saveJsonCache(
    `po-leyna-exchange:v6:${outreachClientsCacheScope(market)}`,
    cache
  );
}

export function cacheOutreachBrandResearch(
  market: "FR" | "BENELUX",
  brandName: string,
  data: OutreachCachedBrandResearch
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadOutreachBrandResearchCache(market);
  saveOutreachBrandResearchCache(market, { ...prev, [key]: data });
}

/** Écrit l’analyse marque dans tous les marchés listés (ex. FR+BE). */
export function cacheOutreachBrandResearchMarkets(
  markets: Array<"FR" | "BENELUX">,
  brandName: string,
  data: OutreachCachedBrandResearch
) {
  for (const m of markets) cacheOutreachBrandResearch(m, brandName, data);
}

export function cacheOutreachTalentResearch(
  market: "FR" | "BENELUX",
  brandName: string,
  list: OutreachCachedTalentResearchItem[]
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadOutreachTalentResearchCache(market);
  saveOutreachTalentResearchCache(market, { ...prev, [key]: list });
}

export function cacheOutreachTalentResearchMarkets(
  markets: Array<"FR" | "BENELUX">,
  brandName: string,
  list: OutreachCachedTalentResearchItem[]
) {
  for (const m of markets) cacheOutreachTalentResearch(m, brandName, list);
}

export function cacheOutreachLeynaExchange(
  market: "FR" | "BENELUX",
  brandName: string,
  data: OutreachCachedLeynaExchange
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadOutreachLeynaExchangeCache(market);
  saveOutreachLeynaExchangeCache(market, { ...prev, [key]: data });
}

export function cacheOutreachLeynaExchangeMarkets(
  markets: Array<"FR" | "BENELUX">,
  brandName: string,
  data: OutreachCachedLeynaExchange
) {
  for (const m of markets) cacheOutreachLeynaExchange(m, brandName, data);
}

/** Sélection talents (ids) par marque — restaurée à la réouverture du composer. */
export function loadOutreachSelectedTalentsCache(market: "FR" | "BENELUX") {
  return loadJsonCache<string[]>(
    `po-selected-talents:${outreachClientsCacheScope(market)}`
  );
}

export function loadOutreachSelectedTalentsCacheMarkets(
  markets: Array<"FR" | "BENELUX">
) {
  return mergeOutreachCaches(
    markets.map((m) => loadOutreachSelectedTalentsCache(m))
  );
}

function saveOutreachSelectedTalentsCache(
  market: "FR" | "BENELUX",
  cache: Record<string, string[]>
) {
  saveJsonCache(
    `po-selected-talents:${outreachClientsCacheScope(market)}`,
    cache
  );
}

export function cacheOutreachSelectedTalents(
  market: "FR" | "BENELUX",
  brandName: string,
  talentIds: string[]
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadOutreachSelectedTalentsCache(market);
  const ids = Array.from(
    new Set(talentIds.map((id) => String(id || "").trim()).filter(Boolean))
  );
  saveOutreachSelectedTalentsCache(market, { ...prev, [key]: ids });
}

export function cacheOutreachSelectedTalentsMarkets(
  markets: Array<"FR" | "BENELUX">,
  brandName: string,
  talentIds: string[]
) {
  for (const m of markets) cacheOutreachSelectedTalents(m, brandName, talentIds);
}

export { brandResearchKey };
