import { marqueSlug } from "@/lib/marque-resolver";

/**
 * @deprecated Utiliser `marqueSlug()` depuis `@/lib/marque-resolver`.
 * Conservé pour compat ascendante : alias strict de `marqueSlug` afin que les
 * `ContactMission.targetBrandKey` historiques restent cohérents avec
 * `Marque.slug`.
 */
export function normalizeMissionBrandKey(value: string): string {
  return marqueSlug(value);
}

export function parseMissionPriority(value: unknown): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "LOW" || raw === "HIGH" || raw === "URGENT") return raw;
  return "MEDIUM";
}
