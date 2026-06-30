// Calcul centralisé des dates d'échéance de facturation.
//
// Règle métier : « paiement à X jours date de facture » (J+X calendaire).
// Exemple : facture éditée le 29/06 + 30 jours => 29/07.

const DELAI_PAIEMENT_DEFAUT = 30;

/**
 * Calcule la date d'échéance « J+X » à partir de la date d'édition de la facture.
 * Ajoute simplement X jours calendaires à la date de base.
 * Si le délai est nul ou négatif (paiement comptant), retourne la date de base.
 */
export function computeDateEcheance(
  dateBase: Date,
  delaiJours: number = DELAI_PAIEMENT_DEFAUT
): Date {
  const d = new Date(dateBase);
  if (!Number.isFinite(delaiJours) || delaiJours <= 0) {
    return d;
  }
  d.setDate(d.getDate() + delaiJours);
  return d;
}

/**
 * Extrait le délai de paiement (en jours) depuis un libellé de conditions
 * ou des notes (ex: "Paiement sous 45 jours"). Retourne le fallback si aucun
 * nombre n'est trouvé. Détecte aussi le paiement comptant.
 */
export function extractDelaiPaiementJours(
  source?: string | null,
  fallback: number = DELAI_PAIEMENT_DEFAUT
): number {
  const text = source || "";
  if (/Paiement\s+comptant/i.test(text)) return 0;
  const match = text.match(/(\d+)\s*jours?/i);
  const n = match?.[1] ? Number(match[1]) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : fallback;
}

/**
 * Formate une date au format attendu par un <input type="date"> (yyyy-mm-dd),
 * en utilisant les composantes locales (évite le décalage d'un jour lié à UTC).
 */
export function toDateInputValue(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}
