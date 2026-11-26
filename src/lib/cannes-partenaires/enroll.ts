/**
 * Après commit carto Cannes : crée / met à jour une OpportuniteMarque
 * sur le projet cannes-partenaires (pas d'enrôlement outreach FR 45j).
 *
 * Copie TOUS les contacts isolés Cannes dans opportunite.contacts
 * (même sans email) pour que le CRM Cannes les affiche immédiatement.
 */

import { prisma } from "@/lib/prisma";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";
import {
  CANNES_PARTENAIRES_SLUG,
} from "@/lib/cannes-partenaires/constants";
import { cannesContactWhere } from "@/lib/cannes-partenaires/contacts";

export type EnrollCannesPartenairesResult = {
  opportuniteId: string;
  created: boolean;
  nomMarque: string;
  contactsCopied: number;
};

type OppContact = {
  firstName: string;
  lastName: string;
  email: string;
  role: string;
};

function contactKey(c: OppContact): string {
  const email = c.email.trim().toLowerCase();
  if (email) return `e:${email}`;
  return `n:${c.firstName.trim().toLowerCase()}|${c.lastName.trim().toLowerCase()}`;
}

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
        // Uniquement contacts isolés Cannes — jamais les contacts CRM outreach.
        where: cannesContactWhere,
        select: { prenom: true, nom: true, email: true, poste: true },
      },
    },
  });
  if (!marque) {
    throw new Error("Marque introuvable pour enrôlement Cannes Partenaires");
  }

  const contactsOpportunite: OppContact[] = marque.contacts.map((c) => ({
    firstName: (c.prenom || "").trim(),
    lastName: (c.nom || "").trim(),
    email: (c.email || "").trim().toLowerCase(),
    role: (c.poste || "").trim(),
  }));

  const withEmail = contactsOpportunite.filter((c) =>
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(c.email)
  );

  const existing = await prisma.opportuniteMarque.findFirst({
    where: { projetId: projet.id, marqueId: marque.id },
    select: { id: true, contacts: true, contactQualifie: true },
  });

  if (existing) {
    const prev = Array.isArray(existing.contacts)
      ? (existing.contacts as OppContact[])
      : [];
    const seen = new Set(prev.map(contactKey));
    const merged = [...prev];
    for (const c of contactsOpportunite) {
      const key = contactKey(c);
      if (seen.has(key)) {
        // Met à jour l’email / rôle si on enrichit un stub existant
        const idx = merged.findIndex((m) => contactKey(m) === key);
        if (idx >= 0) {
          merged[idx] = {
            ...merged[idx],
            email: c.email || merged[idx].email,
            role: c.role || merged[idx].role,
            firstName: c.firstName || merged[idx].firstName,
            lastName: c.lastName || merged[idx].lastName,
          };
        }
        continue;
      }
      seen.add(key);
      merged.push(c);
    }
    const updated = await prisma.opportuniteMarque.update({
      where: { id: existing.id },
      data: {
        contacts: merged,
        contactQualifie: withEmail.length > 0 || existing.contactQualifie,
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
      statut: withEmail.length > 0 ? "IDENTIFIEE" : "A_QUALIFIER",
      contacts: contactsOpportunite,
      contactQualifie: withEmail.length > 0,
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
