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
 * Renvoie minuit (début de journée) du jour calendaire de `date` tel qu'il est
 * vu dans `timeZone`, représenté en UTC. Sert à raisonner « par jour » plutôt
 * que par instant exact (utile pour les crons quotidiens).
 */
function startOfDayInTz(date: Date, timeZone: string = PARIS_TZ): Date {
  const [y, m, d] = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  })
    .format(date)
    .split("-")
    .map(Number);
  return new Date(Date.UTC(y, m - 1, d, 0, 0, 0));
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
  // Comparaison « par jour » et non par instant exact : les crons de relance
  // tournent une fois par jour (8h). Si on gardait l'heure d'envoi, un mail
  // parti l'après-midi ne serait jamais éligible au cron du matin de J+N et
  // sa relance partirait systématiquement un jour ouvré trop tard.
  const eligibleAt = addBusinessDays(
    startOfDayInTz(from, timeZone),
    count,
    timeZone
  );
  return startOfDayInTz(now, timeZone).getTime() >= eligibleAt.getTime();
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
