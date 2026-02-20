import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware de sécurisation : les routes "outils internes" ne sont accessibles qu'aux utilisateurs connectés.
 * Les routes non matchées (/, /login, /partners/[slug], /book/*, etc.) restent publiques.
 */
export async function middleware(request: NextRequest) {
  const token = await getToken({
    req: request,
    secret: process.env.NEXTAUTH_SECRET,
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/dashboard",
    "/dashboard/:path*",
    "/talents",
    "/talents/:path*",
    "/negociations",
    "/negociations/:path*",
    "/collaborations",
    "/collaborations/:path*",
    "/marques",
    "/marques/:path*",
    "/partners/manage",
    "/partners/manage/:path*",
    "/partners/new",
    "/partners/projects",
    "/partners/projects/:path*",
    "/documents",
    "/documents/:path*",
    "/dossiers",
    "/dossiers/:path*",
    "/factures",
    "/finance",
    "/finance/:path*",
    "/gifts",
    "/gifts/:path*",
    "/notifications",
    "/users",
    "/users/:path*",
    "/projects",
    "/projects/:path*",
    "/reconciliation",
    "/account-manager",
    "/debug",
    "/presskit-dashboard",
    "/talentbook-stats",
    "/archives",
    "/talent",
    "/talent/:path*",
  ],
};
