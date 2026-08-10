import { prisma } from "@/lib/prisma";

/**
 * Clé personne pour dédup contacts marque / benelux / enrichissement.
 * Tokens triés, sans accents → « Annabelle|Delqué » ≡ « Annabelle Delqué » en nom seul,
 * et « Zeïneb » ≡ « Zeineb » (NFD).
 */
export function contactPersonKey(
  prenom?: string | null,
  nom?: string | null
): string {
  return `${prenom || ""} ${nom || ""}`
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .sort()
    .join(" ");
}

type ContactRow = {
  id: string;
  prenom: string | null;
  nom: string | null;
  email: string | null;
  poste: string | null;
  linkedinUrl: string | null;
  emailLookupStatus: string | null;
};

/**
 * Doublons sans email alors qu'un homonyme a déjà un email sur la fiche :
 * on enrichit éventuellement la fiche connue (poste / LinkedIn) puis on
 * supprime le doublon — sinon la file /enrichissement le redemande.
 * Matching cross-source : si l'email existe déjà (CARTO ou AO), inutile de
 * le redemander en enrichissement.
 */
export async function dismissMarqueEnrichissementDuplicates(
  marqueId: string
): Promise<number> {
  const contacts = await prisma.marqueContact.findMany({
    where: { marqueId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      linkedinUrl: true,
      emailLookupStatus: true,
    },
  });

  const keepByKey = new Map<string, ContactRow>();
  for (const c of contacts) {
    if (!c.email?.trim()) continue;
    const key = contactPersonKey(c.prenom, c.nom);
    if (!key || keepByKey.has(key)) continue;
    keepByKey.set(key, c);
  }
  if (keepByKey.size === 0) return 0;

  let dismissed = 0;
  for (const c of contacts) {
    if (c.email?.trim()) continue;
    if (c.emailLookupStatus === "NOT_FOUND") continue;
    const key = contactPersonKey(c.prenom, c.nom);
    if (!key) continue;
    const keep = keepByKey.get(key);
    if (!keep) continue;

    const patch: { poste?: string; linkedinUrl?: string } = {};
    if (!keep.poste && c.poste) patch.poste = c.poste;
    if (!keep.linkedinUrl && c.linkedinUrl) patch.linkedinUrl = c.linkedinUrl;
    if (Object.keys(patch).length > 0) {
      await prisma.marqueContact.update({
        where: { id: keep.id },
        data: patch,
      });
      Object.assign(keep, patch);
    }

    try {
      await prisma.marqueContactSousMarque.deleteMany({
        where: { contactId: c.id },
      });
      await prisma.marqueContact.delete({ where: { id: c.id } });
    } catch {
      // Lié (quotes / targets) → hors file sans supprimer.
      await prisma.marqueContact.update({
        where: { id: c.id },
        data: {
          emailLookupStatus: "FOUND",
          emailSuggested: null,
          emailLookupQueuedAt: null,
          outreachExcluded: true,
        },
      });
    }
    dismissed += 1;
  }
  return dismissed;
}

export async function dismissBeneluxEnrichissementDuplicates(
  companyId: string
): Promise<number> {
  const contacts = await prisma.beneluxContact.findMany({
    where: { companyId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      linkedinUrl: true,
      emailLookupStatus: true,
    },
  });

  const keepByKey = new Map<string, ContactRow>();
  for (const c of contacts) {
    if (!c.email?.trim()) continue;
    const key = contactPersonKey(c.prenom, c.nom);
    if (!key || keepByKey.has(key)) continue;
    keepByKey.set(key, c);
  }
  if (keepByKey.size === 0) return 0;

  let dismissed = 0;
  for (const c of contacts) {
    if (c.email?.trim()) continue;
    if (c.emailLookupStatus === "NOT_FOUND") continue;
    const key = contactPersonKey(c.prenom, c.nom);
    if (!key) continue;
    const keep = keepByKey.get(key);
    if (!keep) continue;

    const patch: { poste?: string; linkedinUrl?: string } = {};
    if (!keep.poste && c.poste) patch.poste = c.poste;
    if (!keep.linkedinUrl && c.linkedinUrl) patch.linkedinUrl = c.linkedinUrl;
    if (Object.keys(patch).length > 0) {
      await prisma.beneluxContact.update({
        where: { id: keep.id },
        data: patch,
      });
      Object.assign(keep, patch);
    }

    try {
      await prisma.beneluxContact.delete({ where: { id: c.id } });
    } catch {
      await prisma.beneluxContact.update({
        where: { id: c.id },
        data: {
          emailLookupStatus: "FOUND",
          emailSuggested: null,
          emailLookupQueuedAt: null,
          outreachExcluded: true,
        },
      });
    }
    dismissed += 1;
  }
  return dismissed;
}
