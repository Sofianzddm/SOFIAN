import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLikelyBotPrefetch } from "@/lib/email-tracking";

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

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

export async function GET(request: NextRequest) {
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return buildImageResponse();

    const userAgent = request.headers.get("user-agent");
    if (isLikelyBotPrefetch(userAgent)) return buildImageResponse();

    const current = await contactMissionModel.findUnique({
      where: { id },
      select: { sentAt: true, openCount: true },
    });
    if (!current) return buildImageResponse();

    if (current.sentAt) {
      const elapsed = Date.now() - new Date(current.sentAt).getTime();
      if (elapsed < PREFETCH_THRESHOLD_MS) return buildImageResponse();
    }

    await contactMissionModel.update({
      where: { id },
      data: {
        openCount: { increment: 1 },
        lastOpenAt: new Date(),
        ...(current.openCount === 0 ? { openedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    console.warn("[track/casting/open] non-blocking error:", error);
  }

  return buildImageResponse();
}
