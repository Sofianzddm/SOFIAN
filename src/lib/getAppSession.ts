import type { Session } from "next-auth";
import { NextRequest } from "next/server";
import { getToken } from "next-auth/jwt";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const IMPERSONATE_COOKIE = "impersonate_user_id";

export interface AppSessionUser {
  id: string;
  name?: string | null;
  email?: string | null;
  role?: string;
}

export interface AppSession {
  user: AppSessionUser;
  impersonating?: boolean;
  realUser?: AppSessionUser;
}

export type ProspectionActorResolution =
  | "impersonating"
  | "db_email"
  | "db_email_realigned"
  | "jwt_fallback_no_email"
  | "jwt_fallback_user_missing_or_inactive";

/**
 * Pour la prospection : l’id porté par le JWT peut ne plus correspondre à `users.id` en base
 * (migration, compte recréé, seed différent local vs prod). On aligne sur l’email quand c’est sûr.
 * Ne pas utiliser l’email quand on est en impersonation : le token garde souvent l’email admin.
 */
export async function resolveProspectionActor(session: AppSession): Promise<{
  userId: string;
  role: string;
  resolution: ProspectionActorResolution;
}> {
  if (session.impersonating) {
    return {
      userId: session.user.id,
      role: (session.user.role || "") as string,
      resolution: "impersonating",
    };
  }

  const email = session.user.email?.trim().toLowerCase();
  if (email) {
    const row = await prisma.user.findUnique({
      where: { email },
      select: { id: true, role: true, actif: true },
    });
    if (row?.actif) {
      return {
        userId: row.id,
        role: row.role as string,
        resolution:
          row.id !== session.user.id ? "db_email_realigned" : "db_email",
      };
    }
    return {
      userId: session.user.id,
      role: (session.user.role || "") as string,
      resolution: "jwt_fallback_user_missing_or_inactive",
    };
  }

  return {
    userId: session.user.id,
    role: (session.user.role || "") as string,
    resolution: "jwt_fallback_no_email",
  };
}

/**
 * Session « effective » pour les Route Handlers.
 *
 * 1) getServerSession(authOptions) — même source que useSession() (cookies via next/headers).
 * 2) Si absent (cas rares serverless), getToken sur la requête + variantes __Secure- / cookie non préfixé.
 * 3) Cookie httpOnly d’impersonation admin (fenêtre courte après POST /impersonate).
 */
export async function getAppSession(request: NextRequest): Promise<AppSession | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const debug = process.env.PROSPECTION_DEBUG === "1";

  const fromNextAuth = await getServerSession(authOptions);
  if (fromNextAuth?.user) {
    if (debug) {
      console.info("[prospection] getAppSession source=nextauth_server");
    }
    return await applyImpersonateCookieToSession(fromNextAuth, request);
  }

  const token = await getTokenFromRequestFlexible(request, secret);
  if (token) {
    if (debug) {
      console.info("[prospection] getAppSession source=jwt_token");
    }
    return buildSessionFromJwtPayload(token, request);
  }

  if (debug) {
    console.warn("[prospection] getAppSession source=none (401)");
  }
  return null;
}

async function applyImpersonateCookieToSession(
  session: Session,
  request: NextRequest
): Promise<AppSession | null> {
  if (!session.user) return null;

  const su = session.user as {
    id: string;
    role?: string;
    email?: string | null;
    name?: string | null;
    adminId?: string;
    adminName?: string;
  };

  // Impersonation JWT (voir auth.ts : adminId = admin réel, id = utilisateur efficace)
  if (su.adminId && su.adminId !== su.id) {
    return {
      user: {
        id: su.id,
        name: su.name,
        email: su.email,
        role: su.role,
      },
      impersonating: true,
      realUser: {
        id: su.adminId,
        name: su.adminName,
        email: null,
        role: "ADMIN",
      },
    };
  }

  const impersonateUserId = request.cookies.get(IMPERSONATE_COOKIE)?.value?.trim();
  const isAdmin = (session.user as { role?: string }).role === "ADMIN";

  if (!isAdmin || !impersonateUserId || impersonateUserId === session.user.id) {
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
        role: (session.user as { role?: string }).role,
      },
    };
  }

  return loadImpersonatedUserOrFallback(session, impersonateUserId);
}

async function loadImpersonatedUserOrFallback(
  session: Session,
  impersonateUserId: string
): Promise<AppSession> {
  const targetUser = await prisma.user.findUnique({
    where: { id: impersonateUserId, actif: true },
    select: { id: true, prenom: true, nom: true, email: true, role: true },
  });

  if (!targetUser) {
    return {
      user: {
        id: session.user!.id,
        name: session.user!.name,
        email: session.user!.email,
        role: (session.user as { role?: string }).role,
      },
    };
  }

  return {
    user: {
      id: targetUser.id,
      name: `${targetUser.prenom} ${targetUser.nom}`.trim(),
      email: targetUser.email,
      role: targetUser.role,
    },
    impersonating: true,
    realUser: {
      id: session.user!.id,
      name: session.user!.name,
      email: session.user!.email,
      role: (session.user as { role?: string }).role,
    },
  };
}

async function getTokenFromRequestFlexible(
  request: NextRequest,
  secret: string
): Promise<Record<string, unknown> | null> {
  const attempts = [
    () => getToken({ req: request, secret }),
    () => getToken({ req: request, secret, secureCookie: true }),
    () => getToken({ req: request, secret, secureCookie: false }),
  ];

  for (const run of attempts) {
    const t = await run();
    if (t) return t as Record<string, unknown>;
  }
  return null;
}

async function buildSessionFromJwtPayload(
  token: Record<string, unknown>,
  request: NextRequest
): Promise<AppSession | null> {
  const sub = String(token.sub ?? token.id ?? "");
  if (!sub) return null;

  const impersonateUserId = request.cookies.get(IMPERSONATE_COOKIE)?.value?.trim();
  const jwtRole = token.role as string | undefined;

  if (
    jwtRole === "ADMIN" &&
    impersonateUserId &&
    impersonateUserId !== sub &&
    !token.impersonatedId
  ) {
    const targetUser = await prisma.user.findUnique({
      where: { id: impersonateUserId, actif: true },
      select: { id: true, prenom: true, nom: true, email: true, role: true },
    });
    if (targetUser) {
      return {
        user: {
          id: targetUser.id,
          name: `${targetUser.prenom} ${targetUser.nom}`.trim(),
          email: targetUser.email,
          role: targetUser.role,
        },
        impersonating: true,
        realUser: {
          id: sub,
          name: token.name as string | undefined,
          email: token.email as string | null,
          role: jwtRole,
        },
      };
    }
  }

  const effectiveId = String(token.impersonatedId ?? token.sub ?? token.id);
  const effectiveRole = (token.impersonatedRole ?? token.role) as string | undefined;
  const impersonatingJwt = Boolean(token.impersonatedId);

  const base: AppSession = {
    user: {
      id: effectiveId,
      name: token.name as string | undefined,
      email: token.email as string | null,
      role: effectiveRole,
    },
  };

  if (impersonatingJwt) {
    return {
      ...base,
      impersonating: true,
      realUser: {
        id: sub,
        name: token.adminName as string | undefined,
        email: token.email as string | null,
        role: jwtRole,
      },
    };
  }

  return base;
}

export function getImpersonateCookieName(): string {
  return IMPERSONATE_COOKIE;
}
