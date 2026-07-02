/**
 * Authentification API mobile (app dépenses).
 *
 * L'app native ne peut pas utiliser les cookies NextAuth : elle s'authentifie
 * une fois via POST /api/mobile/auth/login (email + mot de passe) et reçoit un
 * JWT Bearer longue durée, à envoyer ensuite dans le header :
 *
 *   Authorization: Bearer <token>
 *
 * Le token est signé avec le même secret que NextAuth (pas de nouvelle
 * variable d'env), mais avec une `audience` dédiée pour qu'un token mobile ne
 * soit jamais interchangeable avec un JWT de session web.
 */

import jwt from "jsonwebtoken";
import { NextRequest } from "next/server";
import { prisma } from "@/lib/prisma";
import { getNextAuthSecret } from "@/lib/nextAuthSecret";

const MOBILE_AUDIENCE = "glowup-mobile";
const TOKEN_TTL = "90d";

export interface MobileUser {
  id: string;
  email: string;
  prenom: string;
  nom: string;
  role: string;
}

export function signMobileToken(user: { id: string; role: string }): string {
  return jwt.sign({ role: user.role }, getNextAuthSecret(), {
    subject: user.id,
    audience: MOBILE_AUDIENCE,
    expiresIn: TOKEN_TTL,
  });
}

/**
 * Vérifie le Bearer token d'une requête mobile et charge l'utilisateur.
 * Renvoie null si absent / invalide / expiré / compte désactivé.
 */
export async function getMobileUser(
  request: NextRequest
): Promise<MobileUser | null> {
  const header = request.headers.get("authorization");
  if (!header?.startsWith("Bearer ")) return null;

  const token = header.slice("Bearer ".length).trim();
  if (!token) return null;

  let payload: jwt.JwtPayload;
  try {
    payload = jwt.verify(token, getNextAuthSecret(), {
      audience: MOBILE_AUDIENCE,
    }) as jwt.JwtPayload;
  } catch {
    return null;
  }

  if (!payload.sub) return null;

  const user = await prisma.user.findUnique({
    where: { id: payload.sub },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      role: true,
      actif: true,
    },
  });
  if (!user?.actif) return null;

  return {
    id: user.id,
    email: user.email,
    prenom: user.prenom,
    nom: user.nom,
    role: user.role,
  };
}

/** Seuls les ADMIN peuvent saisir des dépenses (web comme mobile). */
export function canManageDepensesMobile(user: MobileUser): boolean {
  return user.role === "ADMIN";
}
