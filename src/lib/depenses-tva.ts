/**
 * Ventilation HT / TVA / TTC du module Dépenses, partagée entre l'app mobile
 * et l'écran comptable.
 *
 * Deux pièges métier que ces fonctions servent à éviter :
 *  - un reçu affiche souvent le montant HT alors que le débit bancaire, lui,
 *    est le TTC : la différence ne veut pas dire « mauvais justificatif » ;
 *  - `Collaboration.montantNet` / `CollabCycle.montantNet` (facture talent)
 *    sont des HT. Un talent assujetti ajoute 20 % de TVA, donc le virement
 *    vaut montantNet × 1,20 — d'où les écarts de 20 % au pointage Libeo /
 *    Defacto.
 */

/** Taux proposés à la saisie. 0 = sans TVA (fournisseur non assujetti). */
export const TAUX_TVA_OPTIONS = [0, 5.5, 10, 20] as const;

/** Taux applicable aux prestations des talents assujettis (France). */
export const TAUX_TVA_TALENT = 20;

/** Tolérance de pointage : en dessous, deux montants sont considérés égaux. */
export const TOLERANCE_POINTAGE = 0.05;

export function round2(n: number): number {
  return Math.round((n + Number.EPSILON) * 100) / 100;
}

/** TVA contenue dans un montant TTC. */
export function tvaDepuisTTC(ttc: number, taux: number): number {
  if (!taux || !Number.isFinite(ttc)) return 0;
  return round2(ttc - ttc / (1 + taux / 100));
}

/** TVA à ajouter à un montant HT. */
export function tvaDepuisHT(ht: number, taux: number): number {
  if (!taux || !Number.isFinite(ht)) return 0;
  return round2(ht * (taux / 100));
}

/**
 * Taux qui expliquerait l'écart entre le montant lu sur un justificatif et le
 * débit bancaire, dans le cas où le reçu met en avant son HT et la banque le
 * TTC. `null` si aucun taux courant ne colle : là, c'est probablement le
 * mauvais justificatif.
 */
export function tauxExpliquantEcart(montantLu: number, ttc: number): number | null {
  if (montantLu <= 0 || ttc <= 0) return null;
  if (Math.abs(montantLu - ttc) <= TOLERANCE_POINTAGE) return null;
  for (const taux of TAUX_TVA_OPTIONS) {
    if (taux === 0) continue;
    if (Math.abs(montantLu + tvaDepuisHT(montantLu, taux) - ttc) <= TOLERANCE_POINTAGE) {
      return taux;
    }
  }
  return null;
}

export interface Ventilation {
  ht: number;
  tva: number;
  ttc: number;
}

/**
 * Ventile un montant saisi, selon qu'il a été donné HT ou TTC et le montant
 * de TVA retenu (déduit d'un taux ou saisi à la main).
 */
export function ventiler(
  montant: number,
  mode: "HT" | "TTC",
  tva: number
): Ventilation {
  const m = Number.isFinite(montant) ? montant : 0;
  const t = Number.isFinite(tva) ? tva : 0;
  return mode === "TTC"
    ? { ht: round2(m - t), tva: round2(t), ttc: round2(m) }
    : { ht: round2(m), tva: round2(t), ttc: round2(m + t) };
}

/**
 * Total d'une sélection de factures talents à comparer au débit bancaire.
 * Les lignes marquées `avecTva` sont majorées du taux talent.
 */
export function totalFacturesTalent(
  lignes: Array<{ montantNet: number; avecTva: boolean }>
): Ventilation {
  let ht = 0;
  let tva = 0;
  for (const ligne of lignes) {
    const net = Number.isFinite(ligne.montantNet) ? ligne.montantNet : 0;
    ht += net;
    if (ligne.avecTva) tva += tvaDepuisHT(net, TAUX_TVA_TALENT);
  }
  return { ht: round2(ht), tva: round2(tva), ttc: round2(ht + tva) };
}
