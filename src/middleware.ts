import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";

/**
 * Middleware de sécurisation : les routes "outils internes" ne sont accessibles qu'aux utilisateurs connectés.
 * Les routes non matchées (/, /login, /partners/[slug], /book/*, etc.) restent publiques.
 * Les webhooks externes (/api/webhooks/*) sont exclus : pas d'auth requise (DocuSeal, etc.).
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Webhooks externes : pas d'auth
  if (pathname.startsWith("/api/webhooks")) {
    return NextResponse.next();
  }

  // Catalogues partenaires publics : /partners/[slug] et /partners/[slug]/selection
  // Ex : /partners/woo-paris, /partners/woo-paris/selection
  const publicPartnerPage = /^\/partners\/[^/]+(\/selection)?$/.test(pathname);
  if (publicPartnerPage) {
    return NextResponse.next();
  }

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
    // Talents & négos internes
    "/talents",
    "/talents/:path*",
    "/negociations",
    "/negociations/:path*",
    // Collaborations & dossiers
    "/collaborations",
    "/collaborations/:path*",
    "/dossiers",
    "/dossiers/:path*",
    // Marques & partenaires
    "/marques",
    "/marques/:path*",
    "/partners",
    "/partners/:path*",
    "/partners/manage",
    "/partners/manage/:path*",
    "/partners/new",
    "/partners/projects",
    "/partners/projects/:path*",
    // Documents & factures
    "/documents",
    "/documents/:path*",
    "/factures",
    "/factures/:path*",
    // Finance & réconciliation
    "/finance",
    "/finance/:path*",
    "/reconciliation",
    "/reconciliation/:path*",
    // Gifts & notifications
    "/gifts",
    "/gifts/:path*",
    "/notifications",
    "/notifications/:path*",
    // Utilisateurs & projets internes
    "/users",
    "/users/:path*",
    "/projects",
    "/projects/:path*",
    // Autres sections internes
    "/account-manager",
    "/account-manager/:path*",
    "/debug",
    "/debug/:path*",
    "/presskit-dashboard",
    "/presskit-dashboard/:path*",
    "/talentbook-stats",
    "/talentbook-stats/:path*",
    "/archives",
    "/archives/:path*",
    // Portail talent
    "/talent",
    "/talent/:path*",
    "/objectifs",
    "/objectifs/:path*",
  ],
};
