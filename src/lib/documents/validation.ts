// src/lib/documents/validation.ts

/**
 * Validation métier pour les documents de facturation
 */

interface Collaboration {
  montantBrut: number;
  commissionPercent: number;
  commissionEuros: number;
  montantNet: number;
}

interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

/**
 * Valide qu'un montant de facture correspond au montant de la collaboration
 */
export function validateFactureMontant(
  montantFacture: number,
  collaboration: Collaboration
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // Le montant de la facture doit correspondre au montant brut de la collab
  const difference = Math.abs(montantFacture - collaboration.montantBrut);
  const tolerance = 0.01; // Tolérance de 1 centime pour les arrondis

  if (difference > tolerance) {
    const delta = montantFacture - collaboration.montantBrut;
    if (Math.abs(delta) > collaboration.montantBrut * 0.1) {
      // Erreur si écart > 10%
      errors.push(
        `Le montant de la facture (${montantFacture}€) ne correspond pas au montant de la collaboration (${collaboration.montantBrut}€). Écart: ${delta.toFixed(2)}€`
      );
    } else {
      // Avertissement si écart < 10%
      warnings.push(
        `Attention: petit écart de ${delta.toFixed(2)}€ entre la facture et la collaboration`
      );
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Valide qu'un avoir ne dépasse pas le montant de la facture
 */
export function validateAvoirMontant(
  montantAvoir: number,
  montantFacture: number,
  montantAvoirsExistants: number = 0
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  const totalAvoirs = Math.abs(montantAvoir) + montantAvoirsExistants;
  const montantFactureAbs = Math.abs(montantFacture);

  if (totalAvoirs > montantFactureAbs) {
    errors.push(
      `Le total des avoirs (${totalAvoirs.toFixed(2)}€) ne peut pas dépasser le montant de la facture (${montantFactureAbs.toFixed(2)}€)`
    );
  }

  if (totalAvoirs === montantFactureAbs) {
    warnings.push(
      "Cet avoir annule totalement la facture. Le statut de la facture sera mis à ANNULE."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Vérifie qu'une facture peut être marquée comme payée
 */
export function validatePaiementFacture(
  statutFacture: string,
  hasAvoirs: boolean
): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  if (statutFacture === "ANNULE") {
    errors.push("Impossible de marquer comme payée une facture annulée");
  }

  if (statutFacture === "BROUILLON") {
    errors.push("Impossible de marquer comme payée une facture non envoyée");
  }

  if (statutFacture === "PAYE") {
    errors.push("Cette facture est déjà marquée comme payée");
  }

  if (hasAvoirs) {
    warnings.push(
      "Attention: cette facture possède des avoirs. Vérifiez que le montant payé tient compte des avoirs."
    );
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

/**
 * Calcule le montant net d'une facture après avoirs
 */
export function calculateMontantNetFacture(
  montantFacture: number,
  avoirs: Array<{ montantTTC: number; statut: string }>
): number {
  const montantAvoirs = avoirs
    .filter((a) => a.statut !== "ANNULE")
    .reduce((sum, a) => sum + Math.abs(a.montantTTC), 0);

  return montantFacture - montantAvoirs;
}
