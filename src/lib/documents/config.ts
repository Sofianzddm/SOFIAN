// src/lib/documents/config.ts

export const AGENCE_CONFIG = {
  // Infos société
  raisonSociale: "SASU GLOW UP AGENCY",
  adresse: "1330 AVENUE JEAN-RENE GUILLIBERT GAUTIER DE LA LAUZIERE - BAT C7",
  codePostal: "13290",
  ville: "AIX-EN-PROVENCE",
  pays: "France",
  capital: 5000,
  siret: "92103414600024",
  siren: "921034146",
  tva: "FR26921034146",
  rcs: "921 034 146 R.C.S. Aix-en-provence",
  ape: "70.21Z",
  telephone: "0785786266",
  email: "glowupagencyfr@gmail.com",

  // Coordonnées bancaires
  rib: {
    iban: "FR76 1695 8000 0151 0403 9277 377",
    bic: "QNTOFRP1XXX",
    titulaire: "GLOW UP AGENCY",
    adresse: "17 Rue Antoine Lumière",
    ville: "69008 Lyon",
  },

  // Mentions légales
  mentionsPenalites: `Taux de pénalité : En cas de retard de paiement, application d'intérêts de 3 fois le taux légal selon la loi n°2008-776 du 4 août 2008.
En cas de retard de paiement, application d'une indemnité forfaitaire pour frais de recouvrement de 40€ selon l'article D. 441-5 du code du commerce.`,

  // Conditions de paiement par défaut
  conditionsPaiement: "Paiement à 30 jours fin du mois dès réception de la facture",
  delaiPaiementJours: 30,

  // Préfixes des documents
  prefixes: {
    DEVIS: "D",
    FACTURE: "F",
    AVOIR: "A",
    BON_DE_COMMANDE: "BDC",
  },
};

// Mentions TVA selon le type de client
export type TypeTVA = "FRANCE" | "EU_INTRACOM" | "EU_SANS_TVA" | "HORS_EU";

export const MENTIONS_TVA: Record<TypeTVA, { tauxTVA: number; mention: string | null }> = {
  FRANCE: {
    tauxTVA: 20,
    mention: null,
  },
  EU_INTRACOM: {
    tauxTVA: 0,
    mention: "Autoliquidation de la TVA - Article 283-2 du CGI",
  },
  EU_SANS_TVA: {
    tauxTVA: 20,
    mention: null,
  },
  HORS_EU: {
    tauxTVA: 0,
    mention: "Exonération de TVA - Article 259 B du CGI",
  },
};

// Liste des pays EU (noms français) pour affichage
export const PAYS_EU = [
  "Allemagne",
  "Autriche",
  "Belgique",
  "Bulgarie",
  "Chypre",
  "Croatie",
  "Danemark",
  "Espagne",
  "Estonie",
  "Finlande",
  "Grèce",
  "Hongrie",
  "Irlande",
  "Italie",
  "Lettonie",
  "Lituanie",
  "Luxembourg",
  "Malte",
  "Pays-Bas",
  "Pologne",
  "Portugal",
  "République tchèque",
  "Roumanie",
  "Slovaquie",
  "Slovénie",
  "Suède",
];

// Alias pays EU : noms anglais, codes ISO, variantes → détection intracom
const PAYS_EU_ALIASES: Record<string, string[]> = {
  Allemagne: ["Germany", "DE", "DEU"],
  Autriche: ["Austria", "AT", "AUT"],
  Belgique: ["Belgium", "BE", "BEL"],
  Bulgarie: ["Bulgaria", "BG", "BGR"],
  Chypre: ["Cyprus", "CY", "CYP"],
  Croatie: ["Croatia", "HR", "HRV"],
  Danemark: ["Denmark", "DK", "DNK"],
  Espagne: ["Spain", "ES", "ESP"],
  Estonie: ["Estonia", "EE", "EST"],
  Finlande: ["Finland", "FI", "FIN"],
  Grèce: ["Greece", "EL", "GR", "GRC"],
  Hongrie: ["Hungary", "HU", "HUN"],
  Irlande: ["Ireland", "IE", "IRL"],
  Italie: ["Italy", "IT", "ITA"],
  Lettonie: ["Latvia", "LV", "LVA"],
  Lituanie: ["Lithuania", "LT", "LTU"],
  Luxembourg: ["LU", "LUX"],
  Malte: ["Malta", "MT", "MLT"],
  "Pays-Bas": ["Netherlands", "NL", "NLD"],
  Pologne: ["Poland", "PL", "POL"],
  Portugal: ["PT", "PRT"],
  "République tchèque": ["Czech Republic", "Czechia", "CZ", "CZE"],
  Roumanie: ["Romania", "RO", "ROU"],
  Slovaquie: ["Slovakia", "SK", "SVK"],
  Slovénie: ["Slovenia", "SI", "SVN"],
  Suède: ["Sweden", "SE", "SWE"],
};

// France : alias anglais et codes
const FRANCE_ALIASES = ["France", "FR", "FRA", "French"];

/** Normalise une chaîne pour comparaison (minuscules, sans accents) */
function normalizeForComparison(s: string): string {
  return (s || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/** Set de toutes les valeurs normalisées pour pays EU (pour lookup rapide) */
const PAYS_EU_NORMALIZED = new Set<string>();
for (const [nomFr, aliases] of Object.entries(PAYS_EU_ALIASES)) {
  PAYS_EU_NORMALIZED.add(normalizeForComparison(nomFr));
  aliases.forEach((a) => PAYS_EU_NORMALIZED.add(normalizeForComparison(a)));
}

const FRANCE_NORMALIZED = new Set(FRANCE_ALIASES.map(normalizeForComparison));

/** Vérifie si le pays est la France */
function isFrance(pays: string): boolean {
  if (!pays || !pays.trim()) return true; // vide = France par défaut
  return FRANCE_NORMALIZED.has(normalizeForComparison(pays));
}

/** Vérifie si le pays est dans l'UE */
function isPaysEU(pays: string): boolean {
  if (!pays || !pays.trim()) return false;
  return PAYS_EU_NORMALIZED.has(normalizeForComparison(pays));
}

// Fonction pour déterminer le type de TVA
export function getTypeTVA(pays: string, tvaIntracom: string | null): TypeTVA {
  // France
  if (isFrance(pays)) {
    return "FRANCE";
  }

  // EU (avec alias anglais / codes ISO)
  if (isPaysEU(pays)) {
    // Avec numéro TVA intracom valide
    if (tvaIntracom && tvaIntracom.trim().length > 0) {
      return "EU_INTRACOM";
    }
    // Sans numéro TVA
    return "EU_SANS_TVA";
  }

  // Hors EU
  return "HORS_EU";
}

// CGV complètes
export const CGV = `CONDITIONS GÉNÉRALES DE VENTE

**Clause n° 1 : Objet et champ d'application**
Les présentes conditions générales de vente (CGV) constituent le socle de la négociation commerciale et sont systématiquement adressées ou remises à chaque acheteur pour lui permettre de passer commande. Les conditions générales de vente décrites ci-après détaillent les droits et obligations de la société SASU Glow Up Agency, située au *EUROPARC DE PICHAURY C7, 1330 AVENUE JEAN-RENÉ GUILLIBERT GAUTIER DE LA LAUZIERE, 13290 AIX-EN-PROVENCE* et de son client dans le cadre du devis de la prestation de service demandé. Toute acceptation du devis/bon de commande englobe la mention « Je reconnais avoir pris connaissance et j'accepte les conditions générales de vente ci-annexées », impliquant l'adhésion sans réserve de l'acheteur aux présentes conditions générales de vente.

**Clause n° 2 : Prix**
Le prix des prestations de services vendues sont ceux en vigueur au jour de la prise de commande. Ils sont libellés en euros et calculés hors taxes. Par voie de conséquence, ils seront majorés du taux de TVA et des frais de transport applicables au jour de la commande. La société Glow Up Agency se réserve le droit de modifier ses tarifs à tout moment avant la signature. Toutefois, elle s'engage à facturer les prestations aux prix indiqués lors de l'enregistrement de la commande.

**Clause n° 3 : Escompte**
Aucun escompte ne sera consenti en cas de paiement anticipé.

**Clause n° 4 : Modalités de paiement**
Le règlement des commandes s'effectue uniquement par virement bancaire. Les règlements seront effectués selon les conditions suivantes : paiement sous X jours suivant la réception de la facture (mentionné en bas de page sur la première page du devis).

**Clause n° 5 : Retard de paiement**
En cas de défaut de paiement total à échéance, l'acheteur doit verser à la société Glow Up Agency une pénalité de retard égale à trois fois le taux de l'intérêt légal. Le taux de l'intérêt légal retenu est celui en vigueur au jour du devis. Cette pénalité est calculée sur le montant TTC de la somme restant due et court à compter de la date d'échéance du prix sans qu'aucune mise en demeure préalable ne soit nécessaire.
En sus des indemnités de retard, toute somme non payée à sa date d'exigibilité produira de plein droit une indemnité forfaitaire de 40 euros due au titre des frais de recouvrement (Articles 441-10 et D. 441-5 du code de commerce).

**Clause n° 6 : Clause résolutoire**
Si dans les quinze jours qui suivent la mise en œuvre de la clause « Retard de paiement », l'acheteur ne s'est pas acquitté des sommes restantes dues, la vente sera résolue de plein droit et pourra ouvrir droit à l'allocation de dommages et intérêts au profit de la société Glow Up Agency.

**Clause n° 7 : Clause de réserve de propriété**
La société Glow Up Agency conserve la propriété des biens vendus jusqu'au paiement intégral du prix, en principal et en accessoires. À ce titre, si l'acheteur fait l'objet d'un redressement ou d'une liquidation judiciaire, la société Glow Up Agency se réserve le droit de revendiquer, dans le cadre de la procédure collective, les prestations vendues et restées impayées.

**Clause n° 8 : Force majeure**
La responsabilité de la société Glow Up Agency ne pourra pas être mise en œuvre si la non-exécution ou le retard dans l'exécution de l'une de ses obligations découle d'un cas de force majeure. À ce titre, la force majeure s'entend de tout événement extérieur, imprévisible et irrésistible au sens de l'article 1148 du Code civil.

**Clause n° 9 : Protection des données personnelles**
La société Glow Up Agency s'engage à respecter la réglementation applicable en matière de protection des données personnelles, en particulier le Règlement Général sur la Protection des Données (RGPD). Les données collectées dans le cadre de l'exécution des présentes CGV sont strictement confidentielles et destinées uniquement à la gestion de la relation commerciale avec le client. Le client dispose d'un droit d'accès, de rectification, et de suppression de ses données, qu'il peut exercer en envoyant une demande écrite à l'adresse suivante : *s.zeddam@glowupagence.fr*.

**Clause n° 10: Tribunal compétent**
Tout litige relatif à l'interprétation et à l'exécution des présentes conditions générales de vente est soumis au droit français. À défaut de résolution amiable, le litige sera porté devant le Tribunal de commerce de Lyon.

**Clause n° 11 : Communication externe d'un salarié**
Tout salarié de Glow Up Agency entrant en contact direct avec un client ou une autre entité externe en dehors du cadre défini par l'agence doit immédiatement en informer la direction. Le non-respect de cette obligation pourrait donner lieu à des sanctions appropriées, conformément aux règles internes de l'entreprise.

**Fait à Aix-en-Provence, à la date de signature du devis par le client.**

---

**CGV VALABLE JUSQU'A DÉCEMBRE 2026**`;
