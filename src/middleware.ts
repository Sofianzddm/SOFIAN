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

  const t = token as { role?: string; impersonatedRole?: string };
  const effectiveRole = t.impersonatedRole ?? t.role;

  if (pathname.startsWith("/juriste") && effectiveRole !== "JURISTE") {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }

  if (effectiveRole === "JURISTE") {
    const isJuristeArea = pathname.startsWith("/juriste");
    const isCollabApi = pathname.startsWith("/api/collaborations/");
    const isAuthApi = pathname.startsWith("/api/auth");
    if (!isJuristeArea && !isCollabApi && !isAuthApi) {
      const url = request.nextUrl.clone();
      url.pathname = "/juriste";
      url.search = "";
      return NextResponse.redirect(url);
    }
  }

  // STRATEGY_PLANNER : accès limité à /strategy/*
  if (effectiveRole === "STRATEGY_PLANNER" && !pathname.startsWith("/strategy")) {
    return NextResponse.redirect(new URL("/strategy/projets/villa-cannes", request.url));
  }
  // Autres rôles : bloquer /strategy/* (sauf ADMIN)
  if (
    effectiveRole !== "STRATEGY_PLANNER" &&
    effectiveRole !== "ADMIN" &&
    pathname.startsWith("/strategy")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
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
    "/juriste",
    "/juriste/:path*",
    "/strategy",
    "/strategy/:path*",
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
    "/casting-outreach",
    "/casting-outreach/:path*",
    "/demandes-entrantes",
    "/demandes-entrantes/:path*",
  ],
};
