export const FW_LANGUAGES = ["fr", "en"] as const;
export type FwLanguage = (typeof FW_LANGUAGES)[number];

export function parseFwLanguage(value: unknown): FwLanguage | null {
  const s = String(value || "")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
  if (s === "en" || s === "anglais" || s === "english") return "en";
  if (s === "fr" || s === "francais" || s === "french") return "fr";
  return null;
}

export function fwLanguage(value: unknown): FwLanguage {
  return parseFwLanguage(value) ?? "fr";
}

export function fwLanguageLabel(value: unknown): string {
  return fwLanguage(value) === "en" ? "Anglais" : "Français";
}
