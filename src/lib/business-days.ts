/**
 * Helpers pour le calcul en jours ouvrés (Lun-Ven), évalués dans le fuseau
 * horaire Europe/Paris pour rester cohérent avec l'agence (envois pendant
 * les heures de bureau françaises).
 *
 * NB : on ne gère pas (encore) les jours fériés français. Si besoin, ajouter
 * ici une liste de jours fériés et exclure dans `isBusinessDay`.
 */

const PARIS_TZ = "Europe/Paris";

/** True si la date tombe un Lun-Ven en heure Paris. */
export function isBusinessDay(date: Date, timeZone: string = PARIS_TZ): boolean {
  const weekday = new Intl.DateTimeFormat("en-US", {
    timeZone,
    weekday: "short",
  }).format(date);
  return weekday !== "Sat" && weekday !== "Sun";
}

/**
 * Avance (ou recule si `count` négatif) la date de `count` jours ouvrés.
 * Les week-ends ne comptent pas. L'heure du jour est préservée.
 */
export function addBusinessDays(
  date: Date,
  count: number,
  timeZone: string = PARIS_TZ
): Date {
  const result = new Date(date.getTime());
  if (!Number.isFinite(count) || count === 0) return result;
  const step = count > 0 ? 1 : -1;
  let remaining = Math.abs(Math.trunc(count));
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + step);
    if (isBusinessDay(result, timeZone)) remaining -= 1;
  }
  return result;
}

/**
 * True si au moins `count` jours ouvrés se sont écoulés entre `from` et `now`.
 * Pratique pour décider si une relance doit partir.
 */
export function hasBusinessDaysElapsed(
  from: Date,
  count: number,
  now: Date = new Date(),
  timeZone: string = PARIS_TZ
): boolean {
  if (count <= 0) return now.getTime() >= from.getTime();
  const eligibleAt = addBusinessDays(from, count, timeZone);
  return now.getTime() >= eligibleAt.getTime();
}

/**
 * Renvoie la date à partir de laquelle `count` jours ouvrés se seront écoulés
 * depuis `from`. Utile pour afficher la prochaine échéance d'une relance.
 */
export function businessDaysAfter(
  from: Date,
  count: number,
  timeZone: string = PARIS_TZ
): Date {
  return addBusinessDays(from, count, timeZone);
}
