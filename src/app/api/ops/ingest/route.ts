import { NextRequest, NextResponse } from "next/server";
import {
  humanizeApiPath,
  inferActivityModule,
  shouldSkipActivityPath,
} from "@/lib/activity-modules";
import { logUserActivity } from "@/lib/user-activity-log";

const SKIP_ROLES = new Set(["TALENT", "COMPTABLE", "JURISTE"]);

type IngestBody = {
  action?: string;
  summary?: string;
  module?: string;
  path?: string;
  method?: string;
  meta?: Record<string, unknown>;
  userId?: string;
  role?: string;
};

function internalSecret(): string {
  return (
    process.env.ACTIVITY_INGEST_SECRET?.trim() ||
    process.env.NEXTAUTH_SECRET?.trim() ||
    ""
  );
}

function notFound() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}

/**
 * Ingest interne uniquement (header secret).
 * Pas d’accès session salarié — rien de visible / appelable depuis le navigateur.
 * Le tracking vivant passe par proxy.ts (serveur).
 */
export async function POST(request: NextRequest) {
  try {
    const secret = internalSecret();
    const internal = request.headers.get("x-activity-internal") || "";
    if (!secret || !internal || internal !== secret) {
      return notFound();
    }

    const body = (await request.json().catch(() => ({}))) as IngestBody;
    const userId = String(body.userId || "").trim();
    const role = String(body.role || "").trim();

    if (!userId || SKIP_ROLES.has(role)) {
      return new NextResponse(null, { status: 204 });
    }

    const path = String(body.path || "").split("?")[0].slice(0, 300);
    const method = String(body.method || "").toUpperCase().slice(0, 16);

    if (path && shouldSkipActivityPath(path)) {
      return new NextResponse(null, { status: 204 });
    }
    // Même règle que le proxy : pas de log GET/HEAD API
    if (method === "GET" || method === "HEAD") {
      return new NextResponse(null, { status: 204 });
    }

    const action = String(body.action || (method ? `API_${method}` : "EVENT"))
      .trim()
      .slice(0, 64);
    const moduleName =
      String(body.module || "").trim() ||
      (path ? inferActivityModule(path) : "app");

    let summary = String(body.summary || "").trim();
    if (!summary) {
      if (action === "PAGE_VIEW" && path) summary = `Page ${path}`;
      else if (action === "HEARTBEAT" && path) summary = `Actif sur ${path}`;
      else if (method && path) summary = humanizeApiPath(method, path);
      else summary = action;
    }

    logUserActivity({
      userId,
      action,
      summary,
      module: moduleName,
      path: path || null,
      method: method || null,
      meta: {
        ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
        role: role || undefined,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch {
    return notFound();
  }
}

export async function GET() {
  return notFound();
}
