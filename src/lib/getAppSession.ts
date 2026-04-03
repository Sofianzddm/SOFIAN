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

/**
 * Session « effective » pour les Route Handlers : on lit d'abord le JWT via la requête
 * (même mécanisme que le middleware), car getServerSession() sans req peut renvoyer null
 * dans certains contextes App Router / serverless.
 *
 * Impersonation : aligné sur auth.ts (impersonatedId / impersonatedRole dans le JWT) +
 * cookie httpOnly legacy pour l’admin avant mise à jour du token.
 */
export async function getAppSession(request: NextRequest): Promise<AppSession | null> {
  const secret = process.env.NEXTAUTH_SECRET;
  if (!secret) return null;

  const token = await getToken({ req: request, secret });
  if (token) {
    const t = token as Record<string, unknown>;
    const sub = String(t.sub ?? t.id ?? "");
    if (!sub) {
      return fallbackAppSessionFromGetServerSession(request);
    }

    const impersonateUserId = request.cookies.get(IMPERSONATE_COOKIE)?.value?.trim();
    const jwtRole = t.role as string | undefined;

    // Admin + cookie d’impersonation, JWT pas encore mis à jour (fenêtre courte après POST /impersonate)
    if (
      jwtRole === "ADMIN" &&
      impersonateUserId &&
      impersonateUserId !== sub &&
      !t.impersonatedId
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
            name: (t.name as string) ?? undefined,
            email: (t.email as string) ?? null,
            role: jwtRole,
          },
        };
      }
    }

    const effectiveId = String(t.impersonatedId ?? t.sub ?? t.id);
    const effectiveRole = (t.impersonatedRole ?? t.role) as string | undefined;
    const impersonatingJwt = Boolean(t.impersonatedId);

    const base: AppSession = {
      user: {
        id: effectiveId,
        name: (t.name as string) ?? undefined,
        email: (t.email as string) ?? null,
        role: effectiveRole,
      },
    };

    if (impersonatingJwt) {
      return {
        ...base,
        impersonating: true,
        realUser: {
          id: sub,
          name: (t.adminName as string) ?? undefined,
          email: (t.email as string) ?? null,
          role: jwtRole,
        },
      };
    }

    return base;
  }

  return fallbackAppSessionFromGetServerSession(request);
}

async function fallbackAppSessionFromGetServerSession(
  request: NextRequest
): Promise<AppSession | null> {
  const session = await getServerSession(authOptions);
  if (!session?.user) return null;

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

  const targetUser = await prisma.user.findUnique({
    where: { id: impersonateUserId, actif: true },
    select: { id: true, prenom: true, nom: true, email: true, role: true },
  });

  if (!targetUser) {
    return {
      user: {
        id: session.user.id,
        name: session.user.name,
        email: session.user.email,
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
      id: session.user.id,
      name: session.user.name,
      email: session.user.email,
      role: (session.user as { role?: string }).role,
    },
  };
}

export function getImpersonateCookieName(): string {
  return IMPERSONATE_COOKIE;
}
