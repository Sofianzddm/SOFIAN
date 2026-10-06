/**
 * Comptes dont la réactivation est réservée à Sofian (ex. arrêt maladie).
 * Les autres admins peuvent voir le compte inactif mais ne peuvent pas le réactiver.
 */

export const SOFIAN_ADMIN_EMAILS = [
  "sofian@glowupagence.fr",
  "s.zeddam@glowupagence.fr",
] as const;

/** Emails dont la réactivation est verrouillée (Sofian seul). */
export const REACTIVATION_LOCKED_EMAILS = [
  "manon.t@glowupagence.fr",
  "daphnee@glowupagence.fr",
] as const;

/** Code d’erreur NextAuth (credentials / Google) — sans espaces. */
export const LOGIN_ERROR_ARRET_MALADIE = "ARRET_MALADIE";

export const LOGIN_MESSAGE_ARRET_MALADIE =
  "Votre accès à la plateforme est temporairement suspendu pendant votre absence, afin de protéger le salarié et de respecter le Code du travail (suspension du contrat de travail durant un arrêt — art. L.1226-1 et suivants).";

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

export function isSofianAdminEmail(email: string | null | undefined): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (SOFIAN_ADMIN_EMAILS as readonly string[]).includes(normalized);
}

export function isReactivationLockedEmail(
  email: string | null | undefined
): boolean {
  if (!email) return false;
  const normalized = normalizeEmail(email);
  return (REACTIVATION_LOCKED_EMAILS as readonly string[]).includes(normalized);
}

/** Message affiché à la connexion si le compte est inactif. */
export function inactiveLoginMessage(
  email: string | null | undefined
): string {
  if (isReactivationLockedEmail(email)) {
    return LOGIN_MESSAGE_ARRET_MALADIE;
  }
  return "Ce compte a été désactivé. Contacte un administrateur.";
}

/**
 * Autorise-t-on cet admin à changer `actif` pour la cible ?
 * - Désactivation : tout ADMIN
 * - Réactivation d’un compte verrouillé : Sofian uniquement
 */
export function canChangeUserActif(params: {
  actorEmail: string | null | undefined;
  targetEmail: string | null | undefined;
  nextActif: boolean;
}): { ok: true } | { ok: false; error: string } {
  const { actorEmail, targetEmail, nextActif } = params;

  // Réactivation d’un compte verrouillé → Sofian seul
  if (nextActif === true && isReactivationLockedEmail(targetEmail)) {
    if (!isSofianAdminEmail(actorEmail)) {
      return {
        ok: false,
        error:
          "Seul Sofian peut réactiver ce compte (suspension arrêt maladie).",
      };
    }
  }

  return { ok: true };
}
