import { NextRequest, NextResponse } from "next/server";
import {
  parseTalentQueryHybrid,
  type TalentSearchResult,
} from "@/lib/talent-ai-search";
import { normalize } from "@/lib/talent-search-local";
import { checkRateLimit, getClientIp } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

// Cache mémoire des interprétations (évite de retraiter une requête identique).
interface CacheEntry {
  result: TalentSearchResult;
  expiresAt: number;
}
const CACHE_TTL_MS = 60 * 60 * 1000; // 1h
const CACHE_MAX = 500;
const cache = new Map<string, CacheEntry>();

function citiesHash(cities: string[]): string {
  // Empreinte courte et stable de la liste des villes (l'ordre n'importe pas).
  const joined = [...cities].map((c) => c.toLowerCase()).sort().join("|");
  let h = 0;
  for (let i = 0; i < joined.length; i++) {
    h = (h * 31 + joined.charCodeAt(i)) | 0;
  }
  return `${cities.length}:${h}`;
}

function cacheGet(key: string): TalentSearchResult | null {
  const entry = cache.get(key);
  if (!entry) return null;
  if (entry.expiresAt < Date.now()) {
    cache.delete(key);
    return null;
  }
  return entry.result;
}

function cacheSet(key: string, result: TalentSearchResult) {
  if (cache.size >= CACHE_MAX) {
    const oldest = cache.keys().next().value;
    if (oldest) cache.delete(oldest);
  }
  cache.set(key, { result, expiresAt: Date.now() + CACHE_TTL_MS });
}

// Réponse publique : on n'expose QUE filters + summary (jamais l'origine du traitement).
function publicPayload(result: TalentSearchResult) {
  return { filters: result.filters, summary: result.summary };
}

// Route publique: POST /api/partners/[id]/search
// (le paramètre "id" est en réalité le slug du partenaire, comme les autres routes)
// Body: { query: string, availableCities?: string[], lang?: "fr" | "en" }
export async function POST(
  request: NextRequest,
  _ctx: { params: Promise<{ id: string }> }
) {
  try {
    const body = await request.json().catch(() => ({}));
    const query = typeof body.query === "string" ? body.query.trim() : "";
    const lang = body.lang === "en" ? "en" : "fr";
    const availableCities: string[] = Array.isArray(body.availableCities)
      ? body.availableCities.filter((c: unknown): c is string => typeof c === "string")
      : [];

    if (!query) {
      return NextResponse.json({ error: "Requête vide." }, { status: 400 });
    }
    if (query.length > 400) {
      return NextResponse.json({ error: "Requête trop longue." }, { status: 400 });
    }

    // Cache (avant rate-limit : une requête déjà connue ne consomme rien).
    const cacheKey = `${lang}::${normalize(query)}::${citiesHash(availableCities)}`;
    const cached = cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(publicPayload(cached));
    }

    // Rate-limit par IP (protège l'endpoint public contre l'abus).
    const ip = getClientIp(request);
    const limit = checkRateLimit({
      key: `talent-search:${ip}`,
      max: 20,
      windowMs: 60 * 1000,
    });
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Trop de recherches. Merci de patienter quelques secondes.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    const result = await parseTalentQueryHybrid(query, availableCities, apiKey, lang);

    cacheSet(cacheKey, result);
    return NextResponse.json(publicPayload(result));
  } catch (error) {
    console.error("Erreur POST /api/partners/[id]/search:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche." },
      { status: 500 }
    );
  }
}
