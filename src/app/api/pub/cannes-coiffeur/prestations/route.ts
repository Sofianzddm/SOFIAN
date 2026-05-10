import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

/** Prestations réservables côté talent (pour afficher durées et grille associée). */
export async function GET(req: NextRequest) {
  const ip = getClientIp(req);
  if (!isRateLimitBypassed(ip)) {
    const limit = checkRateLimit({ key: `read:${ip}`, max: 60, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Trop de requêtes. Merci de réessayer dans quelques instants.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  const list = await prisma.cannesCoiffeurPrestation.findMany({
    where: { active: true },
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
    select: {
      slug: true,
      title: true,
      durationMinutes: true,
      bufferMinutes: true,
      description: true,
    },
  });

  return NextResponse.json({ prestations: list });
}
