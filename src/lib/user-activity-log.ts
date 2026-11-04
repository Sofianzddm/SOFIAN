import { prisma } from "@/lib/prisma";
import { isSofianAdminEmail } from "@/lib/account-access-lock";

export {
  ACTIVITY_LOG_RETENTION_DAYS,
  PULSE_RANGE_DAYS,
  isPulseRangeDays,
  parisDayBounds,
  todayParisYmd,
  addParisDays,
  type PulseRangeDays,
} from "@/lib/user-activity-constants";

export type LogUserActivityInput = {
  userId: string;
  action: string;
  summary: string;
  module?: string;
  meta?: Record<string, unknown>;
  path?: string | null;
  method?: string | null;
};

/** Anti-spam en mémoire — évite un findFirst DB qui mange le pool Neon. */
const DEDUPE_MS = 45_000;
const recentKeys = new Map<string, number>();

function wasRecentlyLogged(key: string): boolean {
  const now = Date.now();
  if (recentKeys.size > 4_000) {
    for (const [k, t] of recentKeys) {
      if (now - t > DEDUPE_MS) recentKeys.delete(k);
    }
  }
  const prev = recentKeys.get(key);
  if (prev && now - prev < DEDUPE_MS) return true;
  recentKeys.set(key, now);
  return false;
}

/**
 * Écrit une ligne d'activité. Fire-and-forget : ne jamais faire échouer
 * la requête métier si le log plante.
 */
export function logUserActivity(input: LogUserActivityInput): void {
  const userId = String(input.userId || "").trim();
  const action = String(input.action || "").trim();
  const summary = String(input.summary || "").trim();
  if (!userId || !action || !summary) return;

  const path = input.path ? String(input.path).slice(0, 300) : null;
  const method = input.method ? String(input.method).slice(0, 16) : null;
  const moduleName = String(input.module || "casting").slice(0, 64);

  // Anti-spam pages / prefetch — sans round-trip DB (pool Vercel = 5 connexions)
  if (
    action === "PAGE_VIEW" ||
    action === "PAGE_PREFETCH" ||
    action === "HEARTBEAT" ||
    method === "GET" ||
    method === "HEAD"
  ) {
    const key = `${userId}|${action}|${path || ""}`;
    if (wasRecentlyLogged(key)) return;
  }

  void (async () => {
    try {
      await prisma.userActivityLog.create({
        data: {
          userId,
          action,
          summary: summary.slice(0, 500),
          module: moduleName,
          meta: (input.meta ?? {}) as object,
          path,
          method,
        },
      });
    } catch (err) {
      const code =
        err && typeof err === "object" && "code" in err
          ? String((err as { code?: string }).code || "")
          : "";
      // P2024/P1001 = pool / Neon down — bruit inutile en boucle
      if (code === "P2024" || code === "P1001") {
        console.warn(`[user-activity-log] skip (${code})`);
        return;
      }
      console.warn(
        "[user-activity-log] write failed:",
        err instanceof Error ? err.message : err
      );
    }
  })();
}

/** Accès lecture journal — Sofian uniquement (même pas les autres ADMIN). */
export function canViewActivityPulse(email: string | null | undefined): boolean {
  return isSofianAdminEmail(email);
}

export function stripHtmlPreview(html: string | null | undefined, max = 120): string {
  if (!html) return "";
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}
