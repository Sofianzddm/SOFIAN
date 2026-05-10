import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  computeFreeSlotsForDate,
  resolveActivePrestationBySlug,
} from "@/lib/cannes-coiffeur/availability";
import { formatParisTime } from "@/lib/cannes-coiffeur/formatParisTime";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Créneaux libres pour un jour Paris (après grille dispo − réservations).
 */
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

  const dateStr = req.nextUrl.searchParams.get("date")?.trim() ?? "";
  if (!DATE_RE.test(dateStr)) {
    return NextResponse.json({ error: "Parametre date=YYYY-MM-DD requis" }, { status: 400 });
  }

  const slots = await computeFreeSlotsForDate(prisma, dateStr, prestation.id, new Date());

  return NextResponse.json({
    slots: slots.map((s) => ({
      startsAt: s.startsAt.toISOString(),
      endsAt: s.endsAt.toISOString(),
      label: s.label,
      prestationSlug: s.prestationSlug,
      prestationTitle: s.prestationTitle,
      displayStartParis: formatParisTime(s.startsAt, "HH:mm"),
    })),
  });
}
