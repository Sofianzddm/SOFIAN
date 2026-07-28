import OpenAI from "openai";
import {
  TYPE_PEAU_OPTIONS,
  TYPE_CHEVEUX_OPTIONS,
  COULEUR_CHEVEUX_OPTIONS,
  TENDANCE_PEAU_OPTIONS,
  TENDANCE_CHEVEUX_OPTIONS,
  ANIMAUX_OPTIONS,
  AGES_ENFANTS_OPTIONS,
  SPORTS_OPTIONS,
  MOBILITE_OPTIONS,
} from "@/lib/talent-attributes";
import {
  parseTalentQueryLocal,
  sanitizeFilters,
  buildSummary,
  filtersHaveCriteria,
  type TalentSearchFilters,
} from "@/lib/talent-search-local";

export type { TalentSearchFilters, AiSortOption } from "@/lib/talent-search-local";

/**
 * Recherche IA en langage naturel sur le catalogue talents.
 *
 * Stratégie HYBRIDE :
 *  1. `parseTalentQueryLocal` (dictionnaire, instantané, gratuit) couvre la
 *     majorité des requêtes.
 *  2. L'IA (`gpt-4o-mini`) n'est appelée qu'en renfort quand la requête contient
 *     des mots significatifs que le dictionnaire ne sait pas mapper, ou quand le
 *     dictionnaire ne trouve rien.
 *  3. Si l'IA échoue / clé absente, on retombe sur le résultat local.
 */

export interface TalentSearchResult {
  filters: TalentSearchFilters;
  /** Résumé lisible de l'interprétation, dans la langue de la requête. */
  summary: string;
  /** Origine du résultat (utile pour debug / analytics). */
  source: "local" | "ai" | "ai-fallback-local";
}

function buildPrompt(
  query: string,
  availableCities: string[],
  lang: "fr" | "en"
): string {
  const list = (arr: readonly string[]) => arr.map((v) => `"${v}"`).join(", ");
  const citiesList =
    availableCities.length > 0 ? list(availableCities) : "(aucune ville connue)";

  return `Tu es le moteur de recherche d'un catalogue de créateurs de contenu (influenceurs) pour l'agence Glow Up.

Ta tâche : convertir la requête en langage naturel d'un utilisateur en un objet JSON de filtres.
Tu DOIS utiliser UNIQUEMENT les valeurs canoniques listées ci-dessous, telles quelles (même casse, même orthographe, accents inclus). Ne traduis pas les valeurs. Si un critère n'est pas mentionné, laisse le tableau vide (ou "all" / false).

Valeurs autorisées par champ :
- niche (une seule string) : "all", "beauty", "fashion", "lifestyle", "family", "sport", "voyage", "food", "travel", "creative", "animaux"
- networks (tableau) : "instagram", "tiktok", "youtube"
- villes (tableau — utilise EXACTEMENT une valeur de cette liste) : ${citiesList}
- peau — type de peau (tableau) : ${list(TYPE_PEAU_OPTIONS)}
- cheveux — type de cheveux (tableau) : ${list(TYPE_CHEVEUX_OPTIONS)}
- couleur — couleur de cheveux (tableau) : ${list(COULEUR_CHEVEUX_OPTIONS)}
- tendancePeau (tableau) : ${list(TENDANCE_PEAU_OPTIONS)}
- tendanceCheveux (tableau) : ${list(TENDANCE_CHEVEUX_OPTIONS)}
- animaux (tableau) : ${list(ANIMAUX_OPTIONS)}
- ages — âges des enfants (tableau) : ${list(AGES_ENFANTS_OPTIONS)}
- sports (tableau) : ${list(SPORTS_OPTIONS)}
- mobilite (tableau) : ${list(MOBILITE_OPTIONS)}
- enceinte (booléen) : true si l'utilisateur cherche une créatrice enceinte, sinon false
- sort : "default", "ig-followers" (plus d'abonnés Instagram), "tt-followers" (TikTok), "yt-followers" (YouTube), "name" (A-Z). Utilise un tri seulement si l'utilisateur l'évoque explicitement (ex. "les plus gros comptes Insta").

Règles d'interprétation :
- "blonde/blond" -> couleur ["Blond"]. "brune" -> ["Brun"]. "rousse" -> ["Roux"].
- "cheveux bouclés/frisés" -> cheveux ["Bouclés"] ou ["Crépus"] selon le contexte.
- "peau sensible/acnéique" -> tendancePeau.
- Une ville non présente dans la liste doit être ignorée (tableau villes vide).
- "un chien"/"des chiens" -> animaux ["Chien"], etc.
- Déduis la niche du contexte (ex. "maquillage/skincare" -> "beauty", "mode" -> "fashion", "maman/famille" -> "family", "recettes" -> "food").
- Fournis aussi un champ "summary" : une courte phrase (${lang === "en" ? "in English" : "en français"}, max 12 mots) résumant les critères retenus, sans ponctuation finale.

Réponds STRICTEMENT avec un objet JSON valide contenant les clés : niche, networks, villes, peau, cheveux, couleur, tendancePeau, tendanceCheveux, animaux, ages, sports, mobilite, enceinte, sort, summary.

Requête utilisateur : "${query.replace(/"/g, "'")}"`;
}

/**
 * Appel IA pur (gpt-4o-mini, JSON mode) → filtres validés.
 * @throws si l'appel OpenAI échoue.
 */
export async function parseTalentQueryAi(
  query: string,
  availableCities: string[],
  apiKey: string,
  lang: "fr" | "en" = "fr"
): Promise<TalentSearchResult> {
  const openai = new OpenAI({ apiKey });

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: buildPrompt(query, availableCities, lang) }],
    temperature: 0.1,
    max_tokens: 400,
    response_format: { type: "json_object" },
  });

  const content = completion.choices?.[0]?.message?.content?.trim() || "{}";

  let raw: Record<string, unknown>;
  try {
    raw = JSON.parse(content);
  } catch {
    raw = {};
  }

  const filters = sanitizeFilters(raw, availableCities);
  const summary =
    typeof raw.summary === "string" && raw.summary.trim()
      ? raw.summary.trim()
      : buildSummary(filters, lang);

  return { filters, summary, source: "ai" };
}

/**
 * Recherche hybride : dictionnaire local d'abord, IA en renfort si nécessaire.
 * `apiKey` optionnelle : sans clé, seul le local est utilisé.
 */
export async function parseTalentQueryHybrid(
  query: string,
  availableCities: string[],
  apiKey: string | undefined,
  lang: "fr" | "en" = "fr"
): Promise<TalentSearchResult> {
  const local = parseTalentQueryLocal(query, availableCities, lang);

  // Le dictionnaire suffit (tous les mots significatifs exploités) → pas d'IA.
  if (local.covered || !apiKey) {
    return { filters: local.filters, summary: local.summary, source: "local" };
  }

  // Sinon, on tente l'IA, avec repli sur le local en cas d'échec.
  try {
    const ai = await parseTalentQueryAi(query, availableCities, apiKey, lang);
    // Si l'IA ne trouve rien mais que le local avait des critères, on garde le local.
    if (!filtersHaveCriteria(ai.filters) && local.hasCriteria) {
      return { filters: local.filters, summary: local.summary, source: "local" };
    }
    return ai;
  } catch (error) {
    console.error("❌ Recherche IA échouée, repli sur le dictionnaire local:", error);
    return {
      filters: local.filters,
      summary: local.summary,
      source: "ai-fallback-local",
    };
  }
}
