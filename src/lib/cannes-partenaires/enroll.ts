/**
 * Après commit carto Cannes : crée / met à jour une OpportuniteMarque
 * sur le projet cannes-partenaires (pas d'enrôlement outreach FR 45j).
 */

import { prisma } from "@/lib/prisma";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";
import {
  CANNES_PARTENAIRES_SLUG,
} from "@/lib/cannes-partenaires/constants";

export type EnrollCannesPartenairesResult = {
  opportuniteId: string;
  created: boolean;
  nomMarque: string;
  contactsCopied: number;
};

export async function enrollMarqueInCannesPartenaires(opts: {
  marqueId: string;
  createdById?: string | null;
  angleNote?: string | null;
}): Promise<EnrollCannesPartenairesResult> {
  const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);

  const marque = await prisma.marque.findUnique({
    where: { id: opts.marqueId },
    select: {
      id: true,
      nom: true,
      secteur: true,
      contacts: {
        select: { prenom: true, nom: true, email: true, poste: true },
      },
    },
  });
  if (!marque) {
    throw new Error("Marque introuvable pour enrôlement Cannes Partenaires");
  }

  const contactsOpportunite = marque.contacts
    .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((c.email || "").trim()))
    .map((c) => ({
      firstName: (c.prenom || "").trim(),
      lastName: (c.nom || "").trim(),
      email: (c.email as string).trim().toLowerCase(),
      role: (c.poste || "").trim(),
    }));

  const existing = await prisma.opportuniteMarque.findFirst({
    where: { projetId: projet.id, marqueId: marque.id },
    select: { id: true, contacts: true, contactQualifie: true },
  });

  if (existing) {
    // Enrichit les contacts si on en a de nouveaux avec email
    const prev = Array.isArray(existing.contacts) ? existing.contacts : [];
    const prevEmails = new Set(
      (prev as Array<{ email?: string }>)
        .map((c) => String(c.email || "").toLowerCase())
        .filter(Boolean)
    );
    const merged = [
      ...(prev as object[]),
      ...contactsOpportunite.filter((c) => !prevEmails.has(c.email)),
    ];
    const updated = await prisma.opportuniteMarque.update({
      where: { id: existing.id },
      data: {
        contacts: merged,
        contactQualifie: merged.length > 0 || existing.contactQualifie,
        angleNote: opts.angleNote?.trim() || undefined,
      },
      select: { id: true, nomMarque: true },
    });
    return {
      opportuniteId: updated.id,
      created: false,
      nomMarque: updated.nomMarque,
      contactsCopied: contactsOpportunite.length,
    };
  }

  const created = await prisma.opportuniteMarque.create({
    data: {
      projetId: projet.id,
      nomMarque: marque.nom,
      marqueId: marque.id,
      secteur: marque.secteur || null,
      angleNote:
        opts.angleNote?.trim() ||
        "Import carto Cannes Partenaires — Festival de Cannes",
      typeActivation: "CANNES_PARTENARIAT",
      createdById: opts.createdById ?? null,
      statut: contactsOpportunite.length > 0 ? "IDENTIFIEE" : "A_QUALIFIER",
      contacts: contactsOpportunite,
      contactQualifie: contactsOpportunite.length > 0,
      talents: [],
    },
    select: { id: true, nomMarque: true },
  });

  return {
    opportuniteId: created.id,
    created: true,
    nomMarque: created.nomMarque,
    contactsCopied: contactsOpportunite.length,
  };
}
