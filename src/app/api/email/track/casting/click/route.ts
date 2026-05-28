import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeCastingUrlParam } from "@/lib/casting-tracking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fallbackUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  const encoded = request.nextUrl.searchParams.get("u")?.trim() || "";

  const target = encoded ? decodeCastingUrlParam(encoded) : null;
  const redirectTo = target || fallbackUrl();

  if (id && target) {
    try {
      const current = await contactMissionModel.findUnique({
        where: { id },
        select: { clickedAt: true },
      });
      if (current) {
        await contactMissionModel.update({
          where: { id },
          data: {
            clickCount: { increment: 1 },
            lastClickAt: new Date(),
            lastClickUrl: target.slice(0, 1000),
            ...(current.clickedAt ? {} : { clickedAt: new Date() }),
          },
        });
      }
    } catch (error) {
      console.warn("[track/casting/click] non-blocking error:", error);
    }
  }

  return NextResponse.redirect(redirectTo, { status: 302 });
}
