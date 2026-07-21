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
