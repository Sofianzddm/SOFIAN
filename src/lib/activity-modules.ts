/** Infère le module métier depuis un path API ou page. */
export function inferActivityModule(path: string): string {
  const p = path.toLowerCase();
  if (p.includes("/casting") || p.includes("contact-mission")) return "casting";
  if (p.includes("/mailer") || p.includes("admin-mail") || p.includes("/api/mailer"))
    return "mailer";
  if (p.includes("prospection") || p.includes("outreach") || p.includes("inbound"))
    return "prospection";
  if (p.includes("/rh") || p.includes("/api/rh")) return "rh";
  if (p.includes("collab") || p.includes("facture") || p.includes("devis") || p.includes("quote"))
    return "collab";
  if (p.includes("marque") || p.includes("hubspot") || p.includes("crm")) return "crm";
  if (p.includes("negoci") || p.includes("nego")) return "nego";
  if (p.includes("gift")) return "gift";
  if (p.includes("dinner") || p.includes("cannes")) return "events";
  if (p.includes("prestataire")) return "prestataires";
  if (p.includes("decision-center") || p.includes("/dc")) return "decision";
  if (p.includes("talent")) return "talent";
  if (p.includes("users") || p.includes("delegat")) return "admin";
  if (p.includes("/ops/")) return "ops";
  return "app";
}

export function humanizeApiPath(method: string, path: string): string {
  const short = path
    .replace(/^\/api\//, "")
    .replace(/\/[a-z0-9]{20,}(?=\/|$)/gi, "/…")
    .slice(0, 120);
  return `${method} /${short}`;
}

/** Paths à ne jamais logger (bruit / boucle / page secrète). */
export const ACTIVITY_API_SKIP_PREFIXES = [
  "/api/auth",
  "/api/ops/ingest",
  "/api/ops/pulse",
  "/api/ops/ping",
  "/api/_s/",
  "/api/health",
  "/api/cron",
  "/api/webhooks",
  "/ops/pulse",
  "/_s/",
] as const;

export function shouldSkipActivityPath(path: string): boolean {
  const p = path.split("?")[0] || path;
  return ACTIVITY_API_SKIP_PREFIXES.some(
    (prefix) => p === prefix || p.startsWith(prefix + "/")
  );
}
