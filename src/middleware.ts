import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getNextAuthSecret } from "@/lib/nextAuthSecret";

const NOINDEX_HEADER = "noindex, nofollow, noarchive, nosnippet, noimageindex";

const GOOGLE_CRAWLER_UA =
  /\b(?:Googlebot|AdsBot-Google|Mediapartners-Google|Google-InspectionTool|FeedFetcher-Google|GoogleProducer)\b/i;

const SEARCH_ENGINE_CRAWLER_UA =
  /\b(?:Googlebot|AdsBot-Google|Mediapartners-Google|Google-InspectionTool|FeedFetcher-Google|GoogleProducer|bingbot|BingPreview|msnbot|DuckDuckBot|DuckDuckGo-Favicons-Bot|Baiduspider|YandexBot|YandexImages|YandexMobileBot|Sogou|Exabot|Applebot|ia_archiver|SeznamBot|Qwantify|PetalBot|Bytespider)\b/i;

/** Routes publiques sans session (hors middleware auth historique). */
const PUBLIC_NO_AUTH_PATHS = [
  /^\/login$/,
  /^\/$/,
  /^\/book\//,
  /^\/p\//,
  /^\/talentbook(\/|$)/,
  /^\/dinner-client\//,
  /^\/talent-demo$/,
  /^\/api\/auth\//,
];

function withNoIndex(response: NextResponse): NextResponse {
  response.headers.set("X-Robots-Tag", NOINDEX_HEADER);
  return response;
}

function isPublicNoAuthPath(pathname: string): boolean {
  return PUBLIC_NO_AUTH_PATHS.some((pattern) => pattern.test(pathname));
}

/**
 * Middleware de sécurisation : les routes "outils internes" ne sont accessibles qu'aux utilisateurs connectés.
 * Les routes non matchées historiquement (/, /login, /partners/[slug], /book/*, etc.) restent publiques.
 * Les webhooks externes (/api/webhooks/*) sont exclus : pas d'auth requise (DocuSeal, etc.).
 *
 * Anti-indexation : blocage Googlebot site-wide + X-Robots-Tag sur toutes les réponses.
 */
export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const ua = request.headers.get("user-agent") ?? "";

  // Blocage Google sur l'ensemble de la plateforme
  if (GOOGLE_CRAWLER_UA.test(ua)) {
    return new NextResponse("Forbidden", { status: 403 });
  }

  /** Page + APIs réservation coiffeur : ouvertes sans session. */
  if (
    pathname === "/r/cannes-coiffeur" ||
    pathname.startsWith("/api/pub/cannes-coiffeur") ||
    pathname === "/r/cannes-villa-tv" ||
    pathname === "/r/cannes-villa-tv/agenda" ||
    pathname.startsWith("/api/pub/cannes-villa-tv") ||
    pathname.startsWith("/r/activations/") ||
    pathname.startsWith("/api/pub/activation-stats/")
  ) {
    return withNoIndex(NextResponse.next());
  }

  /**
   * Pages publiques confidentielles (Kit Media + Grille Tarifaire) :
   *   /kit/[slug]      + /api/kit/[slug]
   *   /tarifs/[slug]   + /api/tarifs/[slug]
   *
   * Accessibles UNIQUEMENT via lien direct, JAMAIS indexables :
   *   - 403 pour les principaux bots de recherche (Google, Bing, Yandex, Baidu, etc.)
   *   - X-Robots-Tag: noindex pour les autres
   * Les bots de preview (Slack, FB, Twitter, LinkedIn, WhatsApp) restent autorisés
   * pour que le partage du lien sur ces canaux affiche bien une vignette.
   */
  if (
    pathname.startsWith("/kit/") ||
    pathname.startsWith("/api/kit/") ||
    pathname.startsWith("/tarifs/") ||
    pathname.startsWith("/api/tarifs/")
  ) {
    if (SEARCH_ENGINE_CRAWLER_UA.test(ua)) {
      return new NextResponse("Forbidden", { status: 403 });
    }
    return withNoIndex(NextResponse.next());
  }

  // Webhooks externes : pas d'auth
  if (pathname.startsWith("/api/webhooks")) {
    return withNoIndex(NextResponse.next());
  }

  // Catalogues partenaires publics : /partners/[slug] et /partners/[slug]/selection
  const publicPartnerPage = /^\/partners\/[^/]+(\/selection)?$/.test(pathname);
  if (publicPartnerPage) {
    return withNoIndex(NextResponse.next());
  }

  if (isPublicNoAuthPath(pathname)) {
    return withNoIndex(NextResponse.next());
  }

  // Inbound Apps Script routes: auth Bearer interne dans les handlers.
  if (pathname === "/api/inbound/talents") {
    return withNoIndex(NextResponse.next());
  }
  if (pathname === "/api/inbound/opportunities") {
    return withNoIndex(NextResponse.next());
  }

  const token = await getToken({
    req: request,
    secret: getNextAuthSecret(),
  });

  if (!token) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", request.nextUrl.pathname);
    return withNoIndex(NextResponse.redirect(loginUrl));
  }

  const t = token as { role?: string; impersonatedRole?: string };
  const effectiveRole = t.impersonatedRole ?? t.role;

  // Compte coiffeur : uniquement Cannes 2026 + API coiffeur + liste talents Cannes + auth
  if (effectiveRole === "COIFFEUR") {
    const allowed =
      pathname === "/login" ||
      pathname.startsWith("/api/auth") ||
      pathname.startsWith("/cannes-2026") ||
      pathname.startsWith("/api/cannes/coiffeur/") ||
      pathname === "/api/cannes/talents-list";
    if (!allowed) {
      return withNoIndex(NextResponse.redirect(new URL("/cannes-2026", request.url)));
    }
  }

  if (pathname.startsWith("/juriste") && effectiveRole !== "JURISTE") {
    return withNoIndex(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  if (effectiveRole === "JURISTE") {
    const isJuristeArea = pathname.startsWith("/juriste");
    const isCollabApi = pathname.startsWith("/api/collaborations/");
    const isAuthApi = pathname.startsWith("/api/auth");
    if (!isJuristeArea && !isCollabApi && !isAuthApi) {
      const url = request.nextUrl.clone();
      url.pathname = "/juriste";
      url.search = "";
      return withNoIndex(NextResponse.redirect(url));
    }
  }

  // STRATEGY_PLANNER : accès limité à /strategy/* + /cannes-2026*
  const isCannes2026Path = pathname === "/cannes-2026" || pathname.startsWith("/cannes-2026/");
  if (
    effectiveRole === "STRATEGY_PLANNER" &&
    !pathname.startsWith("/strategy") &&
    !isCannes2026Path
  ) {
    return withNoIndex(
      NextResponse.redirect(new URL("/strategy/projets/villa-cannes", request.url))
    );
  }
  // Exception: pipeline prospection accessible à HEAD_OF_SALES / CASTING_MANAGER / HEAD_OF
  const isProspectionPipeline =
    pathname === "/strategy/projet-individuel-talent/pipeline" ||
    pathname.startsWith("/strategy/projet-individuel-talent/pipeline/");

  // Autres rôles : bloquer /strategy/* (sauf ADMIN et exception pipeline)
  if (
    effectiveRole !== "STRATEGY_PLANNER" &&
    effectiveRole !== "ADMIN" &&
    !(isProspectionPipeline &&
      (effectiveRole === "HEAD_OF_SALES" ||
        effectiveRole === "CASTING_MANAGER" ||
        effectiveRole === "HEAD_OF")) &&
    pathname.startsWith("/strategy")
  ) {
    return withNoIndex(NextResponse.redirect(new URL("/dashboard", request.url)));
  }

  return withNoIndex(NextResponse.next());
}

export const config = {
  matcher: [
    "/",
    "/login",
    "/book/:path*",
    "/p/:path*",
    "/talentbook",
    "/talentbook/:path*",
    "/dinner-client/:path*",
    "/talent-demo",
    "/api/auth/:path*",
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
    "/cannes-2026",
    "/cannes-2026/:path*",
    // Prospection (fichiers leads) — même session que le reste du dashboard
    "/prospection",
    "/prospection/:path*",
    // Inbound API: session requise sauf exceptions Bearer (gérées plus haut)
    "/api/inbound/:path*",
    // Réservation coiffeur (public, sans session) — garde robots + header noindex
    "/r/cannes-coiffeur",
    "/api/pub/cannes-coiffeur/:path*",
    "/r/cannes-villa-tv",
    "/r/cannes-villa-tv/agenda",
    "/api/pub/cannes-villa-tv/:path*",
    // Rapports stats activations (portail client public)
    "/r/activations/:path*",
    "/api/pub/activation-stats/:path*",
    // Dashboard interne rapports stats activations
    "/activation-stats",
    "/activation-stats/:path*",
    // Kit Media public (confidentiel : accessible par lien direct, jamais indexé)
    "/kit/:path*",
    "/api/kit/:path*",
    // Grille tarifaire publique (mêmes règles que le Kit Media)
    "/tarifs/:path*",
    "/api/tarifs/:path*",
  ],
};
