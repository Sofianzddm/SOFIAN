/**
 * FR ↔ BE : si la même personne existe déjà sur le marché frère, on enrôle
 * les deux cycles (catalogues talents différents). On n'invente jamais une
 * fiche sur l'autre marché — uniquement si elle est déjà présente.
 */

import { prisma } from "@/lib/prisma";
import { contactPersonKey } from "@/lib/contact-person-key";
import {
  enrollOneBeContactNow,
  enrollOneFrContactNow,
} from "@/lib/envoyer-marque-outreach";
import { writeBeneluxContactEmail } from "@/lib/benelux-contact-email";
import { writeMarqueContactEmail } from "@/lib/marque-contact-email";

export type KnownEmailRow = {
  email: string;
  prenom: string | null;
  nom: string | null;
};

/** Emails déjà connus FR (+ BE frère si présent) pour détecter le motif. */
export async function knownEmailsAcrossFrBeForMarque(
  marqueId: string,
  companyName: string
): Promise<{ rows: KnownEmailRow[]; crossMarket: boolean }> {
  const fr = await prisma.marqueContact.findMany({
    where: { marqueId, email: { not: null } },
    select: { email: true, prenom: true, nom: true },
    take: 50,
  });
  const beCompanyId = await findExistingBeneluxCompanyForMarque(
    marqueId,
    companyName,
    { link: false }
  );
  const be = beCompanyId
    ? await prisma.beneluxContact.findMany({
        where: { companyId: beCompanyId, email: { not: null } },
        select: { email: true, prenom: true, nom: true },
        take: 50,
      })
    : [];

  const byEmail = new Map<string, KnownEmailRow>();
  for (const row of [...fr, ...be]) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      prenom: row.prenom,
      nom: row.nom,
    });
  }
  return {
    rows: Array.from(byEmail.values()),
    // Marque présente des deux côtés → motif analysé pour FR + BE.
    crossMarket: Boolean(beCompanyId),
  };
}

/** Emails déjà connus BE (+ FR frère si présent) pour détecter le motif. */
export async function knownEmailsAcrossFrBeForBenelux(
  companyId: string,
  companyName: string
): Promise<{ rows: KnownEmailRow[]; crossMarket: boolean }> {
  const be = await prisma.beneluxContact.findMany({
    where: { companyId, email: { not: null } },
    select: { email: true, prenom: true, nom: true },
    take: 50,
  });
  const marqueId = await findExistingMarqueForBeneluxCompany(
    companyId,
    companyName,
    { link: false }
  );
  const fr = marqueId
    ? await prisma.marqueContact.findMany({
        where: { marqueId, email: { not: null } },
        select: { email: true, prenom: true, nom: true },
        take: 50,
      })
    : [];

  const byEmail = new Map<string, KnownEmailRow>();
  for (const row of [...be, ...fr]) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      prenom: row.prenom,
      nom: row.nom,
    });
  }
  return {
    rows: Array.from(byEmail.values()),
    crossMarket: Boolean(marqueId),
  };
}

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/** Entreprise BE déjà liée / homonyme — sans création. */
export async function findExistingBeneluxCompanyForMarque(
  marqueId: string,
  companyName: string,
  opts?: { link?: boolean }
): Promise<string | null> {
  const linked = await prisma.beneluxCompany.findFirst({
    where: { linkedMarqueId: marqueId },
    select: { id: true },
  });
  if (linked) return linked.id;

  const byName = await prisma.beneluxCompany.findFirst({
    where: { nom: { equals: companyName, mode: "insensitive" } },
    select: { id: true },
  });
  if (!byName) return null;

  if (opts?.link !== false) {
    await prisma.beneluxCompany.update({
      where: { id: byName.id },
      data: { linkedMarqueId: marqueId },
    });
  }
  return byName.id;
}

/** Marque FR déjà liée / homonyme — sans création. */
export async function findExistingMarqueForBeneluxCompany(
  companyId: string,
  companyName: string,
  opts?: { link?: boolean }
): Promise<string | null> {
  const company = await prisma.beneluxCompany.findUnique({
    where: { id: companyId },
    select: { linkedMarqueId: true, nom: true },
  });
  if (company?.linkedMarqueId) return company.linkedMarqueId;

  const byName = await prisma.marque.findFirst({
    where: {
      nom: {
        equals: company?.nom || companyName,
        mode: "insensitive",
      },
    },
    select: { id: true },
  });
  if (!byName) return null;

  if (opts?.link !== false) {
    await prisma.beneluxCompany.update({
      where: { id: companyId },
      data: { linkedMarqueId: byName.id },
    });
  }
  return byName.id;
}

/** True si la marque FR a déjà une fiche entreprise BE (ou inversement). Lecture seule. */
export async function companyExistsOnSiblingMarket(
  market: "FR" | "BENELUX",
  parentId: string,
  companyName: string
): Promise<boolean> {
  if (market === "FR") {
    return Boolean(
      await findExistingBeneluxCompanyForMarque(parentId, companyName, {
        link: false,
      })
    );
  }
  return Boolean(
    await findExistingMarqueForBeneluxCompany(parentId, companyName, {
      link: false,
    })
  );
}

/**
 * Après Prêt Unique FR : si les mêmes personnes existent déjà en BE,
 * synchronise l'email et enrôle le cycle BE.
 */
export async function enrollExistingBeSiblings(opts: {
  marqueId: string;
  userId: string;
  contactIds: string[];
}): Promise<{ enrolled: number; matched: number }> {
  if (opts.contactIds.length === 0) return { enrolled: 0, matched: 0 };

  const frContacts = await prisma.marqueContact.findMany({
    where: { id: { in: opts.contactIds }, marqueId: opts.marqueId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      source: true,
      marque: { select: { nom: true } },
    },
  });
  if (frContacts.length === 0) return { enrolled: 0, matched: 0 };

  const companyName = frContacts[0].marque.nom;
  const beCompanyId = await findExistingBeneluxCompanyForMarque(
    opts.marqueId,
    companyName
  );
  if (!beCompanyId) return { enrolled: 0, matched: 0 };

  const beContacts = await prisma.beneluxContact.findMany({
    where: { companyId: beCompanyId, outreachExcluded: false },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      source: true,
    },
  });
  if (beContacts.length === 0) return { enrolled: 0, matched: 0 };

  const byEmail = new Map<string, (typeof beContacts)[number]>();
  const byPerson = new Map<string, (typeof beContacts)[number]>();
  for (const b of beContacts) {
    const email = (b.email || "").trim().toLowerCase();
    if (email) byEmail.set(email, b);
    const key = contactPersonKey(b.prenom, b.nom);
    if (key) byPerson.set(key, b);
  }

  let matched = 0;
  let enrolled = 0;

  for (const fr of frContacts) {
    if (fr.source === "AO") continue;
    const email = (fr.email || "").trim().toLowerCase();
    const personKey = contactPersonKey(fr.prenom, fr.nom);
    const twin =
      (email ? byEmail.get(email) : undefined) ||
      (personKey ? byPerson.get(personKey) : undefined);
    if (!twin) continue;
    matched += 1;

    if (email && isValidEmail(email)) {
      const twinEmail = (twin.email || "").trim().toLowerCase();
      if (twinEmail !== email) {
        const written = await writeBeneluxContactEmail(
          twin.id,
          beCompanyId,
          email
        );
        if (written.blockedAsTalent) continue;
      } else {
        await prisma.beneluxContact.update({
          where: { id: twin.id },
          data: {
            emailLookupStatus: "FOUND",
            emailSuggested: null,
            emailLookupQueuedAt: null,
          },
        });
      }
    }

    const ok = await enrollOneBeContactNow({
      beneluxContactId: twin.id,
      userId: opts.userId,
      allowFrSibling: true,
    });
    if (ok) enrolled += 1;
  }

  return { enrolled, matched };
}

/**
 * Après Prêt Unique BE : si les mêmes personnes existent déjà en FR,
 * synchronise l'email et enrôle le cycle FR.
 */
export async function enrollExistingFrSiblings(opts: {
  companyId: string;
  userId: string;
  contactIds: string[];
}): Promise<{ enrolled: number; matched: number }> {
  if (opts.contactIds.length === 0) return { enrolled: 0, matched: 0 };

  const beContacts = await prisma.beneluxContact.findMany({
    where: { id: { in: opts.contactIds }, companyId: opts.companyId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      source: true,
      company: { select: { nom: true } },
    },
  });
  if (beContacts.length === 0) return { enrolled: 0, matched: 0 };

  const companyName = beContacts[0].company.nom;
  const marqueId = await findExistingMarqueForBeneluxCompany(
    opts.companyId,
    companyName
  );
  if (!marqueId) return { enrolled: 0, matched: 0 };

  const frContacts = await prisma.marqueContact.findMany({
    where: {
      marqueId,
      outreachExcluded: false,
      diffusionOptOut: false,
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      source: true,
    },
  });
  if (frContacts.length === 0) return { enrolled: 0, matched: 0 };

  const byEmail = new Map<string, (typeof frContacts)[number]>();
  const byPerson = new Map<string, (typeof frContacts)[number]>();
  for (const f of frContacts) {
    const email = (f.email || "").trim().toLowerCase();
    if (email) byEmail.set(email, f);
    const key = contactPersonKey(f.prenom, f.nom);
    if (key) byPerson.set(key, f);
  }

  let matched = 0;
  let enrolled = 0;

  for (const be of beContacts) {
    if (be.source === "AO") continue;
    const email = (be.email || "").trim().toLowerCase();
    const personKey = contactPersonKey(be.prenom, be.nom);
    const twin =
      (email ? byEmail.get(email) : undefined) ||
      (personKey ? byPerson.get(personKey) : undefined);
    if (!twin) continue;
    matched += 1;

    if (email && isValidEmail(email)) {
      const twinEmail = (twin.email || "").trim().toLowerCase();
      if (twinEmail !== email) {
        const written = await writeMarqueContactEmail(twin.id, marqueId, email);
        if (written.blockedAsTalent) continue;
      } else {
        await prisma.marqueContact.update({
          where: { id: twin.id },
          data: {
            emailLookupStatus: "FOUND",
            emailSuggested: null,
            emailLookupQueuedAt: null,
          },
        });
      }
    }

    const ok = await enrollOneFrContactNow({
      marqueContactId: twin.id,
      userId: opts.userId,
      allowBeneluxSibling: true,
    });
    if (ok) enrolled += 1;
  }

  return { enrolled, matched };
}
