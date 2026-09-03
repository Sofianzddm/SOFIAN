export const FW_KINDS = ["MAISON", "AGENCE"] as const;
export type FwKind = (typeof FW_KINDS)[number];

export function parseFwKind(value: unknown): FwKind | null {
  const s = String(value || "")
    .trim()
    .toUpperCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "AGENCE" || s === "AGENCY" || s === "PRESSE") return "AGENCE";
  if (s === "MAISON" || s === "CLIENT" || s === "MARQUE") return "MAISON";
  return null;
}

export function fwKind(value: unknown): FwKind {
  return parseFwKind(value) ?? "MAISON";
}

export function isFwAgence(value: unknown): boolean {
  return fwKind(value) === "AGENCE";
}
