import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Modèle à utiliser (Sonnet 4 lancé en octobre 2024)
const MODEL = "claude-sonnet-4-20250514" as const;
const ALLOWED_CATEGORIES = [
  "MODE",
  "BEAUTÉ",
  "SPORT",
  "FOOD",
  "TECH",
  "LIFESTYLE",
  "SANTÉ",
  "FINANCE",
  "AUTRE",
] as const;
const MAX_BRANDS_PER_BATCH = 80;
const MAX_BATCH_RETRIES = 2;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

function sanitizeCategories(input: Record<string, unknown>): Record<string, number[]> {
  const out: Record<string, number[]> = {};
  for (const key of ALLOWED_CATEGORIES) {
    const value = input[key];
    if (Array.isArray(value)) {
      const clean = value
        .map((v) => Number(v))
        .filter((n) => Number.isInteger(n) && n > 0);
      if (clean.length > 0) out[key] = clean;
    }
  }
  return out;
}

function parseClaudeJson(raw: string): Record<string, number[]> {
  const cleaned = raw.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  try {
    return sanitizeCategories(JSON.parse(cleaned) as Record<string, unknown>);
  } catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      const sliced = cleaned.slice(start, end + 1);
      return sanitizeCategories(JSON.parse(sliced) as Record<string, unknown>);
    }
    throw new Error("Réponse JSON invalide de Claude");
  }
}

async function categorizeBrandsBatch(
  brands: Array<{ name: string; description: string | null }>
): Promise<Record<string, number[]>> {
  const brandList = brands
    .map((b, i) => `${i + 1}. ${b.name} - "${b.description || "Pas de description"}"`)
    .join("\n");

  const prompt = `Catégorise ces marques dans les catégories suivantes :
MODE, BEAUTÉ, SPORT, FOOD, TECH, LIFESTYLE, SANTÉ, FINANCE, AUTRE

Marques :
${brandList}

Réponds UNIQUEMENT en JSON (pas de markdown) :
{"MODE": [1, 5], "BEAUTÉ": [3], "SPORT": [2, 4], ...}

Chaque numéro ne doit apparaître qu'une seule fois dans une seule catégorie.`;

  let lastError: unknown = null;
  for (let attempt = 0; attempt <= MAX_BATCH_RETRIES; attempt++) {
    try {
      const message = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 2000,
        temperature: 0,
        messages: [
          {
            role: "user",
            content: prompt,
          },
        ],
      });

      const text = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
      return parseClaudeJson(text);
    } catch (error) {
      lastError = error;
      if (attempt < MAX_BATCH_RETRIES) {
        await sleep(300 * (attempt + 1));
      }
    }
  }
  throw lastError ?? new Error("Échec catégorisation batch");
}

/**
 * 🔥 VERSION V5 : Catégorise un batch de marques en catégories
 * Retourne un objet { "MODE": [0, 1, 5], "BEAUTÉ": [2, 3], ... }
 * où les nombres correspondent aux indices dans le tableau brands
 */
export async function categorizeBrands(
  brands: Array<{ name: string; description: string | null }>
): Promise<Record<string, number[]>> {
  try {
    if (brands.length === 0) return {};

    const merged: Record<string, number[]> = {};
    for (let start = 0; start < brands.length; start += MAX_BRANDS_PER_BATCH) {
      const batch = brands.slice(start, start + MAX_BRANDS_PER_BATCH);
      const batchCategories = await categorizeBrandsBatch(batch);

      // Remapper les indices locaux (1..batchSize) en indices globaux (1..N)
      for (const [category, indexes] of Object.entries(batchCategories)) {
        if (!merged[category]) merged[category] = [];
        for (const idx of indexes) {
          const globalIdx = start + idx;
          if (globalIdx >= 1 && globalIdx <= brands.length) {
            merged[category].push(globalIdx);
          }
        }
      }
    }

    // Dédupliquer et s'assurer que chaque marque apparaît au moins une fois
    const assigned = new Set<number>();
    for (const category of Object.keys(merged)) {
      merged[category] = Array.from(new Set(merged[category])).filter((i) => {
        if (assigned.has(i)) return false;
        assigned.add(i);
        return true;
      });
    }
    for (let i = 1; i <= brands.length; i++) {
      if (!assigned.has(i)) {
        if (!merged.AUTRE) merged.AUTRE = [];
        merged.AUTRE.push(i);
      }
    }

    console.log(`✅ ${brands.length} marques catégorisées en batchs :`, Object.keys(merged));
    return merged;
  } catch (error) {
    console.error("❌ Erreur catégorisation des marques:", error);
    // En cas d'erreur, mettre toutes les marques dans "AUTRE"
    return { AUTRE: brands.map((_, i) => i + 1) };
  }
}

