import type { NextRequest } from "next/server";
import { logUserActivity } from "@/lib/user-activity-log";
import {
  humanizeApiPath,
  inferActivityModule,
  shouldSkipActivityPath,
} from "@/lib/activity-modules";

const SKIP_ROLES = new Set(["TALENT", "COMPTABLE", "JURISTE", "COIFFEUR", "ASSISTANTE_TM"]);

type TokenLike = {
  id?: unknown;
  sub?: unknown;
  role?: unknown;
  impersonatedId?: unknown;
  impersonatedRole?: unknown;
};

/**
 * Trace activité depuis proxy.ts (100 % serveur — rien dans l’onglet Réseau du salarié).
 */
export function trackStaffActivityFromProxy(
  request: NextRequest,
  token: TokenLike
): void {
  try {
    const path = request.nextUrl.pathname;
    if (shouldSkipActivityPath(path)) return;

    const t = token;
    const userId = String(t.impersonatedId || t.id || t.sub || "").trim();
    const role = String(t.impersonatedRole || t.role || "").trim();
    if (!userId || SKIP_ROLES.has(role)) return;

    const method = request.method.toUpperCase();
    const isApi = path.startsWith("/api/");
    const isRsc = request.nextUrl.searchParams.has("_rsc");
    const dest = request.headers.get("sec-fetch-dest") || "";
    const purpose = request.headers.get("purpose") || request.headers.get("Sec-Purpose") || "";

    // Prefetch / RSC : on log en léger, pas comme une vraie navigation
    let action: string;
    let summary: string;
    if (isApi) {
      action = `API_${method}`;
      summary = humanizeApiPath(method, path);
    } else if (isRsc || purpose.toLowerCase().includes("prefetch")) {
      action = "PAGE_PREFETCH";
      summary = `Prefetch ${path}`;
    } else if (dest === "document" || method === "GET") {
      action = "PAGE_VIEW";
      summary = `Page ${path}`;
    } else {
      action = `NAV_${method}`;
      summary = `${method} ${path}`;
    }

    logUserActivity({
      userId,
      action,
      summary,
      module: inferActivityModule(path),
      path,
      method,
      meta: {
        role,
        search: request.nextUrl.search?.slice(0, 200) || undefined,
        impersonating: Boolean(t.impersonatedId),
        realUserId: t.impersonatedId
          ? String(t.sub || t.id || "")
          : undefined,
        ua: (request.headers.get("user-agent") || "").slice(0, 180) || undefined,
        dest: dest || undefined,
      },
    });
  } catch {
    /* never break routing */
  }
}
