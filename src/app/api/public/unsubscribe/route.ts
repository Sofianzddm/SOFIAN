import { NextRequest, NextResponse } from "next/server";
import { verifyListUnsubscribeToken } from "@/lib/gmail";
import { optOutDiffusionByEmail } from "@/lib/diffusion-opt-out";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function parseEmailParam(raw: string | null): string | null {
  if (!raw) return null;
  try {
    const decoded = Buffer.from(raw, "base64url").toString("utf8").trim().toLowerCase();
    if (!decoded || !decoded.includes("@")) return null;
    return decoded;
  } catch {
    return null;
  }
}

async function handleUnsubscribe(request: NextRequest): Promise<NextResponse> {
  const url = new URL(request.url);
  const email = parseEmailParam(url.searchParams.get("e"));
  const sig = (url.searchParams.get("s") || "").trim();

  if (!email || !verifyListUnsubscribeToken(email, sig)) {
    return NextResponse.json({ ok: false, error: "Lien invalide." }, { status: 400 });
  }

  await optOutDiffusionByEmail(email);

  // One-click (RFC 8058) : les clients attendent souvent 200 vide / JSON court.
  if (request.method === "POST") {
    return new NextResponse(null, { status: 200 });
  }

  return new NextResponse(
    `<!doctype html><html lang="fr"><head><meta charset="utf-8"/><title>Désinscription</title></head><body style="font-family:system-ui,sans-serif;padding:2rem;max-width:32rem"><h1>C’est noté</h1><p>Vous ne recevrez plus nos emails de prospection à <strong>${email.replace(/</g, "")}</strong>.</p></body></html>`,
    {
      status: 200,
      headers: { "Content-Type": "text/html; charset=utf-8" },
    }
  );
}

/** Clic humain dans le client mail. */
export async function GET(request: NextRequest) {
  return handleUnsubscribe(request);
}

/** One-click Gmail/Outlook (`List-Unsubscribe=One-Click`). */
export async function POST(request: NextRequest) {
  return handleUnsubscribe(request);
}
