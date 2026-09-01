export const FW_VILLES = [
  { id: "PARIS", label: "Paris" },
  { id: "NEW_YORK", label: "New York" },
  { id: "MILAN", label: "Milan" },
  { id: "LONDRES", label: "Londres" },
  { id: "COPENHAGUE", label: "Copenhague" },
  { id: "SHANGHAI", label: "Shanghai" },
  { id: "TOKYO", label: "Tokyo" },
] as const;

export type FwVille = (typeof FW_VILLES)[number]["id"];

export const FW_VILLE_IDS = FW_VILLES.map((v) => v.id) as FwVille[];

export function isFwVille(value: string): value is FwVille {
  return (FW_VILLE_IDS as string[]).includes(value);
}

export function fwVilleLabel(id: string | null | undefined): string {
  if (!id) return "Paris";
  return FW_VILLES.find((v) => v.id === id)?.label || id;
}
