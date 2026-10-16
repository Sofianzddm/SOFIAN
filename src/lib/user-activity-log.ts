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

  void (async () => {
    try {
      // Anti-spam pages / prefetch / GET API
      if (
        action === "PAGE_VIEW" ||
        action === "PAGE_PREFETCH" ||
        action === "HEARTBEAT" ||
        method === "GET"
      ) {
        const since = new Date(Date.now() - 45_000);
        const dup = await prisma.userActivityLog.findFirst({
          where: {
            userId,
            action,
            path,
            createdAt: { gte: since },
          },
          select: { id: true },
        });
        if (dup) return;
      }

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
      console.warn("[user-activity-log] write failed:", err);
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
