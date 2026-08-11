/**
 * Helpers client-safe pour le verrou CRM « noms de marque ».
 * Pas d'import Prisma — utilisable dans layout / sidebar / client components.
 */

export const NOM_CAMPAGNE_GATE_ROLES = ["TM", "HEAD_OF_SALES"] as const;

export function normalizeLabel(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim();
}

/** Pages autorisées pendant le verrou CRM (TM / HoS). */
export function isNomCampagneGateAllowedPath(pathname: string): boolean {
  if (pathname === "/collaborations/rattrapage-marques") return true;
  if (/^\/collaborations\/[^/]+$/.test(pathname)) {
    if (pathname === "/collaborations/new") return false;
    return true;
  }
  if (pathname.startsWith("/api/auth")) return true;
  if (pathname === "/api/collaborations/pending-nom-campagne") return true;
  if (/^\/api\/collaborations\/[^/]+$/.test(pathname)) return true;
  if (/^\/api\/collaborations\/[^/]+\/corriger-marque$/.test(pathname)) {
    return true;
  }
  if (pathname === "/login") return true;
  return false;
}
