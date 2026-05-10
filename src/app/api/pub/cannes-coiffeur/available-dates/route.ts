import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeAvailableDatesParis,
  resolveActivePrestationBySlug,
} from "@/lib/cannes-coiffeur/availability";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

/** Dernier jour du festival Cannes côté planning coiffeur (Paris). */
const FESTIVAL_END_YMD = "2026-05-24";

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

  const prestSlug = req.nextUrl.searchParams.get("prestation")?.trim() ?? "";
  const prestation = await resolveActivePrestationBySlug(prisma, prestSlug);
  if (!prestation) {
    return NextResponse.json({ error: "prestation=inconnue ou inactive (slug)" }, { status: 400 });
  }

  const dates = await computeAvailableDatesParis(prisma, FESTIVAL_END_YMD, prestation.id, new Date());

  return NextResponse.json({ dates });
}
