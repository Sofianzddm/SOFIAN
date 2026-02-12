import Anthropic from "@anthropic-ai/sdk";

const anthropic = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Modèle à utiliser (Sonnet 4 lancé en octobre 2024)
const MODEL = "claude-sonnet-4-20250514" as const;

/**
 * 🔥 VERSION V5 : Catégorise un batch de marques en catégories
 * Retourne un objet { "MODE": [0, 1, 5], "BEAUTÉ": [2, 3], ... }
 * où les nombres correspondent aux indices dans le tableau brands
 */
export async function categorizeBrands(
  brands: Array<{ name: string; description: string | null }>
): Promise<Record<string, number[]>> {
  try {
    const brandList = brands
      .map((b, i) => `${i + 1}. ${b.name} - "${b.description || 'Pas de description'}"`)
      .join('\n');

    const prompt = `Catégorise ces marques dans les catégories suivantes :
MODE, BEAUTÉ, SPORT, FOOD, TECH, LIFESTYLE, SANTÉ, FINANCE, AUTRE

Marques :
${brandList}

Réponds UNIQUEMENT en JSON (pas de markdown) :
{"MODE": [1, 5], "BEAUTÉ": [3], "SPORT": [2, 4], ...}

Chaque numéro ne doit apparaître qu'une seule fois dans une seule catégorie.`;

    const message = await anthropic.messages.create({
      model: MODEL,
      max_tokens: 1000,
      temperature: 0,
      messages: [
        {
          role: "user",
          content: prompt,
        },
      ],
    });

    const text = message.content[0].type === "text" ? message.content[0].text.trim() : "{}";
    
    // Nettoyer le JSON au cas où Claude ajoute des balises markdown
    const cleaned = text.replace(/```json\n?/g, '').replace(/```\n?/g, '').trim();

    const categories = JSON.parse(cleaned) as Record<string, number[]>;
    
    console.log(`✅ ${brands.length} marques catégorisées :`, Object.keys(categories));
    return categories;
  } catch (error) {
    console.error("❌ Erreur catégorisation des marques:", error);
    // En cas d'erreur, mettre toutes les marques dans "AUTRE"
    return { AUTRE: brands.map((_, i) => i + 1) };
  }
}

