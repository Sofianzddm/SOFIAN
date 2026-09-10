import { NextRequest, NextResponse } from "next/server";
import { decodeCastingUrlParam } from "@/lib/casting-tracking";
import { recordCastingClick } from "@/lib/casting-engagement";

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
  const email = request.nextUrl.searchParams.get("e")?.trim() || "";

  const target = encoded ? decodeCastingUrlParam(encoded) : null;
  const redirectTo = target || fallbackUrl();

  if (id && target) {
    try {
      await recordCastingClick(id, target, email || null);
    } catch (error) {
      console.warn("[track/casting/click] non-blocking error:", error);
    }
  }

  return NextResponse.redirect(redirectTo, { status: 302 });
}
