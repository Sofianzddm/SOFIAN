import { NextRequest } from "next/server";
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
 * Retourne la session "effective" : si un admin a un cookie d'impersonation,
 * on retourne la session de l'utilisateur pour lequel il se fait passer.
 */
export async function getAppSession(request: NextRequest): Promise<AppSession | null> {
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
