import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeUrlParam } from "@/lib/email-tracking";

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

  // On déchiffre l'URL d'origine et on redirige toujours, même si le log
  // échoue. Sinon on enverrait l'utilisateur dans le mur.
  const target = encoded ? decodeUrlParam(encoded) : null;
  const redirectTo = target || fallbackUrl();

  if (id && target) {
    try {
      const current = await prisma.inboundOpportunity.findUnique({
        where: { id },
        select: { clickedAt: true },
      });
      if (current) {
        await prisma.inboundOpportunity.update({
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
      console.warn("[track/click] non-blocking error:", error);
    }
  }

  return NextResponse.redirect(redirectTo, { status: 302 });
}
