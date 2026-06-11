import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { decodeProjetUrlParam } from "@/lib/projet-prospection";

/**
 * Redirection des liens cliqués dans les mails de prospection des
 * opportunités projet. Un clic vaut aussi ouverture.
 */

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

  const target = encoded ? decodeProjetUrlParam(encoded) : null;
  const redirectTo = target || fallbackUrl();

  if (id && target) {
    try {
      const current = await prisma.opportuniteMarque.findUnique({
        where: { id },
        select: { emailOpenedAt: true },
      });
      if (current) {
        await prisma.opportuniteMarque.update({
          where: { id },
          data: {
            emailOpenCount: { increment: 1 },
            ...(current.emailOpenedAt ? {} : { emailOpenedAt: new Date() }),
          },
        });
      }
    } catch (error) {
      console.warn("[track/projet/click] non-blocking error:", error);
    }
  }

  return NextResponse.redirect(redirectTo, { status: 302 });
}
