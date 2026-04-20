export function normalizeMissionBrandKey(value: string): string {
  const t = value.trim();
  if (!t) return "";
  return t
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "");
}

export function parseMissionPriority(value: unknown): "LOW" | "MEDIUM" | "HIGH" | "URGENT" {
  const raw = String(value || "").trim().toUpperCase();
  if (raw === "LOW" || raw === "HIGH" || raw === "URGENT") return raw;
  return "MEDIUM";
}
