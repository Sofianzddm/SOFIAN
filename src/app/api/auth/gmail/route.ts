import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (session.user.role !== "ADMIN") {
    return NextResponse.json({ error: "Accès réservé à l'admin." }, { status: 403 });
  }

  const clientId = process.env.GOOGLE_CLIENT_ID?.trim();
  const redirectUri = process.env.GMAIL_REDIRECT_URI?.trim();
  if (!clientId || !redirectUri) {
    return NextResponse.json({ error: "Google OAuth non configuré." }, { status: 500 });
  }

  const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  authUrl.searchParams.set("client_id", clientId);
  authUrl.searchParams.set("redirect_uri", redirectUri);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set(
    "scope",
    [
      "https://www.googleapis.com/auth/gmail.send",
      "https://www.googleapis.com/auth/gmail.readonly",
      "https://www.googleapis.com/auth/gmail.settings.basic",
    ].join(" ")
  );
  authUrl.searchParams.set("access_type", "offline");
  authUrl.searchParams.set("prompt", "consent select_account");

  // Pré-sélectionne le compte Google visé (ex: ?email=ines@glowupagence.fr)
  const emailHint = request.nextUrl.searchParams.get("email")?.trim();
  if (emailHint) {
    authUrl.searchParams.set("login_hint", emailHint);
  }

  return NextResponse.redirect(authUrl.toString());
}
