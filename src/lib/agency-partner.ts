/**
 * Résolution / création d'une agence partenaire (model Partner) par nom, pour
 * la prospection agences. Permet de saisir une agence en champ libre : on
 * réutilise un Partner existant (nom insensible à la casse) ou on en crée un
 * nouveau avec un slug unique (talent book par défaut, /partners/{slug}).
 *
 * Lien Marque ↔ Partner : enregistrement CRM uniquement (pas d'enrôlement
 * Outreach Clients — le contact reste côté AgencyContact).
 *
 * Sync carto : si un contact marque a un email @woo.paris / @nicework.fr / …,
 * on rattache automatiquement l'agence sur la fiche CRM.
 */

import { prisma } from "@/lib/prisma";
import {
  emailDomain,
  isGenericEmailDomain,
} from "@/lib/marque-resolver";
import {
  KNOWN_AGENCY_DOMAINS,
  agencyNameFromEmailDomain,
  agencyNameFromPerimetre,
} from "@/lib/agency-domains";
import { tryEnrollAgencyAfterEmailComplete } from "@/lib/agency-contact-email";

export {
  KNOWN_AGENCY_DOMAINS,
  agencyNameFromEmailDomain,
  agencyNameFromPerimetre,
};

/** Alias de noms Partner déjà en base → nom canonique. */
const AGENCY_NAME_ALIASES: Record<string, string[]> = {
  "WOÔ": ["WOÔ", "WOO", "Woo", "WOO Paris", "WOO - Groupe L'oreal", "WOO - Groupe L’oreal"],
  "Nice Work": ["Nice Work", "NiceWork", "Nice Work Paris", "Nice work"],
  Monks: ["Monks", "MediaMonks", "Media Monks", "MEDIA MONKS PARIS", "Monks Paris"],
  YKONE: ["YKONE", "Ykone"],
  Matriochka: ["Matriochka", "Matriochka Influences"],
  Obviously: ["Obviously", "Obviously.com"],
  "The Utopia": ["The Utopia", "theutopia", "Utopia"],
  Burson: ["Burson", "Burson Global", "BCW"],
};

async function findPartnerByCanonicalOrAlias(
  canonicalName: string
): Promise<{ id: string; name: string; slug: string; market: string } | null> {
  const aliases = AGENCY_NAME_ALIASES[canonicalName] || [canonicalName];
  for (const alias of aliases) {
    const hit = await prisma.partner.findFirst({
      where: { name: { equals: alias, mode: "insensitive" } },
      select: { id: true, name: true, slug: true, market: true },
    });
    if (hit) return hit;
  }
  // Contient (ex. "WOO - Groupe L'oreal")
  const fuzzy = await prisma.partner.findFirst({
    where: {
      OR: aliases.map((a) => ({
        name: { contains: a, mode: "insensitive" as const },
      })),
    },
    select: { id: true, name: true, slug: true, market: true },
  });
  return fuzzy;
}

export function slugifyPartner(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .substring(0, 50);
}

export async function generateUniquePartnerSlug(baseSlug: string): Promise<string> {
  const base = baseSlug || "agence";
  let slug = base;
  let counter = 1;
  for (;;) {
    const existing = await prisma.partner.findUnique({ where: { slug } });
    if (!existing) return slug;
    slug = `${base}-${counter}`;
    counter += 1;
  }
}

export async function findOrCreatePartnerByName(
  name: string,
  createdBy?: string | null
): Promise<{ id: string; name: string; slug: string; market: string }> {
  const trimmed = name.trim();
  const existing = await prisma.partner.findFirst({
    where: { name: { equals: trimmed, mode: "insensitive" } },
    select: { id: true, name: true, slug: true, market: true },
  });
  if (existing) return existing;

  // Filet anti-doublon : même nom écrit différemment (accents, espaces,
  // ponctuation) → même slug normalisé → on réutilise la fiche existante.
  const baseSlug = slugifyPartner(trimmed);
  if (baseSlug) {
    const bySlug = await prisma.partner.findUnique({
      where: { slug: baseSlug },
      select: { id: true, name: true, slug: true, market: true },
    });
    if (bySlug) return bySlug;
  }

  const slug = await generateUniquePartnerSlug(baseSlug);
  return prisma.partner.create({
    data: {
      name: trimmed,
      slug,
      ...(createdBy ? { createdBy } : {}),
    },
    select: { id: true, name: true, slug: true, market: true },
  });
}

/**
 * Attache une agence (Partner) à une fiche marque. Idempotent.
 * Ne crée pas de MarqueContact et n'enrôle pas l'outreach clients.
 */
export async function linkPartnerToMarque(input: {
  marqueId: string;
  partnerId: string;
  source?: string;
  createdById?: string | null;
}): Promise<{ id: string; created: boolean }> {
  const existing = await prisma.marquePartner.findUnique({
    where: {
      marqueId_partnerId: {
        marqueId: input.marqueId,
        partnerId: input.partnerId,
      },
    },
    select: { id: true },
  });
  if (existing) return { id: existing.id, created: false };

  const created = await prisma.marquePartner.create({
    data: {
      marqueId: input.marqueId,
      partnerId: input.partnerId,
      source: (input.source || "INBOUND").trim() || "INBOUND",
      createdById: input.createdById || null,
    },
    select: { id: true },
  });
  return { id: created.id, created: true };
}

/**
 * Résout une agence à partir d'un email (domaine connu ou Partner déjà en base
 * via AgencyContact / contactEmail).
 */
export async function resolveAgencyFromEmail(
  rawEmail: string | null | undefined
): Promise<{ name: string; domain: string; partnerId?: string } | null> {
  const domain = emailDomain(rawEmail);
  if (!domain || isGenericEmailDomain(domain)) return null;

  const known = KNOWN_AGENCY_DOMAINS[domain];
  if (known) {
    const existing = await findPartnerByCanonicalOrAlias(known);
    if (existing) {
      return { name: known, domain, partnerId: existing.id };
    }
    return { name: known, domain };
  }

  const colleague = await prisma.agencyContact.findFirst({
    where: { email: { endsWith: `@${domain}`, mode: "insensitive" } },
    select: { partner: { select: { id: true, name: true } } },
  });
  if (colleague?.partner) {
    return {
      name: colleague.partner.name,
      domain,
      partnerId: colleague.partner.id,
    };
  }

  const partner = await prisma.partner.findFirst({
    where: { contactEmail: { endsWith: `@${domain}`, mode: "insensitive" } },
    select: { id: true, name: true },
  });
  if (partner) {
    return { name: partner.name, domain, partnerId: partner.id };
  }

  return null;
}

/**
 * Scanne les contacts d'une marque : dès qu'un email @monks.com / @woo.paris /
 * @nicework.fr / … apparaît :
 *  1) rattache l'agence Partner sur la fiche marque (source CARTO)
 *  2) crée/maj le contact dans la fiche agence (AgencyContact)
 * Idempotent — n'enrôle pas l'outreach.
 */
export async function syncMarqueAgenciesFromCartoContacts(opts: {
  marqueId: string;
  createdById?: string | null;
}): Promise<{
  linked: number;
  agencyContactsUpserted: number;
  partners: { id: string; name: string }[];
}> {
  const contacts = await prisma.marqueContact.findMany({
    where: {
      marqueId: opts.marqueId,
      OR: [{ source: "CARTO" }, { source: null }, { source: "AO" }],
    },
    select: {
      id: true,
      email: true,
      perimetre: true,
      prenom: true,
      nom: true,
      poste: true,
      language: true,
    },
    take: 500,
  });

  type Bucket = {
    name: string;
    partnerId?: string;
    people: {
      marqueContactId: string;
      email: string;
      prenom: string;
      nom: string | null;
      poste: string | null;
      language: string;
    }[];
  };

  const byName = new Map<string, Bucket>();

  const addPerson = (
    key: string,
    name: string,
    partnerId: string | undefined,
    person: Bucket["people"][number] | null
  ) => {
    let bucket = byName.get(key);
    if (!bucket) {
      bucket = { name, partnerId, people: [] };
      byName.set(key, bucket);
    } else if (partnerId && !bucket.partnerId) {
      bucket.partnerId = partnerId;
    }
    if (person && !bucket.people.some((p) => p.email === person.email)) {
      bucket.people.push(person);
    }
  };

  for (const c of contacts) {
    const email = (c.email || "").trim().toLowerCase();
    const fromEmail = await resolveAgencyFromEmail(email || null);
    if (fromEmail) {
      const key = fromEmail.name.toLowerCase();
      addPerson(
        key,
        fromEmail.name,
        fromEmail.partnerId,
        email
          ? {
              marqueContactId: c.id,
              email,
              prenom: (c.prenom || "").trim() || c.nom.trim() || "Contact",
              nom: c.prenom ? c.nom.trim() : null,
              poste: c.poste,
              language: c.language || "fr",
            }
          : null
      );
      continue;
    }
    const fromPerim = agencyNameFromPerimetre(c.perimetre);
    if (fromPerim) {
      // Périmètre « Agence X » sans email : lie l'agence CRM ; le contact
      // reste enrichissable, puis route vers prospection agence au « Prêt ».
      addPerson(fromPerim.toLowerCase(), fromPerim, undefined, null);
    }
  }

  const partners: { id: string; name: string }[] = [];
  let linked = 0;
  let agencyContactsUpserted = 0;

  for (const entry of byName.values()) {
    let resolved = entry.partnerId
      ? await prisma.partner.findUnique({
          where: { id: entry.partnerId },
          select: { id: true, name: true, slug: true, market: true },
        })
      : null;
    if (!resolved) {
      resolved = await findPartnerByCanonicalOrAlias(entry.name);
    }
    if (!resolved) {
      resolved = await findOrCreatePartnerByName(
        entry.name,
        opts.createdById || null
      );
    }

    const result = await linkPartnerToMarque({
      marqueId: opts.marqueId,
      partnerId: resolved.id,
      source: "CARTO",
      createdById: opts.createdById || null,
    });
    if (result.created) linked += 1;
    if (!partners.some((p) => p.id === resolved!.id)) {
      partners.push({ id: resolved.id, name: resolved.name });
    }

    for (const person of entry.people) {
      try {
        const existing = await prisma.agencyContact.findFirst({
          where: {
            partnerId: resolved.id,
            email: { equals: person.email, mode: "insensitive" },
          },
          select: { id: true },
        });
        if (existing) {
          await prisma.agencyContact.update({
            where: { id: existing.id },
            data: {
              prenom: person.prenom,
              nom: person.nom,
              poste: person.poste,
              language: person.language === "en" ? "en" : "fr",
            },
          });
        } else {
          await prisma.agencyContact.create({
            data: {
              partnerId: resolved.id,
              prenom: person.prenom,
              nom: person.nom,
              email: person.email,
              poste: person.poste,
              language: person.language === "en" ? "en" : "fr",
              createdById: opts.createdById || null,
            },
          });
        }
        agencyContactsUpserted += 1;
        // Hors outreach clients — visible uniquement côté Agences.
        await prisma.marqueContact.update({
          where: { id: person.marqueContactId },
          data: { outreachExcluded: true },
        });
      } catch (e) {
        console.warn("[agency-partner] upsert AgencyContact:", person.email, e);
      }
    }
  }

  return { linked, agencyContactsUpserted, partners };
}

/**
 * Dès qu'un MarqueContact a un email d'agence : CRM fiche marque + fiche
 * Partner, exclusion outreach clients, enrôlement prospection agence.
 * Utilisé par lab/carto2 (Prêt enrichissement) et filet anti-enrôlement client.
 */
export async function routeMarqueContactToAgencyProspecting(opts: {
  marqueId: string;
  marqueContactId: string;
  userId: string;
  /** Override UI étape 2 : Partner choisi. */
  partnerId?: string | null;
  /** Override UI étape 2 : nom libre → findOrCreate. */
  partnerName?: string | null;
  /** Override UI : forcer client direct (pas de routage agence). */
  forceClient?: boolean;
}): Promise<{
  routed: boolean;
  partnerId?: string;
  partnerName?: string;
  agencyContactId?: string;
  enrolled: boolean;
}> {
  if (opts.forceClient) return { routed: false, enrolled: false };

  const contact = await prisma.marqueContact.findFirst({
    where: { id: opts.marqueContactId, marqueId: opts.marqueId },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      poste: true,
      language: true,
      perimetre: true,
    },
  });
  if (!contact) return { routed: false, enrolled: false };

  const email = (contact.email || "").trim().toLowerCase();
  const overrideName = (opts.partnerName || "").trim();
  const hasOverride = Boolean(opts.partnerId || overrideName);

  if (!email || !email.includes("@")) {
    // Périmètre / choix UI : lie l'agence CRM, pas d'enrôlement sans email.
    const fromPerim = agencyNameFromPerimetre(contact.perimetre);
    if (!hasOverride && !fromPerim) return { routed: false, enrolled: false };
    let partner = opts.partnerId
      ? await prisma.partner.findUnique({
          where: { id: opts.partnerId },
          select: { id: true, name: true, slug: true, market: true },
        })
      : null;
    if (!partner) {
      partner = await findOrCreatePartnerByName(
        overrideName || fromPerim || "Agence",
        opts.userId
      );
    }
    await linkPartnerToMarque({
      marqueId: opts.marqueId,
      partnerId: partner.id,
      source: "CARTO",
      createdById: opts.userId,
    });
    await prisma.marqueContact.update({
      where: { id: contact.id },
      data: {
        outreachExcluded: true,
        ...(overrideName || fromPerim
          ? {
              perimetre:
                contact.perimetre?.trim() ||
                `Agence ${partner.name}`,
            }
          : {}),
      },
    });
    return {
      routed: true,
      partnerId: partner.id,
      partnerName: partner.name,
      enrolled: false,
    };
  }

  const fromEmail = hasOverride
    ? null
    : await resolveAgencyFromEmail(email);
  const fromPerim =
    !hasOverride && !fromEmail
      ? agencyNameFromPerimetre(contact.perimetre)
      : null;
  if (!hasOverride && !fromEmail && !fromPerim) {
    return { routed: false, enrolled: false };
  }

  let partner = opts.partnerId
    ? await prisma.partner.findUnique({
        where: { id: opts.partnerId },
        select: { id: true, name: true, slug: true, market: true },
      })
    : fromEmail?.partnerId
      ? await prisma.partner.findUnique({
          where: { id: fromEmail.partnerId },
          select: { id: true, name: true, slug: true, market: true },
        })
      : null;
  const canonical =
    overrideName || fromEmail?.name || fromPerim || partner?.name || "Agence";
  if (!partner && overrideName) {
    partner = await findOrCreatePartnerByName(overrideName, opts.userId);
  }
  if (!partner) {
    partner = await findPartnerByCanonicalOrAlias(canonical);
  }
  if (!partner) {
    partner = await findOrCreatePartnerByName(canonical, opts.userId);
  }

  await linkPartnerToMarque({
    marqueId: opts.marqueId,
    partnerId: partner.id,
    source: "CARTO",
    createdById: opts.userId,
  });

  const prenom =
    (contact.prenom || "").trim() || contact.nom.trim() || "Contact";
  const nom = contact.prenom ? contact.nom.trim() : null;
  const language = contact.language === "en" ? "en" : "fr";

  let agencyContact = await prisma.agencyContact.findFirst({
    where: {
      partnerId: partner.id,
      email: { equals: email, mode: "insensitive" },
    },
    select: { id: true },
  });
  if (agencyContact) {
    await prisma.agencyContact.update({
      where: { id: agencyContact.id },
      data: {
        prenom,
        nom,
        poste: contact.poste,
        language,
        emailLookupStatus: "FOUND",
        emailSuggested: null,
        excluded: false,
      },
    });
  } else {
    agencyContact = await prisma.agencyContact.create({
      data: {
        partnerId: partner.id,
        prenom,
        nom,
        email,
        poste: contact.poste,
        language,
        emailLookupStatus: "FOUND",
        createdById: opts.userId,
      },
      select: { id: true },
    });
  }

  await prisma.marqueContact.update({
    where: { id: contact.id },
    data: {
      outreachExcluded: true,
      emailLookupStatus: "FOUND",
      emailSuggested: null,
    },
  });

  const enroll = await tryEnrollAgencyAfterEmailComplete({
    partnerId: partner.id,
    userId: opts.userId,
    contactIds: [agencyContact.id],
  });

  return {
    routed: true,
    partnerId: partner.id,
    partnerName: partner.name,
    agencyContactId: agencyContact.id,
    enrolled: enroll.enrolled > 0,
  };
}
