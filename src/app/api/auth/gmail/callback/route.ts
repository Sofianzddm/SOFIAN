import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { isMailerRole } from "@/lib/requireMailerAccess";
import { prisma } from "@/lib/prisma";

const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const GMAIL_PROFILE_URL = "https://gmail.googleapis.com/gmail/v1/users/me/profile";

export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!isMailerRole(session.user.role)) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
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

  // Identifie la boîte réellement autorisée côté Google.
  const profileResponse = await fetch(GMAIL_PROFILE_URL, {
    headers: { Authorization: `Bearer ${tokenJson.access_token}` },
  });
  const profileJson = (await profileResponse.json().catch(() => null)) as
    | { emailAddress?: string }
    | null;
  const connectedEmail = (profileJson?.emailAddress || "").trim().toLowerCase();
  if (!profileResponse.ok || !connectedEmail) {
    return NextResponse.json(
      { error: "Impossible d'identifier la boîte Gmail connectée." },
      { status: 500 }
    );
  }

  const isAdmin = session.user.role === "ADMIN";

  // Salarié : la boîte doit correspondre à son email plateforme (évite de
  // connecter la boîte d'un collègue / de Leyna par erreur).
  if (!isAdmin) {
    const userEmail = (session.user.email || "").trim().toLowerCase();
    if (userEmail && connectedEmail !== userEmail) {
      return NextResponse.redirect(
        new URL(
          `/admin/mailer?gmail_error=${encodeURIComponent(
            `Connecte ta propre boîte (${userEmail}), pas ${connectedEmail}.`
          )}`,
          request.url
        )
      );
    }
  }

  // Liaison user → boîte.
  // Admin : auto-link si un user plateforme a le même email et n'a pas déjà de boîte.
  // Salarié : toujours lié à lui-même (1 boîte / user).
  let linkUserId: string | undefined;
  if (isAdmin) {
    const matchingUser = await prisma.user.findFirst({
      where: { email: { equals: connectedEmail, mode: "insensitive" } },
      select: { id: true, gmailToken: { select: { id: true } } },
    });
    if (matchingUser && !matchingUser.gmailToken) {
      linkUserId = matchingUser.id;
    }
  } else {
    // Libère une éventuelle ancienne liaison de ce user avant de relier.
    await prisma.gmailToken.updateMany({
      where: { userId: session.user.id, email: { not: connectedEmail } },
      data: { userId: null },
    });
    linkUserId = session.user.id;
  }

  await prisma.gmailToken.upsert({
    where: { email: connectedEmail },
    create: {
      email: connectedEmail,
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
      ...(linkUserId ? { userId: linkUserId } : {}),
    },
    update: {
      accessToken: tokenJson.access_token,
      refreshToken: tokenJson.refresh_token,
      expiresAt: new Date(Date.now() + tokenJson.expires_in * 1000),
      ...(linkUserId ? { userId: linkUserId } : {}),
    },
  });

  const redirectPath = isAdmin
    ? `/settings/gmail?connected=${encodeURIComponent(connectedEmail)}`
    : `/admin/mailer?connected=${encodeURIComponent(connectedEmail)}`;

  return NextResponse.redirect(new URL(redirectPath, request.url));
}
