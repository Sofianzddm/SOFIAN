/**
 * Attributs physiques d'un talent (peau / cheveux).
 *
 * Fréquemment demandés par les marques beauté / cosmétique / haircare pour
 * matcher un talent à un produit. Les valeurs canoniques stockées en base sont
 * en français ; on fournit des libellés EN pour l'affichage sur les books
 * envoyés à l'international (kit media, PDF de sélection).
 *
 * Source unique réutilisée par :
 *  - le formulaire de fiche talent (manager)
 *  - le portail talent (auto-édition)
 *  - les books / kit media (affichage marque)
 */

export const TYPE_PEAU_OPTIONS = [
  "Normale",
  "Sèche",
  "Mixte",
  "Grasse",
  "Sensible",
] as const;

export const TYPE_CHEVEUX_OPTIONS = [
  "Raides",
  "Ondulés",
  "Bouclés",
  "Crépus",
] as const;

export const COULEUR_CHEVEUX_OPTIONS = [
  "Blond",
  "Brun",
  "Châtain",
  "Roux",
  "Noir",
  "Coloré",
] as const;

// Tendances / préoccupations (sélection MULTIPLE — un talent peut cumuler)
export const TENDANCE_PEAU_OPTIONS = [
  "Acnéique",
  "Points noirs",
  "Sensible",
  "Rougeurs / couperose",
  "Déshydratée",
  "Terne",
  "Taches / hyperpigmentation",
  "Pores dilatés",
  "Mature",
  "Atopique / eczéma",
  "Excès de sébum",
] as const;

export const TENDANCE_CHEVEUX_OPTIONS = [
  "Gras",
  "Secs",
  "Mixtes",
  "Déshydratés",
  "Cassants",
  "Pointes fourchues",
  "Pellicules",
  "Cuir chevelu sensible",
  "Colorés / méchés",
  "Décolorés",
  "Fins",
  "Épais",
  "Frisottis",
  "Chute / clairsemés",
] as const;

// ─── Profil / lifestyle (demandé par les marques pour le matching & gifting) ───

// Animaux (multi)
export const ANIMAUX_OPTIONS = [
  "Chien",
  "Chat",
  "Cheval",
  "Rongeur",
  "Oiseau",
  "Reptile",
  "Poisson",
  "Autre",
] as const;

// Tranches d'âge des enfants (multi)
export const AGES_ENFANTS_OPTIONS = [
  "Bébé (0-2 ans)",
  "Enfant (3-11 ans)",
  "Ado (12-17 ans)",
  "Adulte (18+)",
] as const;

// Sports & activités (multi)
export const SPORTS_OPTIONS = [
  "Running",
  "Musculation/Fitness",
  "Yoga",
  "Pilates",
  "Danse",
  "Football",
  "Tennis/Padel",
  "Natation",
  "Cyclisme",
  "Randonnée",
  "Ski/Sports d'hiver",
  "Sports de combat",
  "Crossfit",
  "Équitation",
  "Surf",
  "Golf",
  "Escalade",
] as const;

// Mobilité (multi)
export const MOBILITE_OPTIONS = [
  "Permis B",
  "Véhicule personnel",
  "Passeport valide",
  "Dispo voyage (France)",
  "Dispo voyage (International)",
] as const;

export type TypePeau = (typeof TYPE_PEAU_OPTIONS)[number];
export type TypeCheveux = (typeof TYPE_CHEVEUX_OPTIONS)[number];
export type CouleurCheveux = (typeof COULEUR_CHEVEUX_OPTIONS)[number];
export type TendancePeau = (typeof TENDANCE_PEAU_OPTIONS)[number];
export type TendanceCheveux = (typeof TENDANCE_CHEVEUX_OPTIONS)[number];

/** Libellés anglais pour l'affichage sur les books internationaux. */
export const TALENT_ATTRIBUTE_LABELS_EN: Record<string, string> = {
  // Type de peau
  Normale: "Normal",
  Sèche: "Dry",
  Mixte: "Combination",
  Grasse: "Oily",
  Sensible: "Sensitive",
  // Type de cheveux
  Raides: "Straight",
  Ondulés: "Wavy",
  Bouclés: "Curly",
  Crépus: "Coily",
  // Couleur de cheveux
  Blond: "Blonde",
  Brun: "Dark brown",
  Châtain: "Brown",
  Roux: "Red",
  Noir: "Black",
  Coloré: "Colored",
  // Tendance de peau
  Acnéique: "Acne-prone",
  "Points noirs": "Blackhead-prone",
  "Rougeurs / couperose": "Redness / rosacea",
  Déshydratée: "Dehydrated",
  Terne: "Dull",
  "Taches / hyperpigmentation": "Dark spots / hyperpigmentation",
  "Pores dilatés": "Enlarged pores",
  Mature: "Mature",
  "Atopique / eczéma": "Atopic / eczema",
  "Excès de sébum": "Excess sebum",
  // Tendance des cheveux
  Gras: "Oily",
  Secs: "Dry",
  Mixtes: "Combination",
  Déshydratés: "Dehydrated",
  Cassants: "Brittle",
  "Pointes fourchues": "Split ends",
  Pellicules: "Dandruff",
  "Cuir chevelu sensible": "Sensitive scalp",
  "Colorés / méchés": "Color-treated",
  Décolorés: "Bleached",
  Fins: "Fine",
  Épais: "Thick",
  Frisottis: "Frizzy",
  "Chute / clairsemés": "Thinning / hair loss",
  // Animaux
  Chien: "Dog",
  Chat: "Cat",
  Cheval: "Horse",
  Rongeur: "Small pet",
  Oiseau: "Bird",
  Reptile: "Reptile",
  Poisson: "Fish",
  Autre: "Other",
  // Tranches d'âge enfants
  "Bébé (0-2 ans)": "Baby (0-2)",
  "Enfant (3-11 ans)": "Child (3-11)",
  "Ado (12-17 ans)": "Teen (12-17)",
  "Adulte (18+)": "Adult (18+)",
  // Sports & activités
  Running: "Running",
  "Musculation/Fitness": "Strength / Fitness",
  Yoga: "Yoga",
  Pilates: "Pilates",
  Danse: "Dance",
  Football: "Football",
  "Tennis/Padel": "Tennis / Padel",
  Natation: "Swimming",
  Cyclisme: "Cycling",
  Randonnée: "Hiking",
  "Ski/Sports d'hiver": "Ski / Winter sports",
  "Sports de combat": "Combat sports",
  Crossfit: "Crossfit",
  Équitation: "Horse riding",
  Surf: "Surf",
  Golf: "Golf",
  Escalade: "Climbing",
  // Mobilité
  "Permis B": "Driving license",
  "Véhicule personnel": "Own vehicle",
  "Passeport valide": "Valid passport",
  "Dispo voyage (France)": "Available to travel (France)",
  "Dispo voyage (International)": "Available to travel (International)",
};

/**
 * Traduit une valeur d'attribut vers la langue voulue.
 * Retourne la valeur FR telle quelle si pas de traduction connue.
 */
export function localizeTalentAttribute(
  value: string | null | undefined,
  lang: "fr" | "en" = "fr"
): string | null {
  if (!value) return null;
  if (lang === "en") return TALENT_ATTRIBUTE_LABELS_EN[value] || value;
  return value;
}

/**
 * Traduit une liste de valeurs (champs à sélection multiple) et renvoie une
 * chaîne prête à afficher (ex. "Acnéique, Sensible"). Renvoie null si vide.
 */
export function localizeTalentAttributeList(
  values: string[] | null | undefined,
  lang: "fr" | "en" = "fr"
): string | null {
  if (!values || values.length === 0) return null;
  return values
    .map((v) => localizeTalentAttribute(v, lang))
    .filter(Boolean)
    .join(", ");
}

/** Ajoute ou retire une valeur d'une liste de filtres multi-sélection. */
export function toggleFilterValue(selected: string[], value: string): string[] {
  return selected.includes(value)
    ? selected.filter((v) => v !== value)
    : [...selected, value];
}

/** Match filtre multi vs champ mono-valeur (OR). */
export function matchesSelectedValue(
  selected: string[],
  value: string | null | undefined
): boolean {
  return selected.length === 0 || (!!value && selected.includes(value));
}

/** Match filtre multi vs champ tableau (OR : au moins une valeur en commun). */
export function matchesSelectedAny(
  selected: string[],
  values: string[] | null | undefined
): boolean {
  return (
    selected.length === 0 ||
    (!!values?.length && selected.some((s) => values.includes(s)))
  );
}
