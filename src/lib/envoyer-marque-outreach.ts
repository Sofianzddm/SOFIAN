/**
 * Passage d'une marque (carto influence + AO) vers l'outreach clients.
 *
 * Règles métier :
 * 1. Une marque ne passe jamais en outreach tant que la carto influence
 *    ET l'AO (contacts ou fichier) ne sont pas présents.
 * 2. Les contacts influence sans email partent en enrichissement
 *    (emailLookupStatus=QUEUED) avec une suggestion de motif si possible.
 * 3. Tant qu'il reste des emails à trouver, aucun contact n'est enrôlé.
 * 4. Dès que tous les influence ont un email → création des OutreachTarget.
 * 5. Les contacts AO ne vont jamais dans le cycle outreach.
 */

import { prisma } from "@/lib/prisma";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";
import {
  detectEmailPattern,
  domainFromWebsite,
  suggestEmailsForContact,
} from "@/lib/email-pattern";
import { notifyEnrichissementReady } from "@/lib/emails/notify-enrichissement";

export type EnvoyerOutreachResult =
  | {
      ok: true;
      status: "enrolled" | "queued" | "already_ready";
      message: string;
      enrolled: number;
      queued: number;
      missingAo: false;
      missingInfluence: false;
    }
  | {
      ok: false;
      error: string;
      missingAo?: boolean;
      missingInfluence?: boolean;
      statusCode: number;
    };

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function buildPatternForMarque(marqueId: string, siteWeb: string | null) {
  const known = await prisma.marqueContact.findMany({
    where: {
      marqueId,
      email: { not: null },
      OR: [{ source: "CARTO" }, { source: "AO" }, { source: null }],
    },
    select: { email: true, prenom: true, nom: true },
    take: 50,
  });
  const withEmail = known.filter((k): k is typeof k & { email: string } => Boolean(k.email));
  const pattern = detectEmailPattern(withEmail);
  const fallbackDomain = pattern?.domain || domainFromWebsite(siteWeb);
  return { pattern, fallbackDomain };
}

/**
 * Enrôle tous les contacts influence qui ont un email et ne sont pas déjà
 * dans un cycle / exclus. Retourne le nombre créé.
 */
export async function enrollInfluenceContacts(opts: {
  marqueId: string;
  company: string;
  createdById: string;
}): Promise<number> {
  const contacts = await prisma.marqueContact.findMany({
    where: {
      marqueId: opts.marqueId,
      source: "CARTO",
      outreachExcluded: false,
      email: { not: null },
      outreachTargets: { none: {} },
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      language: true,
    },
  });

  let enrolled = 0;
  for (const c of contacts) {
    const email = (c.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) continue;

    const conflict = await findCrossPipelineConflict(email, "client");
    if (conflict) continue;

    const existing = await prisma.outreachTarget.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.outreachTarget.create({
      data: {
        marqueId: opts.marqueId,
        marqueContactId: c.id,
        firstname: c.prenom || c.nom,
        lastname: c.prenom ? c.nom : null,
        email,
        company: opts.company,
        language: c.language === "en" ? "en" : "fr",
        createdById: opts.createdById,
      },
    });
    await prisma.marqueContact.update({
      where: { id: c.id },
      data: {
        emailLookupStatus: "FOUND",
        emailSuggested: null,
      },
    });
    enrolled += 1;
  }
  return enrolled;
}

/**
 * Met en file d'enrichissement tous les contacts influence sans email
 * (suggestions de motif si possible). Ne vérifie PAS l'AO — c'est pour
 * /enrichissement après drop d'une carto. L'enrôlement outreach reste
 * bloqué tant que AO + tous les mails ne sont pas OK (via envoyerMarqueEnOutreach
 * / tryEnrollMarqueAfterEmailComplete).
 */
export async function queueMarqueEnrichissement(opts: {
  marqueId: string;
}): Promise<
  | { ok: true; queued: number; company: string; message: string }
  | { ok: false; error: string; statusCode: number }
> {
  const marque = await prisma.marque.findUnique({
    where: { id: opts.marqueId },
    select: {
      id: true,
      nom: true,
      siteWeb: true,
      contacts: {
        // Influence (CARTO) ET achats/appel d'offre (AO) : on complète les
        // emails manquants des deux feuilles. Seuls les CARTO seront ensuite
        // enrôlés en outreach (cf. enrollInfluenceContacts).
        where: { source: { in: ["CARTO", "AO"] }, outreachExcluded: false },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          emailLookupStatus: true,
        },
      },
    },
  });

  if (!marque) {
    return { ok: false, error: "Marque introuvable.", statusCode: 404 };
  }

  const withoutEmail = marque.contacts.filter((c) => !c.email?.trim());
  if (withoutEmail.length === 0) {
    return {
      ok: true,
      queued: 0,
      company: marque.nom,
      message: `Carto ${marque.nom} : tous les contacts ont déjà un email.`,
    };
  }

  const { pattern, fallbackDomain } = await buildPatternForMarque(
    marque.id,
    marque.siteWeb
  );
  const now = new Date();
  // Contacts réellement nouveaux (pas déjà en file) → base de la notification.
  const newlyQueued = withoutEmail.filter(
    (c) => c.emailLookupStatus !== "QUEUED"
  ).length;
  for (const c of withoutEmail) {
    const suggestions = suggestEmailsForContact({
      prenom: c.prenom,
      nom: c.nom,
      pattern,
      fallbackDomain,
    });
    await prisma.marqueContact.update({
      where: { id: c.id },
      data: {
        emailLookupStatus: "QUEUED",
        emailLookupQueuedAt:
          c.emailLookupStatus === "QUEUED" ? undefined : now,
        emailSuggested: suggestions[0]?.email || null,
      },
    });
  }

  if (newlyQueued > 0) {
    await notifyEnrichissementReady({
      company: marque.nom,
      market: "FR",
      count: newlyQueued,
    });
  }

  return {
    ok: true,
    queued: withoutEmail.length,
    company: marque.nom,
    message: `${marque.nom} : ${withoutEmail.length} email${withoutEmail.length > 1 ? "s" : ""} à trouver.`,
  };
}

/** File enrichissement pour une entreprise BENELUX. */
export async function queueBeneluxEnrichissement(opts: {
  companyId: string;
}): Promise<
  | { ok: true; queued: number; company: string; message: string }
  | { ok: false; error: string; statusCode: number }
> {
  const company = await prisma.beneluxCompany.findUnique({
    where: { id: opts.companyId },
    select: {
      id: true,
      nom: true,
      siteWeb: true,
      contacts: {
        where: { source: { in: ["CARTO", "AO"] }, outreachExcluded: false },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          emailLookupStatus: true,
        },
      },
    },
  });

  if (!company) {
    return { ok: false, error: "Entreprise BENELUX introuvable.", statusCode: 404 };
  }

  const withoutEmail = company.contacts.filter((c) => !c.email?.trim());
  if (withoutEmail.length === 0) {
    return {
      ok: true,
      queued: 0,
      company: company.nom,
      message: `Carto ${company.nom} : tous les contacts ont déjà un email.`,
    };
  }

  const known = await prisma.beneluxContact.findMany({
    where: { companyId: company.id, email: { not: null } },
    select: { email: true, prenom: true, nom: true },
    take: 50,
  });
  const pattern = detectEmailPattern(
    known.filter((k): k is typeof k & { email: string } => Boolean(k.email))
  );
  const fallbackDomain = pattern?.domain || domainFromWebsite(company.siteWeb);
  const now = new Date();
  const newlyQueued = withoutEmail.filter(
    (c) => c.emailLookupStatus !== "QUEUED"
  ).length;
  for (const c of withoutEmail) {
    const suggestions = suggestEmailsForContact({
      prenom: c.prenom,
      nom: c.nom,
      pattern,
      fallbackDomain,
    });
    await prisma.beneluxContact.update({
      where: { id: c.id },
      data: {
        emailLookupStatus: "QUEUED",
        emailLookupQueuedAt: c.emailLookupStatus === "QUEUED" ? undefined : now,
        emailSuggested: suggestions[0]?.email || null,
      },
    });
  }

  if (newlyQueued > 0) {
    await notifyEnrichissementReady({
      company: company.nom,
      market: "BENELUX",
      count: newlyQueued,
    });
  }

  return {
    ok: true,
    queued: withoutEmail.length,
    company: company.nom,
    message: `${company.nom} (BENELUX) : ${withoutEmail.length} email${withoutEmail.length > 1 ? "s" : ""} à trouver.`,
  };
}

/**
 * Action principale : « Envoyer la carto en outreach ».
 */
export async function envoyerMarqueEnOutreach(opts: {
  marqueId: string;
  userId: string;
}): Promise<EnvoyerOutreachResult> {
  const marque = await prisma.marque.findUnique({
    where: { id: opts.marqueId },
    select: {
      id: true,
      nom: true,
      siteWeb: true,
      contacts: {
        where: {
          OR: [{ source: "CARTO" }, { source: "AO" }],
          outreachExcluded: false,
        },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          source: true,
          emailLookupStatus: true,
        },
      },
      cartoFiles: {
        where: { kind: "AO" },
        select: { id: true },
        take: 1,
      },
    },
  });

  if (!marque) {
    return { ok: false, error: "Marque introuvable.", statusCode: 404 };
  }

  const influence = marque.contacts.filter((c) => c.source === "CARTO");
  const aoContacts = marque.contacts.filter((c) => c.source === "AO");
  const hasAo = aoContacts.length > 0 || marque.cartoFiles.length > 0;

  if (influence.length === 0) {
    return {
      ok: false,
      error: "Importe d'abord la cartographie influence (feuille 1) avant d'envoyer en outreach.",
      missingInfluence: true,
      statusCode: 400,
    };
  }

  if (!hasAo) {
    return {
      ok: false,
      error:
        "L'AO (feuille 2 / Achats) doit être importée avant de passer cette marque en outreach.",
      missingAo: true,
      statusCode: 400,
    };
  }

  const withoutEmail = influence.filter((c) => !c.email?.trim());
  const { pattern, fallbackDomain } = await buildPatternForMarque(
    marque.id,
    marque.siteWeb
  );

  if (withoutEmail.length > 0) {
    const now = new Date();
    for (const c of withoutEmail) {
      const suggestions = suggestEmailsForContact({
        prenom: c.prenom,
        nom: c.nom,
        pattern,
        fallbackDomain,
      });
      await prisma.marqueContact.update({
        where: { id: c.id },
        data: {
          emailLookupStatus: "QUEUED",
          emailLookupQueuedAt: c.emailLookupStatus === "QUEUED" ? undefined : now,
          emailSuggested: suggestions[0]?.email || null,
        },
      });
    }

    return {
      ok: true,
      status: "queued",
      message: `${withoutEmail.length} contact${withoutEmail.length > 1 ? "s" : ""} sans email → enrichissement. La marque entrera en outreach quand tous les mails seront complétés.`,
      enrolled: 0,
      queued: withoutEmail.length,
      missingAo: false,
      missingInfluence: false,
    };
  }

  const enrolled = await enrollInfluenceContacts({
    marqueId: marque.id,
    company: marque.nom,
    createdById: opts.userId,
  });

  return {
    ok: true,
    status: enrolled > 0 ? "enrolled" : "already_ready",
    message:
      enrolled > 0
        ? `${enrolled} contact${enrolled > 1 ? "s" : ""} ajouté${enrolled > 1 ? "s" : ""} au cycle Outreach.`
        : "Tous les contacts influence ont déjà un email et sont (ou étaient) dans le cycle.",
    enrolled,
    queued: 0,
    missingAo: false,
    missingInfluence: false,
  };
}

/**
 * Après complétion d'un email (enrichissement) : si plus aucun QUEUED
 * sur la marque et que l'AO est présent → enrôler automatiquement.
 */
export async function tryEnrollMarqueAfterEmailComplete(opts: {
  marqueId: string;
  userId: string;
}): Promise<{ enrolled: number; stillQueued: number }> {
  const marque = await prisma.marque.findUnique({
    where: { id: opts.marqueId },
    select: {
      id: true,
      nom: true,
      contacts: {
        where: { source: "CARTO", outreachExcluded: false },
        select: { id: true, email: true, emailLookupStatus: true },
      },
      cartoFiles: { where: { kind: "AO" }, select: { id: true }, take: 1 },
    },
  });
  if (!marque) return { enrolled: 0, stillQueued: 0 };

  const aoCount = await prisma.marqueContact.count({
    where: { marqueId: marque.id, source: "AO" },
  });
  const hasAo = aoCount > 0 || marque.cartoFiles.length > 0;
  if (!hasAo) return { enrolled: 0, stillQueued: 0 };

  const stillQueued = marque.contacts.filter(
    (c) => !c.email?.trim() || c.emailLookupStatus === "QUEUED"
  ).length;
  // Encore des mails manquants → on n'enrôle personne.
  const missingEmail = marque.contacts.filter((c) => !c.email?.trim()).length;
  if (missingEmail > 0) {
    return { enrolled: 0, stillQueued: missingEmail };
  }

  const enrolled = await enrollInfluenceContacts({
    marqueId: marque.id,
    company: marque.nom,
    createdById: opts.userId,
  });
  return { enrolled, stillQueued: 0 };
}

/** Enrôle les contacts BENELUX avec email dès qu'il n'en manque plus. */
export async function tryEnrollBeneluxAfterEmailComplete(opts: {
  companyId: string;
  userId: string;
}): Promise<{ enrolled: number; stillQueued: number }> {
  const company = await prisma.beneluxCompany.findUnique({
    where: { id: opts.companyId },
    select: {
      id: true,
      nom: true,
      contacts: {
        where: { source: "CARTO", outreachExcluded: false },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          language: true,
          emailLookupStatus: true,
        },
      },
    },
  });
  if (!company) return { enrolled: 0, stillQueued: 0 };

  const missingEmail = company.contacts.filter((c) => !c.email?.trim()).length;
  if (missingEmail > 0) {
    return { enrolled: 0, stillQueued: missingEmail };
  }

  let enrolled = 0;
  for (const c of company.contacts) {
    const email = (c.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    const conflict = await findCrossPipelineConflict(email, "benelux");
    if (conflict) continue;

    const existing = await prisma.beneluxOutreachTarget.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.beneluxOutreachTarget.create({
      data: {
        companyId: company.id,
        beneluxContactId: c.id,
        firstname: c.prenom || c.nom || "Contact",
        lastname: c.nom || null,
        email,
        companyName: company.nom,
        language: c.language === "en" ? "en" : "fr",
        createdById: opts.userId,
      },
    });
    await prisma.beneluxContact.update({
      where: { id: c.id },
      data: { emailLookupStatus: "FOUND", emailSuggested: null },
    });
    enrolled += 1;
  }
  return { enrolled, stillQueued: 0 };
}

export async function getEmailSuggestionsForContact(contactId: string) {
  const contact = await prisma.marqueContact.findUnique({
    where: { id: contactId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      emailSuggested: true,
      marqueId: true,
      marque: { select: { siteWeb: true } },
    },
  });
  if (!contact) return null;

  const { pattern, fallbackDomain } = await buildPatternForMarque(
    contact.marqueId,
    contact.marque.siteWeb
  );
  const suggestions = suggestEmailsForContact({
    prenom: contact.prenom,
    nom: contact.nom,
    pattern,
    fallbackDomain,
  });
  return { suggestions, pattern, emailSuggested: contact.emailSuggested };
}
