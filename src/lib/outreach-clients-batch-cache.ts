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
  tone?: "tu" | "vous" | null;
  bannerLabel?: string | null;
  alerts?: string[];
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

export function loadOutreachBrandResearchCache(market: "FR" | "BENELUX") {
  return loadJsonCache<OutreachCachedBrandResearch>(
    `po-brand-research:${outreachClientsCacheScope(market)}`
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

export { brandResearchKey };
