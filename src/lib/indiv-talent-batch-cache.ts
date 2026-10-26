/**
 * Cache sessionStorage du batch prospection individuelle
 * (marque / talent / Leyna) — partagé barre batch ↔ CastingComposer.
 */

export type IndivCachedBrandResearch = {
  recentCampaigns: string;
  newProducts: string;
  availabilityFrEu?: string;
  brandPositioning: string;
  influenceStrategy: string;
};

export type IndivCachedTalentResearchItem = {
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

export type IndivCachedLeynaExchange = {
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

export function indivCacheScope(talentId: string): string {
  return `indiv-talent:${talentId}`;
}

function readStorageRaw(storageKey: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    // localStorage = survit au reload ; migration depuis sessionStorage.
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

export function lookupIndivBrandCache<T>(
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

export function hasIndivBrandCacheEntry(
  cache: Record<string, unknown>,
  ...names: Array<string | null | undefined>
): boolean {
  return lookupIndivBrandCache(cache, ...names) != null;
}

export function loadIndivBrandResearchCache(talentId: string) {
  return loadJsonCache<IndivCachedBrandResearch>(
    `po-brand-research:${indivCacheScope(talentId)}`
  );
}

export function saveIndivBrandResearchCache(
  talentId: string,
  cache: Record<string, IndivCachedBrandResearch>
) {
  saveJsonCache(`po-brand-research:${indivCacheScope(talentId)}`, cache);
}

export function loadIndivTalentResearchCache(talentId: string) {
  return loadJsonCache<IndivCachedTalentResearchItem[]>(
    `po-talent-research:${indivCacheScope(talentId)}`
  );
}

export function saveIndivTalentResearchCache(
  talentId: string,
  cache: Record<string, IndivCachedTalentResearchItem[]>
) {
  saveJsonCache(`po-talent-research:${indivCacheScope(talentId)}`, cache);
}

export function loadIndivLeynaExchangeCache(talentId: string) {
  return loadJsonCache<IndivCachedLeynaExchange>(
    `po-leyna-exchange:v6:${indivCacheScope(talentId)}`
  );
}

export function saveIndivLeynaExchangeCache(
  talentId: string,
  cache: Record<string, IndivCachedLeynaExchange>
) {
  saveJsonCache(`po-leyna-exchange:v6:${indivCacheScope(talentId)}`, cache);
}

export function cacheIndivBrandResearch(
  talentId: string,
  brandName: string,
  data: IndivCachedBrandResearch
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadIndivBrandResearchCache(talentId);
  saveIndivBrandResearchCache(talentId, { ...prev, [key]: data });
}

export function cacheIndivTalentResearch(
  talentId: string,
  brandName: string,
  list: IndivCachedTalentResearchItem[]
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadIndivTalentResearchCache(talentId);
  saveIndivTalentResearchCache(talentId, { ...prev, [key]: list });
}

export function cacheIndivLeynaExchange(
  talentId: string,
  brandName: string,
  data: IndivCachedLeynaExchange
) {
  const key = brandResearchKey(brandName);
  if (!key) return;
  const prev = loadIndivLeynaExchangeCache(talentId);
  saveIndivLeynaExchangeCache(talentId, { ...prev, [key]: data });
}

export { brandResearchKey };
