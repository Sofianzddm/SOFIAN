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
  localizeTalentAttribute,
} from "@/lib/talent-attributes";

/**
 * Parser LOCAL (sans IA) pour la recherche en langage naturel du catalogue talents.
 *
 * Ce module est PUR (aucune dépendance réseau / OpenAI) : il peut donc être
 * importé côté client comme côté serveur. Il couvre la majorité des requêtes
 * courantes instantanément et gratuitement via un dictionnaire de synonymes.
 * L'IA (voir `talent-ai-search.ts`) ne sert que de renfort quand la requête
 * contient des mots significatifs que le dictionnaire ne sait pas mapper.
 */

export type AiSortOption =
  | "default"
  | "ig-followers"
  | "tt-followers"
  | "yt-followers"
  | "name";

/** Filtres structurés (miroir du state de la page partenaire). */
export interface TalentSearchFilters {
  niche: string;
  networks: string[];
  villes: string[];
  peau: string[];
  cheveux: string[];
  couleur: string[];
  tendancePeau: string[];
  tendanceCheveux: string[];
  animaux: string[];
  ages: string[];
  sports: string[];
  mobilite: string[];
  enceinte: boolean;
  sort: AiSortOption;
}

export interface LocalSearchResult {
  filters: TalentSearchFilters;
  summary: string;
  /** true si au moins un critère a été détecté. */
  hasCriteria: boolean;
  /** true si tous les mots significatifs de la requête ont été exploités. */
  covered: boolean;
  /** Mots significatifs non reconnus (déclenchent le renfort IA). */
  leftover: string[];
}

export const NICHE_IDS = [
  "all",
  "beauty",
  "fashion",
  "lifestyle",
  "family",
  "sport",
  "voyage",
  "food",
  "travel",
  "creative",
  "animaux",
] as const;

export const NETWORK_IDS = ["instagram", "tiktok", "youtube"] as const;

export const SORT_IDS: AiSortOption[] = [
  "default",
  "ig-followers",
  "tt-followers",
  "yt-followers",
  "name",
];

export function emptyFilters(): TalentSearchFilters {
  return {
    niche: "all",
    networks: [],
    villes: [],
    peau: [],
    cheveux: [],
    couleur: [],
    tendancePeau: [],
    tendanceCheveux: [],
    animaux: [],
    ages: [],
    sports: [],
    mobilite: [],
    enceinte: false,
    sort: "default",
  };
}

export function filtersHaveCriteria(f: TalentSearchFilters): boolean {
  return (
    (f.niche && f.niche !== "all") ||
    f.networks.length > 0 ||
    f.villes.length > 0 ||
    f.peau.length > 0 ||
    f.cheveux.length > 0 ||
    f.couleur.length > 0 ||
    f.tendancePeau.length > 0 ||
    f.tendanceCheveux.length > 0 ||
    f.animaux.length > 0 ||
    f.ages.length > 0 ||
    f.sports.length > 0 ||
    f.mobilite.length > 0 ||
    f.enceinte === true
  ) as boolean;
}

/** Retire les accents et met en minuscules pour un matching tolérant. */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Ne garde que les valeurs présentes dans la liste autorisée (insensible casse/accents). */
export function keepAllowed(values: unknown, allowed: readonly string[]): string[] {
  if (!Array.isArray(values)) return [];
  const map = new Map(allowed.map((a) => [normalize(a), a]));
  const out = new Set<string>();
  for (const v of values) {
    if (typeof v !== "string") continue;
    const canonical = map.get(normalize(v));
    if (canonical) out.add(canonical);
  }
  return [...out];
}

// Champs "tableau" de TalentSearchFilters (hors niche/enceinte/sort/networks/villes).
type ArrayAttrField =
  | "peau"
  | "cheveux"
  | "couleur"
  | "tendancePeau"
  | "tendanceCheveux"
  | "animaux"
  | "ages"
  | "sports"
  | "mobilite";

interface KeywordEntry {
  /** Mots-clés déclencheurs (déjà en minuscules, sans accent de préférence). */
  kw: string[];
  field: ArrayAttrField;
  value: string;
}

// Dictionnaire de synonymes → valeur canonique.
const KEYWORD_MAP: KeywordEntry[] = [
  // Couleur de cheveux
  { kw: ["blond", "blonde"], field: "couleur", value: "Blond" },
  { kw: ["brun", "brune", "chatain fonce"], field: "couleur", value: "Brun" },
  { kw: ["chatain"], field: "couleur", value: "Châtain" },
  { kw: ["roux", "rousse", "rouquin", "rouquine", "redhead"], field: "couleur", value: "Roux" },
  { kw: ["cheveux noir", "brunette"], field: "couleur", value: "Noir" },
  { kw: ["colore", "coloration", "cheveux colore"], field: "couleur", value: "Coloré" },
  // Type de cheveux
  { kw: ["cheveux raide", "raide", "lisse", "straight"], field: "cheveux", value: "Raides" },
  { kw: ["ondule", "wavy"], field: "cheveux", value: "Ondulés" },
  { kw: ["boucle", "frise", "curly"], field: "cheveux", value: "Bouclés" },
  { kw: ["crepu", "afro", "coily"], field: "cheveux", value: "Crépus" },
  // Type de peau
  { kw: ["peau normale"], field: "peau", value: "Normale" },
  { kw: ["peau seche", "peau sec"], field: "peau", value: "Sèche" },
  { kw: ["peau mixte"], field: "peau", value: "Mixte" },
  { kw: ["peau grasse", "peau gras"], field: "peau", value: "Grasse" },
  // Tendance de peau
  { kw: ["acne", "acneique", "bouton", "boutons"], field: "tendancePeau", value: "Acnéique" },
  { kw: ["point noir", "points noirs"], field: "tendancePeau", value: "Points noirs" },
  { kw: ["rougeur", "couperose", "rosacee"], field: "tendancePeau", value: "Rougeurs / couperose" },
  { kw: ["peau deshydratee", "peau deshydrate"], field: "tendancePeau", value: "Déshydratée" },
  { kw: ["teint terne", "peau terne"], field: "tendancePeau", value: "Terne" },
  { kw: ["tache", "hyperpigmentation", "pigmentation"], field: "tendancePeau", value: "Taches / hyperpigmentation" },
  { kw: ["pores dilate", "pore dilate", "pores"], field: "tendancePeau", value: "Pores dilatés" },
  { kw: ["peau mature"], field: "tendancePeau", value: "Mature" },
  { kw: ["eczema", "atopique"], field: "tendancePeau", value: "Atopique / eczéma" },
  { kw: ["sebum", "exces de sebum"], field: "tendancePeau", value: "Excès de sébum" },
  // Tendance cheveux
  { kw: ["cheveux gras"], field: "tendanceCheveux", value: "Gras" },
  { kw: ["cheveux sec", "cheveux secs"], field: "tendanceCheveux", value: "Secs" },
  { kw: ["pellicule", "pellicules"], field: "tendanceCheveux", value: "Pellicules" },
  { kw: ["meche", "cheveux colore meche"], field: "tendanceCheveux", value: "Colorés / méchés" },
  { kw: ["cheveux fin", "cheveux fins"], field: "tendanceCheveux", value: "Fins" },
  { kw: ["cheveux epais"], field: "tendanceCheveux", value: "Épais" },
  { kw: ["frisotti", "frisottis"], field: "tendanceCheveux", value: "Frisottis" },
  { kw: ["chute de cheveux", "cheveux clairseme"], field: "tendanceCheveux", value: "Chute / clairsemés" },
  // Animaux
  { kw: ["chien", "chiens", "dog"], field: "animaux", value: "Chien" },
  { kw: ["chat", "chats", "cat"], field: "animaux", value: "Chat" },
  { kw: ["cheval", "chevaux", "horse", "poney"], field: "animaux", value: "Cheval" },
  { kw: ["rongeur", "hamster", "lapin"], field: "animaux", value: "Rongeur" },
  { kw: ["oiseau", "perroquet"], field: "animaux", value: "Oiseau" },
  { kw: ["reptile", "serpent", "lezard"], field: "animaux", value: "Reptile" },
  { kw: ["poisson", "aquarium"], field: "animaux", value: "Poisson" },
  // Âges enfants
  { kw: ["bebe", "nourrisson", "baby", "nouveau ne"], field: "ages", value: "Bébé (0-2 ans)" },
  { kw: ["jeune enfant", "enfant en bas age"], field: "ages", value: "Enfant (3-11 ans)" },
  { kw: ["ado", "adolescent", "teen", "teenager"], field: "ages", value: "Ado (12-17 ans)" },
  // Sports
  { kw: ["running", "course a pied", "jogging"], field: "sports", value: "Running" },
  { kw: ["musculation", "muscu", "fitness", "gym", "salle de sport"], field: "sports", value: "Musculation/Fitness" },
  { kw: ["yoga"], field: "sports", value: "Yoga" },
  { kw: ["pilates"], field: "sports", value: "Pilates" },
  { kw: ["danse", "dance", "danseuse", "danseur"], field: "sports", value: "Danse" },
  { kw: ["football", "foot", "soccer"], field: "sports", value: "Football" },
  { kw: ["tennis", "padel"], field: "sports", value: "Tennis/Padel" },
  { kw: ["natation", "nageur", "nageuse", "swim"], field: "sports", value: "Natation" },
  { kw: ["cyclisme", "velo", "cycling"], field: "sports", value: "Cyclisme" },
  { kw: ["randonnee", "rando", "hiking", "trek"], field: "sports", value: "Randonnée" },
  { kw: ["ski", "snowboard", "sport d hiver"], field: "sports", value: "Ski/Sports d'hiver" },
  { kw: ["boxe", "mma", "sport de combat", "arts martiaux", "judo", "karate"], field: "sports", value: "Sports de combat" },
  { kw: ["crossfit"], field: "sports", value: "Crossfit" },
  { kw: ["equitation"], field: "sports", value: "Équitation" },
  { kw: ["surf"], field: "sports", value: "Surf" },
  { kw: ["golf"], field: "sports", value: "Golf" },
  { kw: ["escalade", "climbing", "grimpe"], field: "sports", value: "Escalade" },
  // Mobilité
  { kw: ["permis", "permis b"], field: "mobilite", value: "Permis B" },
  { kw: ["voiture", "vehicule"], field: "mobilite", value: "Véhicule personnel" },
  { kw: ["passeport"], field: "mobilite", value: "Passeport valide" },
  { kw: ["voyage international", "dispo international", "international"], field: "mobilite", value: "Dispo voyage (International)" },
  { kw: ["voyage france", "dispo france"], field: "mobilite", value: "Dispo voyage (France)" },
];

const NICHE_KEYWORDS: Array<{ kw: string[]; id: string }> = [
  { kw: ["beauty", "beaute", "maquillage", "makeup", "skincare", "cosmetique", "soin"], id: "beauty" },
  { kw: ["fashion", "mode", "vetement", "style vestimentaire", "outfit"], id: "fashion" },
  { kw: ["lifestyle", "quotidien"], id: "lifestyle" },
  { kw: ["family", "famille", "maman", "papa", "parent", "kids", "enfant"], id: "family" },
  { kw: ["sport", "sportif", "sportive"], id: "sport" },
  { kw: ["food", "cuisine", "recette", "recettes", "gastronomie"], id: "food" },
  { kw: ["voyage"], id: "voyage" },
  { kw: ["travel", "globe trotter"], id: "travel" },
  { kw: ["creative", "creatif", "art", "artiste", "dessin"], id: "creative" },
  { kw: ["animaux", "pets", "animal", "animalier"], id: "animaux" },
];

const NETWORK_KEYWORDS: Array<{ kw: string[]; id: string }> = [
  { kw: ["instagram", "insta", "ig"], id: "instagram" },
  { kw: ["tiktok", "tik tok", "tt"], id: "tiktok" },
  { kw: ["youtube", "yt", "youtubeur", "youtubeuse"], id: "youtube" },
];

const PREGNANT_KEYWORDS = ["enceinte", "grossesse", "pregnant", "future maman"];

// Mots vides / filler à ignorer dans le calcul de "couverture".
const STOPWORDS = new Set(
  [
    // FR
    "je", "tu", "il", "elle", "on", "nous", "vous", "veux", "voudrais", "cherche",
    "recherche", "trouve", "trouver", "chercher", "besoin", "un", "une", "des",
    "du", "de", "la", "le", "les", "avec", "qui", "que", "quel", "quelle", "fait",
    "faire", "pour", "dans", "sur", "plutot", "genre", "type", "createur",
    "creatrice", "createurs", "creatrices", "influenceur", "influenceuse",
    "influenceurs", "influenceuses", "talent", "talents", "personne", "quelqu",
    "quelque", "ideal", "ideale", "parfait", "parfaite", "bon", "bonne", "comme",
    "style", "plus", "gros", "grosse", "grosses", "top", "meilleur", "meilleure",
    "populaire", "compte", "comptes", "abonnes", "abonne", "suivi", "communaute",
    "autour", "environ", "aussi", "tres", "bien", "cheveux", "peau", "des",
    "sport", "sportif", "sportive", "petit", "petite", "grand", "grande",
    "et", "ou", "au", "aux", "ans", "sa", "son", "ses", "mon", "ma",
    // EN
    "i", "want", "would", "like", "looking", "for", "need", "find", "a", "an",
    "the", "with", "who", "that", "does", "do", "make", "in", "and", "or",
    "creator", "creators", "influencer", "influencers", "someone", "person",
    "perfect", "good", "some", "more", "big", "biggest", "best", "popular",
    "account", "accounts", "followers", "subscribers", "community", "around",
    "about", "very", "hair", "skin",
  ].map((w) => w)
);

/** Indique si un mot-clé (normalisé) apparaît dans la requête normalisée (avec pluriel/genre tolérés). */
function keywordMatches(normQuery: string, kw: string): boolean {
  const nkw = normalize(kw);
  if (!nkw) return false;
  if (nkw.includes(" ")) {
    // Expression multi-mots : simple test de sous-chaîne.
    return normQuery.includes(nkw);
  }
  // Mot simple : autoriser suffixes de pluriel/genre (s, e, es, x).
  const re = new RegExp(`\\b${nkw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(s|e|es|x)?\\b`);
  return re.test(normQuery);
}

/** Marque comme "consommés" les tokens de la requête couverts par un mot-clé. */
function markConsumed(consumed: Set<string>, kw: string) {
  for (const w of normalize(kw).split(" ")) {
    if (w.length >= 3) consumed.add(w);
  }
}

/**
 * Parse une requête en langage naturel via le dictionnaire local (sans IA).
 */
export function parseTalentQueryLocal(
  query: string,
  availableCities: string[],
  lang: "fr" | "en" = "fr"
): LocalSearchResult {
  const filters = emptyFilters();
  const normQuery = normalize(query);
  const consumed = new Set<string>();

  // Attributs (couleur, cheveux, peau, sports, animaux, etc.)
  for (const entry of KEYWORD_MAP) {
    for (const kw of entry.kw) {
      if (keywordMatches(normQuery, kw)) {
        const arr = filters[entry.field];
        if (!arr.includes(entry.value)) arr.push(entry.value);
        markConsumed(consumed, kw);
        break;
      }
    }
  }

  // Niche (une seule — premier match).
  for (const n of NICHE_KEYWORDS) {
    if (filters.niche !== "all") break;
    for (const kw of n.kw) {
      if (keywordMatches(normQuery, kw)) {
        filters.niche = n.id;
        markConsumed(consumed, kw);
        break;
      }
    }
  }

  // Réseaux.
  for (const n of NETWORK_KEYWORDS) {
    for (const kw of n.kw) {
      if (keywordMatches(normQuery, kw)) {
        if (!filters.networks.includes(n.id)) filters.networks.push(n.id);
        markConsumed(consumed, kw);
        break;
      }
    }
  }

  // Villes (match sur la liste réelle du catalogue).
  for (const city of availableCities) {
    const nCity = normalize(city);
    if (nCity && normQuery.includes(nCity)) {
      if (!filters.villes.includes(city)) filters.villes.push(city);
      markConsumed(consumed, city);
    }
  }

  // Enceinte.
  for (const kw of PREGNANT_KEYWORDS) {
    if (keywordMatches(normQuery, kw)) {
      filters.enceinte = true;
      markConsumed(consumed, kw);
      break;
    }
  }

  // Tri (uniquement si un réseau + une intention de "classement" sont présents).
  const wantsRanking = /\b(plus|top|max|biggest|most|gros|grosse|populaire|meilleur)\b/.test(
    normQuery
  );
  if (wantsRanking && filters.networks.length > 0) {
    const net = filters.networks[0];
    filters.sort =
      net === "instagram"
        ? "ig-followers"
        : net === "tiktok"
          ? "tt-followers"
          : "yt-followers";
  }

  const hasCriteria = filtersHaveCriteria(filters);

  // Couverture : mots significatifs restants non exploités.
  const leftover = normQuery
    .split(" ")
    .filter((tok) => tok.length >= 3 && !STOPWORDS.has(tok))
    .filter((tok) => {
      for (const c of consumed) {
        if (tok.startsWith(c) || c.startsWith(tok)) return false;
      }
      return true;
    });

  const covered = hasCriteria && leftover.length === 0;

  return {
    filters,
    summary: buildSummary(filters, lang),
    hasCriteria,
    covered,
    leftover,
  };
}

/** Construit un résumé lisible des filtres retenus. */
export function buildSummary(f: TalentSearchFilters, lang: "fr" | "en"): string {
  const parts: string[] = [];
  const loc = (v: string) => localizeTalentAttribute(v, lang) || v;

  if (f.niche && f.niche !== "all") parts.push(capitalize(f.niche));
  f.villes.forEach((v) => parts.push(v));
  f.couleur.forEach((v) => parts.push(loc(v)));
  f.cheveux.forEach((v) => parts.push(loc(v)));
  f.peau.forEach((v) => parts.push(loc(v)));
  f.tendancePeau.forEach((v) => parts.push(loc(v)));
  f.tendanceCheveux.forEach((v) => parts.push(loc(v)));
  f.sports.forEach((v) => parts.push(loc(v)));
  f.animaux.forEach((v) => parts.push(loc(v)));
  f.ages.forEach((v) => parts.push(loc(v)));
  f.mobilite.forEach((v) => parts.push(loc(v)));
  if (f.enceinte) parts.push(lang === "en" ? "Pregnant" : "Enceinte");
  f.networks.forEach((v) => parts.push(capitalize(v)));

  if (parts.length === 0) {
    return lang === "en" ? "All creators" : "Tous les créateurs";
  }
  return parts.join(", ");
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Valide/normalise un objet JSON (ex. sortie IA) contre les valeurs canoniques. */
export function sanitizeFilters(
  raw: Record<string, unknown>,
  availableCities: string[]
): TalentSearchFilters {
  const filters = emptyFilters();

  const niche = typeof raw.niche === "string" ? raw.niche.toLowerCase() : "all";
  filters.niche = (NICHE_IDS as readonly string[]).includes(niche) ? niche : "all";

  filters.networks = keepAllowed(raw.networks, NETWORK_IDS);
  filters.villes = keepAllowed(raw.villes, availableCities);
  filters.peau = keepAllowed(raw.peau, TYPE_PEAU_OPTIONS);
  filters.cheveux = keepAllowed(raw.cheveux, TYPE_CHEVEUX_OPTIONS);
  filters.couleur = keepAllowed(raw.couleur, COULEUR_CHEVEUX_OPTIONS);
  filters.tendancePeau = keepAllowed(raw.tendancePeau, TENDANCE_PEAU_OPTIONS);
  filters.tendanceCheveux = keepAllowed(raw.tendanceCheveux, TENDANCE_CHEVEUX_OPTIONS);
  filters.animaux = keepAllowed(raw.animaux, ANIMAUX_OPTIONS);
  filters.ages = keepAllowed(raw.ages, AGES_ENFANTS_OPTIONS);
  filters.sports = keepAllowed(raw.sports, SPORTS_OPTIONS);
  filters.mobilite = keepAllowed(raw.mobilite, MOBILITE_OPTIONS);
  filters.enceinte = raw.enceinte === true;

  const sort = typeof raw.sort === "string" ? (raw.sort as AiSortOption) : "default";
  filters.sort = SORT_IDS.includes(sort) ? sort : "default";

  return filters;
}
