import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLikelyBotPrefetch } from "@/lib/email-tracking";

/**
 * Pixel d'ouverture des mails de prospection des opportunités projet
 * (Ski Trip, Villa Cannes…). Compteurs sur OpportuniteMarque.
 */

const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

const PREFETCH_THRESHOLD_MS = 5 * 1000;

export const dynamic = "force-dynamic";
export const revalidate = 0;

function buildImageResponse(): NextResponse {
  return new NextResponse(new Uint8Array(TRANSPARENT_GIF), {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(TRANSPARENT_GIF.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
      Pragma: "no-cache",
      Expires: "0",
    },
  });
}

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return buildImageResponse();

    const userAgent = request.headers.get("user-agent");
    if (isLikelyBotPrefetch(userAgent)) return buildImageResponse();

    const current = await prisma.opportuniteMarque.findUnique({
      where: { id },
      select: { lastEmailSentAt: true, emailOpenCount: true },
    });
    if (!current) return buildImageResponse();

    if (current.lastEmailSentAt) {
      const elapsed = Date.now() - new Date(current.lastEmailSentAt).getTime();
      if (elapsed < PREFETCH_THRESHOLD_MS) return buildImageResponse();
    }

    await prisma.opportuniteMarque.update({
      where: { id },
      data: {
        emailOpenCount: { increment: 1 },
        ...(current.emailOpenCount === 0 ? { emailOpenedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    console.warn("[track/projet/open] non-blocking error:", error);
  }

  return buildImageResponse();
}
