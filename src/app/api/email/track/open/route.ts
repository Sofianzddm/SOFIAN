import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isLikelyBotPrefetch } from "@/lib/email-tracking";

// GIF 1x1 transparent. Hardcodé pour éviter une lecture de fichier à chaque hit.
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

// Délai en-dessous duquel un chargement de pixel est considéré comme un
// pre-fetch automatique (Apple Mail Privacy, scanner antivirus, etc.).
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
  // On répond TOUJOURS l'image, même en cas d'erreur, pour ne rien casser
  // côté client mail.
  try {
    const id = request.nextUrl.searchParams.get("id")?.trim() || "";
    if (!id) return buildImageResponse();

    const userAgent = request.headers.get("user-agent");
    if (isLikelyBotPrefetch(userAgent)) return buildImageResponse();

    // Petit garde-fou : si la requête arrive moins de N secondes après
    // l'envoi, c'est presque certainement un pre-fetch (Apple Mail).
    const current = await prisma.inboundOpportunity.findUnique({
      where: { id },
      select: { sentAt: true, openCount: true },
    });
    if (!current) return buildImageResponse();

    if (current.sentAt) {
      const elapsed = Date.now() - current.sentAt.getTime();
      if (elapsed < PREFETCH_THRESHOLD_MS) return buildImageResponse();
    }

    await prisma.inboundOpportunity.update({
      where: { id },
      data: {
        openCount: { increment: 1 },
        lastOpenAt: new Date(),
        ...(current.openCount === 0 ? { openedAt: new Date() } : {}),
      },
    });
  } catch (error) {
    console.warn("[track/open] non-blocking error:", error);
  }

  return buildImageResponse();
}
