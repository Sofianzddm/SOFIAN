import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import {
  COIFFEUR_PUBLIC_PROFILE_SETTING_KEY,
  photoUrlFromStoredValue,
} from "@/lib/cannes-coiffeur/public-profile-setting";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

/** Portrait coiffeur pour la page publique. */
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

  const row = await prisma.cannesSharedSetting.findUnique({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
  });
  const res = NextResponse.json({ photoUrl: photoUrlFromStoredValue(row?.value) });
  res.headers.set("Cache-Control", "no-store, max-age=0");
  return res;
}
