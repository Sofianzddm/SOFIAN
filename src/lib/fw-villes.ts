export const FW_VILLES = [
  { id: "PARIS", label: "Paris", labelEn: "Paris" },
  { id: "NEW_YORK", label: "New York", labelEn: "New York" },
  { id: "MILAN", label: "Milan", labelEn: "Milan" },
  { id: "LONDRES", label: "Londres", labelEn: "London" },
  { id: "COPENHAGUE", label: "Copenhague", labelEn: "Copenhagen" },
  { id: "SHANGHAI", label: "Shanghai", labelEn: "Shanghai" },
  { id: "TOKYO", label: "Tokyo", labelEn: "Tokyo" },
] as const;

export type FwVille = (typeof FW_VILLES)[number]["id"];

export const FW_VILLE_IDS = FW_VILLES.map((v) => v.id) as FwVille[];

export function isFwVille(value: string): value is FwVille {
  return (FW_VILLE_IDS as string[]).includes(value);
}

export function fwVilleLabel(
  id: string | null | undefined,
  language: "fr" | "en" = "fr"
): string {
  if (!id) return "Paris";
  const ville = FW_VILLES.find((v) => v.id === id);
  if (!ville) return id;
  return language === "en" ? ville.labelEn : ville.label;
}
