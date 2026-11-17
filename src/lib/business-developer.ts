/**
 * Business Developer (Joey) — rôle distinct de HEAD_OF_SALES (Leyna).
 * Accès plateforme volontairement réduit (menu + confinement proxy).
 */

export const BUSINESS_DEVELOPER_ROLE = "BUSINESS_DEVELOPER" as const;

export function isBusinessDeveloper(role: string | null | undefined): boolean {
  return role === BUSINESS_DEVELOPER_ROLE;
}

/** HoS (Leyna) ou BD — uniquement là où le BD a le même droit métier. */
export function isHosOrBusinessDeveloper(
  role: string | null | undefined
): boolean {
  return role === "HEAD_OF_SALES" || role === BUSINESS_DEVELOPER_ROLE;
}

/**
 * Préfixes de pages autorisés pour le Business Developer.
 * (RH salarié autorisé hors menu pour ne pas bloquer l’espace RH.)
 */
export const BD_ALLOWED_PATH_PREFIXES = [
  "/dashboard",
  "/projets-outreach",
  "/notifications",
  "/talents",
  "/marques",
  "/collaborations",
  "/simulateur-emv",
  "/simulateur-cessions",
  "/gifts",
  "/factures",
  "/devis",
  "/rh",
  "/kit/",
] as const;

export function isBusinessDeveloperPathAllowed(pathname: string): boolean {
  if (pathname === "/login" || pathname.startsWith("/api/")) return true;
  return BD_ALLOWED_PATH_PREFIXES.some(
    (p) => pathname === p || pathname.startsWith(`${p}/`)
  );
}

/**
 * Factures / devis : le BD ne voit que ses documents
 * (créés par elle, ou issus d’une collab qu’elle a créée).
 */
export function canBusinessDeveloperAccessDocument(
  role: string | null | undefined,
  userId: string,
  doc: {
    createdById?: string | null;
    collaboration?: { createdById?: string | null } | null;
  }
): boolean {
  if (!isBusinessDeveloper(role)) return true;
  if (doc.createdById && doc.createdById === userId) return true;
  if (doc.collaboration?.createdById && doc.collaboration.createdById === userId) {
    return true;
  }
  return false;
}
