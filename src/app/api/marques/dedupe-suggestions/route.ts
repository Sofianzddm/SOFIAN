import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { runMarqueDedupeAiJob } from "@/lib/marque-ai-dedupe";

const ALLOWED = ["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"];

/**
 * GET /api/marques/dedupe-suggestions?status=PENDING&limit=50
 */
export async function GET(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!ALLOWED.includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const { searchParams } = new URL(req.url);
    const status = (searchParams.get("status") || "PENDING") as
      | "PENDING"
      | "AUTO_MERGED"
      | "APPROVED"
      | "REJECTED"
      | "DISCARDED";
    const limit = Math.min(100, Math.max(1, parseInt(searchParams.get("limit") || "50", 10)));

    const [suggestions, counts] = await Promise.all([
      prisma.marqueDedupeSuggestion.findMany({
        where: { status },
        orderBy: [{ confidence: "desc" }, { createdAt: "desc" }],
        take: limit,
      }),
      prisma.marqueDedupeSuggestion.groupBy({
        by: ["status"],
        _count: { _all: true },
      }),
    ]);

    const statusCounts = Object.fromEntries(
      counts.map((c) => [c.status, c._count._all])
    );

    return NextResponse.json({ suggestions, statusCounts });
  } catch (error) {
    console.error("GET /api/marques/dedupe-suggestions:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

/**
 * POST /api/marques/dedupe-suggestions — lance manuellement le job IA (admin).
 * Body: { dryRun?: boolean, autoMerge?: boolean }
 */
export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    const role = (session.user as { role?: string }).role ?? "";
    if (!["ADMIN", "HEAD_OF"].includes(role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      dryRun?: boolean;
      autoMerge?: boolean;
    };

    const stats = await runMarqueDedupeAiJob({
      dryRun: body.dryRun ?? true,
      autoMerge: body.autoMerge ?? false,
      runId: `manual-${Date.now()}`,
    });

    return NextResponse.json({ ok: true, stats });
  } catch (error) {
    console.error("POST /api/marques/dedupe-suggestions:", error);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
