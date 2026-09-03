/**
 * Destinations post-login : le middleware pose ?callbackUrl=… (lien email,
 * deep link). On n'accepte que des chemins internes pour éviter l'open redirect.
 */

export function sanitizeInternalCallbackUrl(
  raw: string | null | undefined
): string | null {
  if (!raw) return null;
  let path = raw.trim();
  if (!path) return null;

  try {
    if (path.startsWith("http://") || path.startsWith("https://")) {
      const u = new URL(path);
      path = `${u.pathname}${u.search}${u.hash}`;
    }
  } catch {
    return null;
  }

  if (!path.startsWith("/") || path.startsWith("//")) return null;
  if (path.includes("://")) return null;
  if (path.startsWith("/login") || path.startsWith("/api/")) return null;
  return path;
}

export function resolvePostLoginPath(
  role: string | undefined,
  callbackUrl: string | null | undefined
): string {
  const safe = sanitizeInternalCallbackUrl(callbackUrl);

  if (role === "TALENT") {
    return safe?.startsWith("/talent") ? safe : "/talent/dashboard";
  }
  if (role === "COMMUNITY_MANAGER") {
    return safe?.startsWith("/community") ? safe : "/community";
  }
  if (role === "COMPTABLE") {
    return safe?.startsWith("/comptable") ? safe : "/comptable";
  }
  if (role === "JURISTE") {
    return safe?.startsWith("/juriste") ? safe : "/juriste";
  }
  if (role === "COIFFEUR") {
    return safe?.startsWith("/cannes-2026") ? safe : "/cannes-2026";
  }
  if (role === "STRATEGY_PLANNER") {
    return safe || "/strategy/projets/villa-cannes";
  }

  return safe || "/dashboard";
}
