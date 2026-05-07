import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const LEYNA_EMAIL = "leyna@glowupagence.fr";

export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }

  const code = request.nextUrl.searchParams.get("code")?.trim();
  if (!code) {
    return NextResponse.json({ error: "Code OAuth manquant." }, { status: 400 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const clientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim();
  const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim();
  if (!clientId || !clientSecret || !redirectUri) {
    return NextResponse.json({ error: "Google OAuth non configuré." }, { status: 500 });
  }

  const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      code,
      client_id: clientId,
      client_secret: clientSecret,
      redirect_uri: redirectUri,
      grant_type: "authorization_code",
    }),
  });

  const tokenJson = (await tokenResponse.json().catch(() => null)) as
    | { access_token?: string; refresh_token?: string; expires_in?: number }
    | null;

  if (
    !tokenResponse.ok ||
    !tokenJson?.access_token ||
    !tokenJson?.refresh_token ||
    typeof tokenJson.expires_in !== "number"
  ) {
    return NextResponse.json({ error: "Échec connexion Gmail." }, { status: 500 });
  }

  await prisma.gmailToken.upsert({
    where: { email: LEYNA_EMAIL },
    create: {
      email: LEYNA_EMAIL,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
    },
    update: {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
    },
  });

  return NextResponse.redirect(new URL("/settings/gmail?connected=true", request.url));
}
