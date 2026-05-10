import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { parsePublicToken } from "@/lib/cannes-coiffeur/cancellationToken";
import { formatParisTime } from "@/lib/cannes-coiffeur/formatParisTime";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

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

  const publicToken = req.nextUrl.searchParams.get("t")?.trim() || "";
  const parsed = parsePublicToken(publicToken);
  if (!parsed.valid || !parsed.token) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const booking = await prisma.cannesCoiffeurBooking.findUnique({
    where: { cancellationToken: parsed.token },
    include: { slot: true },
  });

  if (!booking) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  if (booking.cancelledAt || booking.status === "CANCELLED") {
    return NextResponse.json({ status: "cancelled" });
  }

  return NextResponse.json({
    status: "active",
    startsAt: booking.slot.startsAt.toISOString(),
    endsAt: booking.slot.endsAt.toISOString(),
    guestName: booking.guestName ?? "",
    guestEmail: booking.guestEmail ?? "",
    displayStartParis: formatParisTime(booking.slot.startsAt, "EEEE d MMMM yyyy · HH:mm"),
  });
}
