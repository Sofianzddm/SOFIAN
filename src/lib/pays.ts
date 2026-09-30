/**
 * Valeurs de `Talent.pays` reconnues comme Belgique (talent book BE,
 * sélecteur rédaction outreach BENELUX).
 */
export const BELGIAN_PAYS_VALUES = [
  "Belgique",
  "Belgium",
  "BE",
  "BEL",
] as const;

/** Filtre Prisma : talents belges (insensible à la casse). */
export const belgianPaysPrismaFilter = {
  in: [...BELGIAN_PAYS_VALUES],
  mode: "insensitive" as const,
};

export function isBelgianPays(pays: string | null | undefined): boolean {
  const n = String(pays || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (!n) return false;
  return (
    n === "belgique" ||
    n === "belgium" ||
    n === "be" ||
    n === "bel"
  );
}

/**
 * Liste des pays pour listes déroulantes (facturation, collaborations, etc.)
 * Ordre : France en premier, puis pays francophones / UE, puis alphabétique.
 */
export const LISTE_PAYS: string[] = [
  "France",
  "Belgique",
  "Suisse",
  "Luxembourg",
  "Monaco",
  "Allemagne",
  "Espagne",
  "Italie",
  "Portugal",
  "Pays-Bas",
  "Royaume-Uni",
  "Irlande",
  "Autriche",
  "Pologne",
  "Roumanie",
  "Grèce",
  "République tchèque",
  "Hongrie",
  "Suède",
  "Danemark",
  "Finlande",
  "Norvège",
  "Bulgarie",
  "Croatie",
  "Slovaquie",
  "Slovénie",
  "Estonie",
  "Lettonie",
  "Lituanie",
  "Chypre",
  "Malte",
  "États-Unis",
  "Canada",
  "Maroc",
  "Algérie",
  "Tunisie",
  "Sénégal",
  "Côte d'Ivoire",
  "Cameroun",
  "Mali",
  "Bénin",
  "Togo",
  "Burkina Faso",
  "Niger",
  "Gabon",
  "Congo",
  "Madagascar",
  "Maurice",
  "Île Maurice",
  "Réunion",
  "Guadeloupe",
  "Martinique",
  "Guyane française",
  "Mayotte",
  "Nouvelle-Calédonie",
  "Polynésie française",
  "Saint-Martin",
  "Saint-Barthélemy",
  "Japon",
  "Chine",
  "Corée du Sud",
  "Inde",
  "Australie",
  "Brésil",
  "Mexique",
  "Argentine",
  "Chili",
  "Colombie",
  "Pérou",
  "Afrique du Sud",
  "Égypte",
  "Israël",
  "Émirats arabes unis",
  "Qatar",
  "Arabie saoudite",
  "Turquie",
  "Russie",
  "Ukraine",
  "Indonésie",
  "Thaïlande",
  "Vietnam",
  "Singapour",
  "Malaisie",
  "Philippines",
  "Nouvelle-Zélande",
  "Autre",
];
