import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLikelyBotPrefetch } from "@/lib/email-tracking";

/**
 * Pixel d'ouverture du rédacteur de mails admin.
 *  ?m=<mailId>     → ouverture du mail initial
 *  ?f=<followupId> → ouverture d'une relance
 *
 * Renvoie toujours un GIF 1x1 transparent (jamais d'erreur visible côté client
 * mail). L'incrément est best-effort.
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
    const mailId = request.nextUrl.searchParams.get("m")?.trim() || "";
    const followupId = request.nextUrl.searchParams.get("f")?.trim() || "";
    if (!mailId && !followupId) return buildImageResponse();

    const userAgent = request.headers.get("user-agent");
    if (isLikelyBotPrefetch(userAgent)) return buildImageResponse();

    if (followupId) {
      const current = await prisma.adminMailFollowup.findUnique({
        where: { id: followupId },
        select: { sentAt: true, openCount: true },
      });
      if (!current) return buildImageResponse();
      if (current.sentAt) {
        const elapsed = Date.now() - new Date(current.sentAt).getTime();
        if (elapsed < PREFETCH_THRESHOLD_MS) return buildImageResponse();
      }
      await prisma.adminMailFollowup.update({
        where: { id: followupId },
        data: {
          openCount: { increment: 1 },
          lastOpenAt: new Date(),
          ...(current.openCount === 0 ? { openedAt: new Date() } : {}),
        },
      });
      return buildImageResponse();
    }

    const current = await prisma.adminMail.findUnique({
      where: { id: mailId },
      select: { sentAt: true, openCount: true },
    });
    if (!current) return buildImageResponse();
    if (current.sentAt) {
      const elapsed = Date.now() - new Date(current.sentAt).getTime();
      if (elapsed < PREFETCH_THRESHOLD_MS) return buildImageResponse();
    }
    await prisma.adminMail.update({
      where: { id: mailId },
      data: {
        openCount: { increment: 1 },
        lastOpenAt: new Date(),
        ...(current.openCount === 0 ? { openedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    console.warn("[track/mailer/open] non-blocking error:", error);
  }

  return buildImageResponse();
}
