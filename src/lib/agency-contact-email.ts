import { prisma } from "@/lib/prisma";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";

/**
 * Écrit l'email d'un contact agence en respectant `@@unique([partnerId, email])`.
 *
 * Si un frère de la même agence porte déjà cet email, le contact courant est un
 * doublon : on le sort de la file (`FOUND` + `excluded`) sans violer la contrainte.
 */
export async function writeAgencyContactEmail(
  id: string,
  partnerId: string,
  email: string
): Promise<{ deduped: boolean }> {
  const sibling = await prisma.agencyContact.findFirst({
    where: { partnerId, email, id: { not: id } },
    select: { id: true },
  });

  if (sibling) {
    await prisma.agencyContact.update({
      where: { id },
      data: {
        emailLookupStatus: "FOUND",
        emailSuggested: null,
        excluded: true,
      },
    });
    return { deduped: true };
  }

  await prisma.agencyContact.update({
    where: { id },
    data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
  });
  return { deduped: false };
}

/** Enrôle dans agency-outreach les contacts d'une agence qui ont un email. */
export async function tryEnrollAgencyAfterEmailComplete(opts: {
  partnerId: string;
  userId: string;
  /** Si fourni, n'enrôle que ces contacts (ceux validés au « Prêt »). */
  contactIds?: string[];
}): Promise<{ enrolled: number; stillQueued: number }> {
  const partner = await prisma.partner.findUnique({
    where: { id: opts.partnerId },
    select: {
      id: true,
      name: true,
      slug: true,
      market: true,
      agencyContacts: {
        where: {
          excluded: false,
          ...(opts.contactIds?.length ? { id: { in: opts.contactIds } } : {}),
        },
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
  if (!partner) return { enrolled: 0, stillQueued: 0 };

  // Si on valide toute la fiche (sans filtre d'ids), on attend qu'il ne reste
  // plus aucun mail manquant sur l'agence hors exclus.
  if (!opts.contactIds?.length) {
    const missingEmail = await prisma.agencyContact.count({
      where: {
        partnerId: opts.partnerId,
        excluded: false,
        emailLookupStatus: { not: "NOT_FOUND" },
        OR: [{ email: null }, { email: "" }],
      },
    });
    if (missingEmail > 0) {
      return { enrolled: 0, stillQueued: missingEmail };
    }
  }

  const market = partner.market === "BENELUX" ? "BENELUX" : "FR";
  let enrolled = 0;

  for (const c of partner.agencyContacts) {
    const email = (c.email || "").trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) continue;

    const conflict = await findCrossPipelineConflict(email, "agency");
    if (conflict) continue;

    const existing = await prisma.agencyOutreachTarget.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) continue;

    await prisma.agencyOutreachTarget.create({
      data: {
        partnerId: partner.id,
        agencyContactId: c.id,
        firstname: c.prenom || c.nom || "Contact",
        lastname: c.nom || null,
        email,
        company: partner.name,
        partnerSlug: partner.slug,
        language: c.language === "en" ? "en" : "fr",
        market,
        createdById: opts.userId,
      },
    });
    await prisma.agencyContact.update({
      where: { id: c.id },
      data: { emailLookupStatus: "FOUND", emailSuggested: null },
    });
    enrolled += 1;
  }

  return { enrolled, stillQueued: 0 };
}
