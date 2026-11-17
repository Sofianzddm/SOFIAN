/**
 * Domaines email agence connus — safe côté client (pas de Prisma / pg).
 * La sync DB vit dans agency-partner.ts (server-only).
 */

const GENERIC_EMAIL_DOMAINS = new Set([
  "gmail.com",
  "googlemail.com",
  "outlook.com",
  "hotmail.com",
  "hotmail.fr",
  "live.com",
  "live.fr",
  "yahoo.com",
  "yahoo.fr",
  "icloud.com",
  "me.com",
  "mac.com",
  "protonmail.com",
  "proton.me",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "aol.com",
  "msn.com",
]);

function emailDomain(rawEmail: string | null | undefined): string | null {
  const raw = (rawEmail || "").trim().toLowerCase();
  if (!raw) return null;
  let domain = raw.includes("@") ? raw.split("@").pop() || "" : raw;
  domain = domain.replace(/^www\./, "").replace(/\.$/, "").trim();
  if (!domain || !domain.includes(".")) return null;
  return domain;
}

/** Domaines email → nom Partner canonique (influence / RP France). */
export const KNOWN_AGENCY_DOMAINS: Record<string, string> = {
  "woo.paris": "WOÔ",
  "wooparis.com": "WOÔ",
  "nicework.fr": "Nice Work",
  "ykone.com": "YKONE",
  "matriochka.com": "Matriochka",
  "matriochkainfluences.com": "Matriochka",
  "187.fr": "187",
  "leveled.agency": "LEVELED",
  "leveled.fr": "LEVELED",
  "26pmx.com": "26PMX",
  "obviously.com": "Obviously",
  "obvious.ly": "Obviously",
  "reech.com": "Reech",
  "beastly.fr": "Beastly",
  "beastly.com": "Beastly",
  "grenadine-rp.com": "Grenadine RP",
  "theutopia.fr": "The Utopia",
  "theutopia.com": "The Utopia",
  "zmirov.com": "Zmirov",
  "bursonglobal.com": "Burson",
  "burson.com": "Burson",
  "agencestephanieprotet.com": "Agence Stéphanie Protet",
  "gmprconsulting.it": "GM/PR",
  "talkie.be": "Walkie Talkie",
  "heaven.paris": "Heaven",
  "joeo.fr": "JO&O",
  "socialplayground.fr": "Social Playground",
  "socialplayground.com": "Social Playground",
  "sleeq.fr": "Sleeq",
  "sleeq.com": "Sleeq",
  "initial.agency": "Initial Agency",
  "milkyway.fr": "Milkyway",
  "pointdorgue.fr": "Point D'Orgue",
  "monks.com": "Monks",
  "media.monks.com": "Monks",
};

/** Résolution synchrone (UI) à partir du domaine email connu. */
export function agencyNameFromEmailDomain(
  rawEmail: string | null | undefined
): string | null {
  const domain = emailDomain(rawEmail);
  if (!domain || GENERIC_EMAIL_DOMAINS.has(domain)) return null;
  return KNOWN_AGENCY_DOMAINS[domain] || null;
}

/** Motifs dans le périmètre carto / carto2 → nom Partner. */
const PERIMETRE_AGENCY_HINTS: { re: RegExp; name: string }[] = [
  { re: /\bnice\s*work\b/i, name: "Nice Work" },
  { re: /\bwo[ôo]\b|\bwoo\s*paris\b/i, name: "WOÔ" },
  { re: /\bykone\b/i, name: "YKONE" },
  { re: /\bmatriochka\b/i, name: "Matriochka" },
  { re: /\b187\b/, name: "187" },
  { re: /\bleveled\b/i, name: "LEVELED" },
  { re: /\bobviously\b/i, name: "Obviously" },
  { re: /\breech\b/i, name: "Reech" },
  { re: /\bbeastly\b/i, name: "Beastly" },
  { re: /\bgrenadine\b/i, name: "Grenadine RP" },
  { re: /\butopia\b/i, name: "The Utopia" },
  { re: /\bzmirov\b/i, name: "Zmirov" },
  { re: /\bburson\b/i, name: "Burson" },
  { re: /\bmonks\b/i, name: "Monks" },
  { re: /\bst[ée]phanie\s*protet\b/i, name: "Agence Stéphanie Protet" },
];

/**
 * Périmètre carto2 (« Agence WOÔ », « Autre agence Monks ») ou hint connu.
 */
export function agencyNameFromPerimetre(
  perimetre: string | null | undefined
): string | null {
  const raw = (perimetre || "").trim();
  if (!raw) return null;
  for (const hint of PERIMETRE_AGENCY_HINTS) {
    if (hint.re.test(raw)) return hint.name;
  }
  const labeled = raw.match(/^(?:autre\s+)?agence\s+(.+)$/i);
  if (labeled?.[1]) {
    const name = labeled[1].trim().replace(/\s+/g, " ");
    if (name && !/^marque$/i.test(name) && !/^groupe$/i.test(name)) {
      return name;
    }
  }
  return null;
}

/** Contact côté agence (domaine connu OU périmètre « Agence … »). */
export function isAgencySideContact(c: {
  email?: string | null;
  perimetre?: string | null;
}): boolean {
  return Boolean(
    agencyNameFromEmailDomain(c.email) || agencyNameFromPerimetre(c.perimetre)
  );
}
