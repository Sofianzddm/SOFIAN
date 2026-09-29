/**
 * Types partagés pour l'enrichissement multi-providers (Apollo + Lusha).
 */

export type EnrichmentProvider = "apollo" | "lusha";

export type EnrichmentEmail = {
  email: string;
  type: "work" | "personal" | "unknown";
  status?: string | null;
};

export type EnrichmentPhone = {
  number: string;
  type: "mobile" | "direct" | "other" | "unknown";
};

export type ProviderEnrichmentResult = {
  provider: EnrichmentProvider;
  configured: boolean;
  ok: boolean;
  /** Message d'erreur ou raison (clé manquante, 402, not found…). */
  error: string | null;
  /** Match trouvé côté provider (même sans email). */
  found: boolean;
  fullName: string | null;
  title: string | null;
  company: string | null;
  linkedinUrl: string | null;
  emails: EnrichmentEmail[];
  phones: EnrichmentPhone[];
  /** Confiance Apollo (high/medium/low/…) si dispo. */
  confidence: string | null;
  raw?: unknown;
};

export type EnrichPersonInput = {
  prenom: string | null;
  nom: string;
  linkedinUrl: string | null;
  company: string | null;
  domain: string | null;
};

export type EnrichCompareResponse = {
  input: EnrichPersonInput;
  apollo: ProviderEnrichmentResult;
  lusha: ProviderEnrichmentResult;
  /** Emails présents chez les deux (normalisés). */
  agreement: string[];
  /** Tous les emails uniques révélés, triés (work d'abord). */
  allEmails: EnrichmentEmail[];
};
