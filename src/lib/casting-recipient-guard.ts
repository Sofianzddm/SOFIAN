/**
 * Garde-fous destinataires prospection casting / projets outreach :
 * jamais de boîtes internes Glow Up, jamais d'emails / identités talents.
 *
 * Le champ Talent.email est souvent l'adresse agence (@glowupagence.fr).
 * Les mails perso (orange, gmail…) peuvent donc être collés comme contacts
 * marque sans match exact — d'où le match local-part sur domaines grand public.
 */

import { prisma } from "@/lib/prisma";
import { contactPersonKey } from "@/lib/contact-person-key";

export type CastingRecipientBlocklist = {
  emails: Set<string>;
  names: Set<string>;
  /** Tokens de nom par talent (longueur ≥ 3), pour match local-part. */
  talentNameTokens: string[][];
};

let cached: { at: number; value: CastingRecipientBlocklist } | null = null;
const CACHE_MS = 60_000;

/** Domaines grand public — alignés sur marque-resolver (évite un import circulaire). */
const CONSUMER_EMAIL_DOMAINS = new Set<string>([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.fr",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bbox.fr",
  "numericable.fr",
  "yopmail.com",
  "mailinator.com",
]);

export function isInternalGlowUpEmail(value: string | undefined | null): boolean {
  const email = String(value || "")
    .trim()
    .toLowerCase();
  return email.endsWith("@glowupagence.fr");
}

function normalizePersonTokens(...parts: Array<string | null | undefined>): string[] {
  const key = contactPersonKey(parts[0], parts[1]);
  if (!key) return [];
  return key.split(" ").filter((t) => t.length >= 3);
}

function emailLocalPartTokens(email: string): string[] {
  const local = email.split("@")[0] || "";
  return local
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  // mae ↔ maeva, alex ↔ alexandre…
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

/**
 * Sur un domaine grand public, si ≥ 2 tokens du local-part collent au
 * prénom/nom d'un talent → c'est probablement son mail perso.
 */
function matchesTalentViaConsumerEmail(
  email: string,
  talentNameTokens: string[][]
): boolean {
  const domain = email.split("@")[1] || "";
  if (!CONSUMER_EMAIL_DOMAINS.has(domain)) return false;
  const localTokens = emailLocalPartTokens(email);
  if (localTokens.length === 0) return false;

  for (const nameTokens of talentNameTokens) {
    if (nameTokens.length === 0) continue;
    let hits = 0;
    for (const nt of nameTokens) {
      if (localTokens.some((lt) => tokenMatches(lt, nt))) hits += 1;
    }
    if (hits >= 2) return true;
    // Un seul token local exact = prénom.nom collé sans séparateur rare ;
    // si le local-part a 2+ tokens et 1 seul hit, on ne bloque pas.
    if (hits >= 1 && localTokens.length === 1 && nameTokens.length === 1) {
      return true;
    }
  }
  return false;
}

export async function loadCastingRecipientBlocklist(): Promise<CastingRecipientBlocklist> {
  const now = Date.now();
  if (cached && now - cached.at < CACHE_MS) return cached.value;

  const talents = await prisma.talent.findMany({
    select: {
      email: true,
      prenom: true,
      nom: true,
      user: { select: { email: true } },
    },
  });
  const emails = new Set<string>();
  const names = new Set<string>();
  const talentNameTokens: string[][] = [];

  for (const t of talents) {
    const email = String(t.email || "")
      .trim()
      .toLowerCase();
    if (email.includes("@")) emails.add(email);
    const userEmail = String(t.user?.email || "")
      .trim()
      .toLowerCase();
    if (userEmail.includes("@")) emails.add(userEmail);

    const key = contactPersonKey(t.prenom, t.nom);
    if (key) names.add(key);

    const tokens = normalizePersonTokens(t.prenom, t.nom);
    if (tokens.length > 0) talentNameTokens.push(tokens);
  }

  const value = { emails, names, talentNameTokens };
  cached = { at: now, value };
  return value;
}

/** Invalide le cache (tests / après sync talents). */
export function clearCastingRecipientBlocklistCache(): void {
  cached = null;
}

export function isForbiddenCastingRecipient(
  contact: {
    email?: string | null;
    firstname?: string | null;
    lastname?: string | null;
    prenom?: string | null;
    nom?: string | null;
  },
  blocklist?: CastingRecipientBlocklist | null
): boolean {
  const email = String(contact.email || "")
    .trim()
    .toLowerCase();
  if (isInternalGlowUpEmail(email)) return true;
  if (email && blocklist?.emails.has(email)) return true;

  const firstname = contact.firstname ?? contact.prenom;
  const lastname = contact.lastname ?? contact.nom;
  const nameKey = contactPersonKey(firstname, lastname);
  if (nameKey && blocklist?.names.has(nameKey)) return true;

  if (
    email &&
    blocklist?.talentNameTokens?.length &&
    matchesTalentViaConsumerEmail(email, blocklist.talentNameTokens)
  ) {
    return true;
  }

  return false;
}
