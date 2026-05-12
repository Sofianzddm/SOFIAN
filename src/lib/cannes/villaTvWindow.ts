import { CANNES_2026_DAYS, parisDayKey } from "@/lib/cannes/dates";

/**
 * Clés `YYYY-MM-DD` (Europe/Paris) pour l’écran TV : `horizon` jours consécutifs
 * à partir d’aujourd’hui, bornées au festival Cannes 2026.
 * En fin de festival, recule pour garder `horizon` jours complets.
 */
export function villaTvParisDayKeys(horizon: number): string[] {
  const keys = CANNES_2026_DAYS.map((d) => parisDayKey(d));
  const today = parisDayKey(new Date());
  let start = keys.findIndex((k) => k >= today);
  if (start === -1) {
    start = Math.max(0, keys.length - horizon);
  }
  start = Math.min(start, Math.max(0, keys.length - horizon));
  return keys.slice(start, start + horizon);
}
