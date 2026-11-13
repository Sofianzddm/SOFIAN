export type CartoAiSource = "claude" | "chatgpt" | "xai" | "apollo";

/** Portée géo Glow-up : France d'abord, puis Europe, puis International. */
export type CartoAiMarche = "FR" | "EU" | "INT";

export type CartoAiContactCandidate = {
  marche: CartoAiMarche;
  priorite: string | null;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  linkedinUrl: string | null;
  note: string | null;
  sources: CartoAiSource[];
};

export type CartoAiProviderResult = {
  provider: CartoAiSource;
  ok: boolean;
  error: string | null;
  contacts: CartoAiContactCandidate[];
};

export type CartoAiPreviewResult = {
  company: string;
  domain: string | null;
  language: "fr" | "en";
  contacts: CartoAiContactCandidate[];
  providers: CartoAiProviderResult[];
};

export const CARTO_AI_MARCHES: CartoAiMarche[] = ["FR", "EU", "INT"];

export function cartoAiMarcheLabel(m: CartoAiMarche): string {
  if (m === "FR") return "France";
  if (m === "EU") return "Europe";
  return "International";
}
