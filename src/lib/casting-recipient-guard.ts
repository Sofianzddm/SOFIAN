/**
 * Garde-fous destinataires prospection casting / projets outreach :
 * jamais de boîtes internes Glow Up, jamais d'emails / identités talents.
 */

import { prisma } from "@/lib/prisma";
import { contactPersonKey } from "@/lib/contact-person-key";

export type CastingRecipientBlocklist = {
  emails: Set<string>;
  names: Set<string>;
};

let cached: { at: number; value: CastingRecipientBlocklist } | null = null;
const CACHE_MS = 60_000;

export function isInternalGlowUpEmail(value: string | undefined | null): boolean {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  return email.endsWith("@glowupagence.fr");
}

export async function loadCastingRecipientBlocklist(): Promise<CastingRecipientBlocklist> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  const talents = await prisma.talent.findMany({
    select: { email: true, prenom: true, nom: true },
  });
  const emails = new Set<string>();
  const names = new Set<string>();
  for (const t of talents) {
    const email = String(t.email || "")
      .trim()
      .toLowerCase();
    if (email.includes("@")) emails.add(email);
    const key = contactPersonKey(t.prenom, t.nom);
    if (key) names.add(key);
  }

  const value = { emails, names };
  cached = { at: now, value };
  return value;
}

export function isForbiddenCastingRecipient(
  contact: { email?: string | null; firstname?: string | null; lastname?: string | null; prenom?: string | null; nom?: string | null },
  blocklist?: CastingRecipientBlocklist | null
): boolean {
  const email = String(contact.email || "")
    .trim()
    .toLowerCase();
  if (isInternalGlowUpEmail(email)) return true;
  if (blocklist?.emails.has(email)) return true;

  const firstname = contact.firstname ?? contact.prenom;
  const lastname = contact.lastname ?? contact.nom;
  const nameKey = contactPersonKey(firstname, lastname);
  if (nameKey && blocklist?.names.has(nameKey)) return true;

  return false;
}
