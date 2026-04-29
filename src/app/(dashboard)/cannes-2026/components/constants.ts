export const EVENT_TYPE_OPTIONS = [
  { value: "SOIREE", label: "Soiree" },
  { value: "DINER", label: "Diner" },
  { value: "BRUNCH", label: "Brunch" },
  { value: "COCKTAIL", label: "Cocktail" },
  { value: "CONFERENCE", label: "Conference" },
  { value: "PROJECTION", label: "Projection" },
  { value: "SHOOTING", label: "Shooting" },
  { value: "AUTRE", label: "Autre" },
] as const;

export const CONTACT_CATEGORY_OPTIONS = [
  { value: "MARQUE", label: "Marque" },
  { value: "AGENCE", label: "Agence" },
  { value: "PRESSE", label: "Presse" },
  { value: "PRODUCTION", label: "Production" },
  { value: "HOTEL", label: "Hotel" },
  { value: "TRANSPORT", label: "Transport" },
  { value: "TALENT_EXT", label: "Talent externe" },
  { value: "AUTRE", label: "Autre" },
] as const;

export const TYPE_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  SOIREE: { bg: "#C08B8B", text: "#FFF", label: "Soiree" },
  DINER: { bg: "#1A1110", text: "#F5EBE0", label: "Diner" },
  BRUNCH: { bg: "#FFD8A8", text: "#1A1110", label: "Brunch" },
  COCKTAIL: { bg: "#C8F285", text: "#1A1110", label: "Cocktail" },
  CONFERENCE: { bg: "#A8C8F2", text: "#1A1110", label: "Conference" },
  PROJECTION: { bg: "#E8C8F2", text: "#1A1110", label: "Projection" },
  SHOOTING: { bg: "#F2E8C8", text: "#1A1110", label: "Shooting" },
  AUTRE: { bg: "#E5E0D8", text: "#1A1110", label: "Autre" },
};
