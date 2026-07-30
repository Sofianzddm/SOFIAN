// Questions « anticipées » que la TM doit sécuriser AVANT d'envoyer le lien
// au talent. Elles reprennent les questions récurrentes qui déclenchent les
// allers-retours (VHR, billets, +1, droits, brief, produits…).

export type ChecklistValue = "OUI" | "NON" | "NA";

export type ChecklistAnswer = {
  value: ChecklistValue;
  detail?: string;
};

export type ChecklistState = Record<string, ChecklistAnswer>;

export type ChecklistQuestion = {
  key: string;
  label: string;
  section: string;
  /** Si OUI, remonter aussi cette info dans la vue talent (prise en charge). */
  showToTalent?: boolean;
  /** Libellé reformulé côté talent (affiché sur la page de confirmation). */
  talentLabel?: string;
  /**
   * Résumé « prise en charge » de l'offre (transport, hébergement…) : déjà
   * affiché de façon condensée, on l'exclut donc du récap détaillé talent.
   */
  priseEnChargeSummary?: boolean;
};

export const CHECKLIST_QUESTIONS: ChecklistQuestion[] = [
  // 1. Alignement & opportunité
  { key: "align_da", label: "Marque alignée avec la DA / le positionnement du talent ?", section: "Alignement & opportunité" },
  { key: "align_ratio", label: "Ratio travail demandé / contrepartie cohérent (surtout gifting) ?", section: "Alignement & opportunité" },

  // 2. Rémunération & facturation
  { key: "budget_net", label: "Budget net confirmé ?", section: "Rémunération & facturation" },
  { key: "frais_prod", label: "Frais de production pris en charge ?", section: "Rémunération & facturation", showToTalent: true, talentLabel: "Frais de production pris en charge" },
  { key: "avance_frais", label: "Avance de frais par le talent : modalités de note de frais claires ?", section: "Rémunération & facturation" },
  { key: "echeancier", label: "Échéancier de paiement / facturation communiqué ?", section: "Rémunération & facturation", showToTalent: true, talentLabel: "Échéancier de paiement communiqué" },
  { key: "devis_valide", label: "Devis prestataire / studio validé AVANT toute réservation ?", section: "Rémunération & facturation" },

  // 3. Livrables & délais
  { key: "livrables_figes", label: "Livrables exacts figés (type + quantité + réseau) ?", section: "Livrables & délais" },
  { key: "brief_complet", label: "Brief complet reçu (avant écriture / tournage) ?", section: "Livrables & délais", showToTalent: true, talentLabel: "Brief complet fourni" },
  { key: "dates_figees", label: "Dates script / tournage / preview / publication figées ?", section: "Livrables & délais" },
  { key: "retours_inclus", label: "Nombre de séries de retours / modifs inclus défini ?", section: "Livrables & délais", showToTalent: true, talentLabel: "Nombre de retours / modifs inclus défini" },
  { key: "retroplanning", label: "Rétroplanning réaliste vs dispo du talent ET de son équipe ?", section: "Livrables & délais" },

  // 4. Déplacement (VHR = Voyage / Hébergement / Restauration) & logistique
  { key: "vhr_transport", label: "Transport (avion/train) pris en charge ?", section: "Déplacement (VHR) & logistique", showToTalent: true, priseEnChargeSummary: true },
  { key: "vhr_hebergement", label: "Hébergement pris en charge ?", section: "Déplacement (VHR) & logistique", showToTalent: true, priseEnChargeSummary: true },
  { key: "vhr_repas", label: "Repas / restauration pris en charge ?", section: "Déplacement (VHR) & logistique", showToTalent: true, priseEnChargeSummary: true },
  { key: "plus_un", label: "+1 accepté (et pris en charge) ?", section: "Déplacement (VHR) & logistique", showToTalent: true, priseEnChargeSummary: true },
  { key: "qui_reserve", label: "Qui réserve les billets (agence / marque / talent) ?", section: "Déplacement (VHR) & logistique", showToTalent: true, talentLabel: "Qui réserve les billets" },
  { key: "ville_depart", label: "Ville de départ réelle du talent prise en compte ?", section: "Déplacement (VHR) & logistique" },
  { key: "navette", label: "Navette / transfert sur place prévu ?", section: "Déplacement (VHR) & logistique", showToTalent: true, talentLabel: "Navette / transfert sur place prévu" },
  { key: "email_reservation", label: "Email + référence de réservation transmis au talent ?", section: "Déplacement (VHR) & logistique", showToTalent: true, talentLabel: "Réservation (email + référence) transmise" },
  { key: "contact_place", label: "Contact sur place communiqué ?", section: "Déplacement (VHR) & logistique", showToTalent: true, talentLabel: "Contact sur place communiqué" },

  // 5. Droits & juridique
  { key: "droits_usage", label: "Droits / usage (durée) définis ?", section: "Droits & juridique" },
  { key: "paid_media", label: "Paid media / whitelisting précisé ?", section: "Droits & juridique", showToTalent: true, talentLabel: "Paid media / whitelisting précisé" },
  { key: "exclusivite", label: "Exclusivité (secteur + durée) clarifiée ?", section: "Droits & juridique", showToTalent: true, talentLabel: "Exclusivité clarifiée" },
  { key: "mentions", label: "Mentions obligatoires (légales / sanitaires) intégrées ?", section: "Droits & juridique", showToTalent: true, talentLabel: "Mentions obligatoires précisées" },
  { key: "contrat_presta", label: "Contrat prestataire (photographe…) relu par le juridique ?", section: "Droits & juridique" },

  // 6. Produits & événement
  { key: "produits", label: "Produits fournis : qui envoie, quand, à quelle adresse ?", section: "Produits & événement", showToTalent: true, talentLabel: "Produits fournis (envoi / adresse)" },
  { key: "presence_confirmee", label: "Événement : présence DÉFINITIVEMENT confirmée (≠ profil soumis) ?", section: "Produits & événement" },
  { key: "reconfirm_72h", label: "Événement : agenda vérifié + reconfirmation 72h prévue ?", section: "Produits & événement" },
];

/**
 * Questions à afficher au talent sur la page de confirmation, hors résumé
 * « prise en charge » (VHR) déjà condensé. Filtre ensuite sur celles qui ont
 * une réponse renseignée par la TM.
 */
export const TALENT_RECAP_QUESTIONS = CHECKLIST_QUESTIONS.filter(
  (q) => q.showToTalent && !q.priseEnChargeSummary
);

export const CHECKLIST_SECTIONS = Array.from(
  new Set(CHECKLIST_QUESTIONS.map((q) => q.section))
);

/** true si toutes les questions ont une réponse (OUI/NON/NA). */
export function isChecklistComplete(state: ChecklistState): boolean {
  return CHECKLIST_QUESTIONS.every((q) => !!state[q.key]?.value);
}

/** Questions répondues « NON » = points non sécurisés (risque d'aller-retour). */
export function unsecuredQuestions(state: ChecklistState): ChecklistQuestion[] {
  return CHECKLIST_QUESTIONS.filter((q) => state[q.key]?.value === "NON");
}
