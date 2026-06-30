import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeBeneluxOutreachUrlParam } from "@/lib/benelux-outreach-tracking";

export const dynamic = "force-dynamic";
export const revalidate = 0;

function fallbackUrl(): string {
  const raw =
    process.env.NEXT_PUBLIC_BASE_URL?.trim() ||
    process.env.NEXTAUTH_URL?.trim() ||
    "https://app.glowupagence.fr";
  return raw.replace(/\/$/, "");
}

export async function GET(request: NextRequest) {
  const id = request.nextUrl.searchParams.get("id")?.trim() || "";
  const encoded = request.nextUrl.searchParams.get("u")?.trim() || "";

  const target = encoded ? decodeBeneluxOutreachUrlParam(encoded) : null;
  const redirectTo = target || fallbackUrl();

  if (id && target) {
    try {
      const current = await prisma.beneluxOutreachTouch.findUnique({
        where: { id },
        select: { clickedAt: true },
      });
      if (current) {
        await prisma.$transaction([
          prisma.beneluxOutreachTouch.update({
            where: { id },
            data: {
              clickCount: { increment: 1 },
              lastClickAt: new Date(),
              lastClickUrl: target.slice(0, 1000),
              ...(current.clickedAt ? {} : { clickedAt: new Date() }),
            },
          }),
          prisma.beneluxOutreachClick.create({
            data: { touchId: id, url: target.slice(0, 1000) },
          }),
        ]);
      }
    } catch (error) {
      console.warn("[track/benelux-outreach/click] non-blocking error:", error);
    }
  }

  return NextResponse.redirect(redirectTo, { status: 302 });
}
