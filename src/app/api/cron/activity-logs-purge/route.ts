import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { ACTIVITY_LOG_RETENTION_DAYS } from "@/lib/user-activity-constants";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

const BATCH = 5_000;

/**
 * Purge les lignes user_activity_logs plus anciennes que 365 jours.
 * Auth : Bearer CRON_SECRET uniquement (aucune lecture métier exposée).
 */
export async function GET(request: NextRequest) {
  const auth = request.headers.get("authorization") || "";
  const secret = process.env.CRON_SECRET;
  if (!secret || auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const cutoff = new Date(
    Date.now() - ACTIVITY_LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000
  );

  let deleted = 0;
  for (;;) {
    const batch = await prisma.userActivityLog.findMany({
      where: { createdAt: { lt: cutoff } },
      select: { id: true },
      take: BATCH,
    });
    if (batch.length === 0) break;

    const { count } = await prisma.userActivityLog.deleteMany({
      where: { id: { in: batch.map((b) => b.id) } },
    });
    deleted += count;
    if (batch.length < BATCH) break;
  }

  return NextResponse.json({
    ok: true,
    retentionDays: ACTIVITY_LOG_RETENTION_DAYS,
    cutoff: cutoff.toISOString(),
    deleted,
  });
}
