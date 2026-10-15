import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  humanizeApiPath,
  inferActivityModule,
  shouldSkipActivityPath,
} from "@/lib/activity-modules";
import { getAppSession } from "@/lib/getAppSession";

const SKIP_ROLES = new Set(["TALENT", "COMPTABLE", "JURISTE"]);

type IngestBody = {
  action?: string;
  summary?: string;
  module?: string;
  path?: string;
  method?: string;
  meta?: Record<string, unknown>;
  /** Rempli uniquement par le middleware (secret interne). */
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

/**
 * Point d'entrée unique pour logger l'activité.
 * - Client (PAGE_VIEW / HEARTBEAT) : session NextAuth
 * - Middleware Edge : header x-activity-internal + userId
 * Répond toujours 204 rapidement.
 */
export async function POST(request: NextRequest) {
  try {
    const body = (await request.json().catch(() => ({}))) as IngestBody;
    const secret = internalSecret();
    const internal = request.headers.get("x-activity-internal") || "";

    let userId = "";
    let role = "";

    if (secret && internal && internal === secret) {
      userId = String(body.userId || "").trim();
      role = String(body.role || "").trim();
    } else {
      const session = await getAppSession(request);
      if (!session?.user?.id) {
        return new NextResponse(null, { status: 204 });
      }
      userId = session.user.id;
      role = session.user.role || "";
    }

    if (!userId || SKIP_ROLES.has(role)) {
      return new NextResponse(null, { status: 204 });
    }

    const path = String(body.path || "").split("?")[0].slice(0, 300);
    const method = String(body.method || "").toUpperCase().slice(0, 16);

    if (path && shouldSkipActivityPath(path)) {
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

    // Anti-spam GET / heartbeat / page : max 1 même clé / 45s
    if (action === "HEARTBEAT" || action === "PAGE_VIEW" || method === "GET") {
      const since = new Date(Date.now() - 45_000);
      const dup = await prisma.userActivityLog.findFirst({
        where: {
          userId,
          action,
          path: path || null,
          createdAt: { gte: since },
        },
        select: { id: true },
      });
      if (dup) {
        return new NextResponse(null, { status: 204 });
      }
    }

    await prisma.userActivityLog.create({
      data: {
        userId,
        action,
        module: moduleName.slice(0, 64),
        summary: summary.slice(0, 500),
        meta: {
          ...(body.meta && typeof body.meta === "object" ? body.meta : {}),
          role: role || undefined,
        },
        path: path || null,
        method: method || null,
      },
    });

    return new NextResponse(null, { status: 204 });
  } catch (err) {
    console.warn("[ops/ingest]", err);
    return new NextResponse(null, { status: 204 });
  }
}

export async function GET() {
  return NextResponse.json({ error: "Not found" }, { status: 404 });
}
