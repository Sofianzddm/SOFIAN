export function formatPercent(
  value: number | null | undefined,
  decimals: number = 2
): string {
  const num =
    typeof value === "number" && !Number.isNaN(value) ? value : 0;

  return num.toLocaleString("fr-FR", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

