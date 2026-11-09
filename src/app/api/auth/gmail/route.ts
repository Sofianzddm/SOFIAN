import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canConnectGmail } from "@/lib/requireMailerAccess";

const RETURN_COOKIE = "gmail_oauth_return";

function safeReturnPath(raw: string | null): string | null {
  if (!raw) return null;
  const path = raw.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("://")) {
    return null;
  }
  return path.slice(0, 500);
}

export async function GET(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }
  if (!canConnectGmail(session.user.role)) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
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
  const emailHint =
    request.nextUrl.searchParams.get("email")?.trim() ||
    (session.user.role !== "ADMIN" ? session.user.email?.trim() : "") ||
    "";
  if (emailHint) {
    authUrl.searchParams.set("login_hint", emailHint);
  }

  const returnTo = safeReturnPath(
    request.nextUrl.searchParams.get("returnTo")
  );
  const res = NextResponse.redirect(authUrl.toString());
  if (returnTo) {
    res.cookies.set(RETURN_COOKIE, returnTo, {
      httpOnly: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 15,
    });
  } else {
    res.cookies.delete(RETURN_COOKIE);
  }
  return res;
}
