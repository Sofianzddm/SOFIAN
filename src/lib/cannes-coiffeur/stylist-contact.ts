/**
 * Coiffeur de l'agence Glow Up à Cannes — page publique, emails talents, notifs opérationnelles.
 * Surcharges optionnelles via env pour un autre numéro / prénom.
 */

/** Annulation via lien public impossible moins d’1 h avant l’heure du RDV. */
export const COIFFEUR_PUBLIC_CANCEL_MIN_LEAD_MS = 60 * 60 * 1000;

export const CANNES_COIFFEUR_STYLIST_PHONE_DEFAULT = "06 63 88 82 47";

/** Email Sofiane — notifs réservation / annulation (Resend), configuré dans le dépôt. */
export const CANNES_COIFFEUR_STYLIST_NOTIFY_EMAIL = "sofiane.alleb@hotmail.com";

export function getStylistFirstName(): string {
  return (
    process.env.NEXT_PUBLIC_CANNES_COIFFEUR_STYLIST_FIRST_NAME?.trim() ||
    process.env.CANNES_COIFFEUR_STYLIST_FIRST_NAME?.trim() ||
    "Sofiane"
  );
}

export function getStylistPhoneDisplay(): string {
  return (
    process.env.NEXT_PUBLIC_CANNES_COIFFEUR_STYLIST_PHONE?.trim() ||
    process.env.CANNES_COIFFEUR_STYLIST_PHONE?.trim() ||
    CANNES_COIFFEUR_STYLIST_PHONE_DEFAULT
  );
}

/** Lien téléphone (`tel:+336…`) depuis l’affichage FR. */
export function getStylistTelHref(): string {
  let d = getStylistPhoneDisplay().replace(/[\s.]/g, "");
  if (!d) return "tel:";
  if (d.startsWith("+")) return `tel:${d}`;
  if (d.startsWith("00")) return `tel:+${d.slice(2)}`;
  if (d.startsWith("0")) return `tel:+33${d.slice(1)}`;
  if (!d.startsWith("33")) return `tel:+33${d}`;
  return `tel:+${d}`;
}

/** Email opérationnel du coiffeur (Sofiane) — résas / annulations. */
export function getStylistNotifyEmail(): string {
  return CANNES_COIFFEUR_STYLIST_NOTIFY_EMAIL.trim().toLowerCase();
}
