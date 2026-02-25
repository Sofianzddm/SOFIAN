export function formatPercent(
  value: number | string | null | undefined,
  decimals: number = 2
): string {
  if (value === null || value === undefined) return "0";
  const num = typeof value === "number" ? value : Number(value);
  if (Number.isNaN(num)) return "0";

  return num.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

