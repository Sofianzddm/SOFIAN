import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";

/** Toujours Europe/Paris pour l’affichage métier Cannes (pas de sélecteur de fuseau). */
export const PARIS_TZ = "Europe/Paris";

/**
 * Formate une date UTC (stockée en base) pour affichage en heure française.
 * @param date — instant stocké typiquement en UTC
 * @param pattern — pattern date-fns, ex. "dd/MM/yyyy HH:mm", "EEEE d MMMM yyyy 'à' HH:mm"
 */
export function formatParisTime(date: Date, pattern: string = "dd/MM/yyyy HH:mm"): string {
  return formatInTimeZone(date, PARIS_TZ, pattern, { locale: fr });
}

/** yyyy-MM-DD du jour courant selon le calendrier Paris. */
export function todayParisYmd(reference: Date = new Date()): string {
  return formatInTimeZone(reference, PARIS_TZ, "yyyy-MM-dd");
}
