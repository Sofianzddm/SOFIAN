import { NextRequest } from "next/server";
import { getAppSession, type AppSession } from "@/lib/getAppSession";

/** Rôles autorisés à utiliser le rédacteur de mails (envoi liste CSV inclus). */
export const MAILER_ROLES = [
  "ADMIN",
  "CASTING_MANAGER",
  "HEAD_OF_SALES",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "TM",
  "CM",
] as const;

export type MailerRole = (typeof MAILER_ROLES)[number];

export function isMailerRole(role: string | undefined | null): role is MailerRole {
  return Boolean(role && (MAILER_ROLES as readonly string[]).includes(role));
}

/**
 * Qui peut connecter sa propre boîte Gmail (OAuth).
 * Inclut les rôles mailer + ASSISTANTE_TM (contact marques gifts).
 * Ne donne PAS accès au rédacteur /admin/mailer.
 */
export function canConnectGmail(role: string | undefined | null): boolean {
  return isMailerRole(role) || role === "ASSISTANTE_TM";
}

/**
 * Garde pour le rédacteur de mails.
 * Retourne la session si le rôle est autorisé, sinon null.
 */
export async function requireMailerAccess(
  request: NextRequest
): Promise<AppSession | null> {
  const session = await getAppSession(request);
  if (!session?.user || !isMailerRole(session.user.role)) {
    return null;
  }
  return session;
}
