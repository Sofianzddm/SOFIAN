/**
 * Transfert d'une fiche entre CRM France (Marque) et annuaire BENELUX
 * (BeneluxCompany). Tables séparées : on copie contacts + cycle outreach,
 * on stoppe les targets du marché source (historique conservé).
 */

import { prisma } from "@/lib/prisma";
import {
  generateUniqueBeneluxSlug,
  slugifyBenelux,
} from "@/lib/benelux-company";
import { findOrCreateMarque } from "@/lib/marque-resolver";

function formatFrDate(d: Date): string {
  return new Intl.DateTimeFormat("fr-FR", {
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(d);
}

function carriedStatus(
  status: "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED"
): "TO_CONTACT" | "WAITING" | "TO_RECONTACT" | "STOPPED" {
  // STOPPED reste STOPPED (ex. Vinciane) ; le reste est reporté tel quel.
  return status;
}

export type TransferResult = {
  targetId: string;
  targetPath: string;
  companyName: string;
  contactsCopied: number;
  targetsMoved: number;
  message: string;
};

/**
 * Marque FR → entreprise BENELUX.
 * La fiche FR est conservée (collabs / historique) avec une note de migration.
 */
export async function transferMarqueToBenelux(opts: {
  marqueId: string;
  userId: string;
}): Promise<TransferResult> {
  const marque = await prisma.marque.findUnique({
    where: { id: opts.marqueId },
    select: {
      id: true,
      nom: true,
      secteur: true,
      siteWeb: true,
      ville: true,
      notes: true,
      contacts: {
        where: {
          OR: [{ source: { not: "AO" } }, { source: null }],
        },
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          language: true,
          principal: true,
          source: true,
          perimetre: true,
          localisation: true,
          priorite: true,
          linkedinUrl: true,
          outreachExcluded: true,
          diffusionOptOut: true,
          emailLookupStatus: true,
          emailLookupQueuedAt: true,
          emailSuggested: true,
        },
      },
    },
  });
  if (!marque) {
    throw Object.assign(new Error("Marque introuvable."), { statusCode: 404 });
  }

  const now = new Date();
  const note =
    `Transférée vers l'annuaire BENELUX le ${formatFrDate(now)}. ` +
    `Collabs, négo et activité CRM restent visibles via la fiche FR liée.`;

  // Entreprise BENELUX : réutilise si même nom, sinon crée + enrichit meta.
  let company = await prisma.beneluxCompany.findFirst({
    where: { nom: { equals: marque.nom, mode: "insensitive" } },
    select: { id: true, nom: true, slug: true, linkedMarqueId: true },
  });
  if (!company) {
    const slug = await generateUniqueBeneluxSlug(slugifyBenelux(marque.nom));
    company = await prisma.beneluxCompany.create({
      data: {
        nom: marque.nom,
        slug,
        secteur: marque.secteur,
        siteWeb: marque.siteWeb,
        ville: marque.ville,
        notes: [marque.notes, note].filter(Boolean).join("\n\n"),
        linkedMarqueId: marque.id,
        createdById: opts.userId,
      },
      select: { id: true, nom: true, slug: true, linkedMarqueId: true },
    });
  } else {
    const existingNotes = (
      await prisma.beneluxCompany.findUnique({
        where: { id: company.id },
        select: { notes: true },
      })
    )?.notes;
    const mergedNotes = [existingNotes, note].filter(Boolean).join("\n\n");
    company = await prisma.beneluxCompany.update({
      where: { id: company.id },
      data: {
        ...(marque.secteur ? { secteur: marque.secteur } : {}),
        ...(marque.siteWeb ? { siteWeb: marque.siteWeb } : {}),
        ...(marque.ville ? { ville: marque.ville } : {}),
        notes: mergedNotes,
        linkedMarqueId: company.linkedMarqueId || marque.id,
      },
      select: { id: true, nom: true, slug: true, linkedMarqueId: true },
    });
  }

  // Contacts
  const emailToBeneluxContactId = new Map<string, string>();
  let contactsCopied = 0;

  for (const c of marque.contacts) {
    const prenom = (c.prenom || c.nom || "Contact").trim();
    const nom = c.prenom ? c.nom : c.nom || null;
    const email = c.email?.trim().toLowerCase() || null;
    const excluded = c.outreachExcluded || c.diffusionOptOut;

    if (email) {
      const existing = await prisma.beneluxContact.findUnique({
        where: { companyId_email: { companyId: company.id, email } },
        select: { id: true },
      });
      if (existing) {
        emailToBeneluxContactId.set(email, existing.id);
        continue;
      }
    }

    const created = await prisma.beneluxContact.create({
      data: {
        companyId: company.id,
        prenom,
        nom,
        email,
        poste: c.poste,
        language: c.language === "en" ? "en" : "fr",
        principal: c.principal,
        source: c.source === "CARTO" ? "CARTO" : c.source || "MANUAL",
        perimetre: c.perimetre,
        localisation: c.localisation,
        priorite: c.priorite,
        linkedinUrl: c.linkedinUrl,
        outreachExcluded: excluded,
        excluded,
        emailLookupStatus: c.emailLookupStatus,
        emailLookupQueuedAt: c.emailLookupQueuedAt,
        emailSuggested: c.emailSuggested,
        createdById: opts.userId,
      },
      select: { id: true, email: true },
    });
    contactsCopied += 1;
    if (created.email) {
      emailToBeneluxContactId.set(created.email.toLowerCase(), created.id);
    }
  }

  // Targets FR liés aux emails de cette fiche (même s'ils sont sur un doublon).
  const emails = [...emailToBeneluxContactId.keys()];
  const frTargets =
    emails.length > 0
      ? await prisma.outreachTarget.findMany({
          where: { email: { in: emails } },
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            language: true,
            status: true,
            fromEmail: true,
            cycleCount: true,
            lastSentAt: true,
            nextRecontactAt: true,
            lastRepliedAt: true,
            draftSubject: true,
            draftBodyHtml: true,
          },
        })
      : [];

  let targetsMoved = 0;
  for (const t of frTargets) {
    const email = t.email.trim().toLowerCase();
    const beneluxContactId = emailToBeneluxContactId.get(email) || null;
    const migrationNote =
      `Transféré CRM France → BENELUX (${company.nom}) le ${formatFrDate(now)}.`;
    const status = carriedStatus(t.status);

    const existingBe = await prisma.beneluxOutreachTarget.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingBe) {
      await prisma.beneluxOutreachTarget.update({
        where: { id: existingBe.id },
        data: {
          companyId: company.id,
          beneluxContactId,
          companyName: company.nom,
          status,
          fromEmail: t.fromEmail,
          cycleCount: t.cycleCount,
          lastSentAt: t.lastSentAt,
          nextRecontactAt: t.nextRecontactAt,
          lastRepliedAt: t.lastRepliedAt,
          draftSubject: t.draftSubject,
          draftBodyHtml: t.draftBodyHtml,
          stoppedAt: status === "STOPPED" ? now : null,
          stoppedById: status === "STOPPED" ? opts.userId : null,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
        },
      });
    } else {
      await prisma.beneluxOutreachTarget.create({
        data: {
          companyId: company.id,
          beneluxContactId,
          firstname: t.firstname,
          lastname: t.lastname,
          email,
          companyName: company.nom,
          language: t.language === "en" ? "en" : "fr",
          status,
          fromEmail: t.fromEmail,
          cycleCount: t.cycleCount,
          lastSentAt: t.lastSentAt,
          nextRecontactAt: t.nextRecontactAt,
          lastRepliedAt: t.lastRepliedAt,
          draftSubject: t.draftSubject,
          draftBodyHtml: t.draftBodyHtml,
          stoppedAt: status === "STOPPED" ? now : null,
          stoppedById: status === "STOPPED" ? opts.userId : null,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
          createdById: opts.userId,
        },
      });
    }

    await prisma.outreachTarget.update({
      where: { id: t.id },
      data: {
        status: "STOPPED",
        stoppedAt: now,
        stoppedById: opts.userId,
        autoRescheduleReason: migrationNote,
        autoRescheduledAt: now,
      },
    });
    targetsMoved += 1;
  }

  // Note sur la fiche FR
  const prevNotes = marque.notes?.trim() || "";
  await prisma.marque.update({
    where: { id: marque.id },
    data: {
      notes: prevNotes ? `${prevNotes}\n\n${note}` : note,
    },
  });

  return {
    targetId: company.id,
    targetPath: `/marques/benelux/${company.id}`,
    companyName: company.nom,
    contactsCopied,
    targetsMoved,
    message: `${company.nom} est maintenant dans l'annuaire BENELUX (${contactsCopied} contact${contactsCopied > 1 ? "s" : ""}, ${targetsMoved} cycle${targetsMoved > 1 ? "s" : ""} déplacé${targetsMoved > 1 ? "s" : ""}).`,
  };
}

/**
 * Entreprise BENELUX → Marque FR.
 * La fiche BENELUX est conservée avec une note de migration.
 */
export async function transferBeneluxToMarque(opts: {
  companyId: string;
  userId: string;
}): Promise<TransferResult> {
  const company = await prisma.beneluxCompany.findUnique({
    where: { id: opts.companyId },
    select: {
      id: true,
      nom: true,
      secteur: true,
      siteWeb: true,
      ville: true,
      notes: true,
      contacts: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          language: true,
          principal: true,
          source: true,
          perimetre: true,
          localisation: true,
          priorite: true,
          linkedinUrl: true,
          outreachExcluded: true,
          emailLookupStatus: true,
          emailLookupQueuedAt: true,
          emailSuggested: true,
        },
      },
    },
  });
  if (!company) {
    throw Object.assign(new Error("Entreprise BENELUX introuvable."), {
      statusCode: 404,
    });
  }

  const now = new Date();
  const note =
    `Transférée vers le CRM France le ${formatFrDate(now)}. ` +
    `Fiche BENELUX conservée pour la trace.`;

  const resolved = await findOrCreateMarque({
    name: company.nom,
    source: "MANUAL",
    createDefaults: {
      secteur: company.secteur,
      siteWeb: company.siteWeb,
      ville: company.ville,
      pays: "Belgique",
      notes: [company.notes, note].filter(Boolean).join("\n\n"),
    },
  });

  const marque = await prisma.marque.findUniqueOrThrow({
    where: { id: resolved.marqueId },
    select: { id: true, nom: true, notes: true },
  });

  if (!resolved.created) {
    const prev = marque.notes?.trim() || "";
    await prisma.marque.update({
      where: { id: marque.id },
      data: {
        secteur: company.secteur ?? undefined,
        siteWeb: company.siteWeb ?? undefined,
        ville: company.ville ?? undefined,
        notes: prev ? `${prev}\n\n${note}` : note,
      },
    });
  }

  const emailToMarqueContactId = new Map<string, string>();
  let contactsCopied = 0;

  for (const c of company.contacts) {
    const email = c.email?.trim().toLowerCase() || null;
    if (email) {
      const existing = await prisma.marqueContact.findFirst({
        where: {
          marqueId: marque.id,
          email: { equals: email, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        emailToMarqueContactId.set(email, existing.id);
        continue;
      }
    }

    const created = await prisma.marqueContact.create({
      data: {
        marqueId: marque.id,
        prenom: c.prenom || null,
        nom: (c.nom || c.prenom || "Contact").trim(),
        email,
        poste: c.poste,
        language: c.language === "en" ? "en" : "fr",
        principal: c.principal,
        source: c.source === "CARTO" ? "CARTO" : c.source || null,
        perimetre: c.perimetre,
        localisation: c.localisation,
        priorite: c.priorite,
        linkedinUrl: c.linkedinUrl,
        outreachExcluded: c.outreachExcluded,
        emailLookupStatus: c.emailLookupStatus,
        emailLookupQueuedAt: c.emailLookupQueuedAt,
        emailSuggested: c.emailSuggested,
      },
      select: { id: true, email: true },
    });
    contactsCopied += 1;
    if (created.email) {
      emailToMarqueContactId.set(created.email.toLowerCase(), created.id);
    }
  }

  const emails = [...emailToMarqueContactId.keys()];
  const beTargets =
    emails.length > 0
      ? await prisma.beneluxOutreachTarget.findMany({
          where: { email: { in: emails } },
          select: {
            id: true,
            firstname: true,
            lastname: true,
            email: true,
            language: true,
            status: true,
            fromEmail: true,
            cycleCount: true,
            lastSentAt: true,
            nextRecontactAt: true,
            lastRepliedAt: true,
            draftSubject: true,
            draftBodyHtml: true,
          },
        })
      : [];

  let targetsMoved = 0;
  for (const t of beTargets) {
    const email = t.email.trim().toLowerCase();
    const marqueContactId = emailToMarqueContactId.get(email) || null;
    const migrationNote =
      `Transféré BENELUX → CRM France (${marque.nom}) le ${formatFrDate(now)}.`;
    const status = carriedStatus(t.status);

    const existingFr = await prisma.outreachTarget.findUnique({
      where: { email },
      select: { id: true },
    });

    if (existingFr) {
      await prisma.outreachTarget.update({
        where: { id: existingFr.id },
        data: {
          marqueId: marque.id,
          marqueContactId,
          company: marque.nom,
          status,
          fromEmail: t.fromEmail,
          cycleCount: t.cycleCount,
          lastSentAt: t.lastSentAt,
          nextRecontactAt: t.nextRecontactAt,
          lastRepliedAt: t.lastRepliedAt,
          draftSubject: t.draftSubject,
          draftBodyHtml: t.draftBodyHtml,
          stoppedAt: status === "STOPPED" ? now : null,
          stoppedById: status === "STOPPED" ? opts.userId : null,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
        },
      });
    } else {
      await prisma.outreachTarget.create({
        data: {
          marqueId: marque.id,
          marqueContactId,
          firstname: t.firstname,
          lastname: t.lastname,
          email,
          company: marque.nom,
          language: t.language === "en" ? "en" : "fr",
          status,
          fromEmail: t.fromEmail,
          cycleCount: t.cycleCount,
          lastSentAt: t.lastSentAt,
          nextRecontactAt: t.nextRecontactAt,
          lastRepliedAt: t.lastRepliedAt,
          draftSubject: t.draftSubject,
          draftBodyHtml: t.draftBodyHtml,
          stoppedAt: status === "STOPPED" ? now : null,
          stoppedById: status === "STOPPED" ? opts.userId : null,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
          createdById: opts.userId,
        },
      });
    }

    await prisma.beneluxOutreachTarget.update({
      where: { id: t.id },
      data: {
        status: "STOPPED",
        stoppedAt: now,
        stoppedById: opts.userId,
        autoRescheduleReason: migrationNote,
        autoRescheduledAt: now,
      },
    });
    targetsMoved += 1;
  }

  const prevBeNotes = company.notes?.trim() || "";
  await prisma.beneluxCompany.update({
    where: { id: company.id },
    data: {
      notes: prevBeNotes ? `${prevBeNotes}\n\n${note}` : note,
    },
  });

  return {
    targetId: marque.id,
    targetPath: `/marques/${marque.id}`,
    companyName: marque.nom,
    contactsCopied,
    targetsMoved,
    message: `${marque.nom} est maintenant dans le CRM France (${contactsCopied} contact${contactsCopied > 1 ? "s" : ""}, ${targetsMoved} cycle${targetsMoved > 1 ? "s" : ""} déplacé${targetsMoved > 1 ? "s" : ""}).`,
  };
}
