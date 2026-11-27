import { prisma } from "@/lib/prisma";
import {
  isForbiddenCastingRecipient,
  loadCastingRecipientBlocklist,
} from "@/lib/casting-recipient-guard";

/**
 * Écrit l'email d'un contact BENELUX en respectant la contrainte
 * `@@unique([companyId, email])` de `BeneluxContact`.
 *
 * Deux contacts d'une même entreprise ne peuvent pas partager un email (doublon
 * de personne importé deux fois, ou email générique type `contact@marque.com`).
 * Si un « frère » de la même entreprise porte déjà cet email, le contact courant
 * est un doublon : on le sort simplement de la file d'enrichissement
 * (`FOUND` + `outreachExcluded`) sans violer la contrainte — l'email n'est
 * prospecté qu'une fois via le contact qui le détient déjà (le cycle outreach
 * impose de toute façon un email unique).
 *
 * Retourne `deduped: true` quand le contact a été traité comme doublon.
 * Retourne `blockedAsTalent: true` si l'email est celui d'un talent.
 */
export async function writeBeneluxContactEmail(
  id: string,
  companyId: string,
  email: string
): Promise<{ deduped: boolean; blockedAsTalent?: boolean }> {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();

  const contact = await prisma.beneluxContact.findFirst({
    where: { id, companyId },
    select: {
      prenom: true,
      nom: true,
      company: { select: { nom: true } },
    },
  });
  if (contact) {
    const blocklist = await loadCastingRecipientBlocklist();
    if (
      isForbiddenCastingRecipient(
        {
          email: normalized,
          prenom: contact.prenom,
          nom: contact.nom,
        },
        blocklist,
        // Benelux : L’Oréal / Nyx autorisés (hard-block = FR seulement).
        { brand: contact.company?.nom, market: "BENELUX" }
      )
    ) {
      await prisma.beneluxContact.update({
        where: { id },
        data: {
          emailLookupStatus: "FOUND",
          emailSuggested: null,
          emailLookupQueuedAt: null,
          outreachExcluded: true,
        },
      });
      return { deduped: false, blockedAsTalent: true };
    }
  }

  const sibling = await prisma.beneluxContact.findFirst({
    where: { companyId, email: normalized, id: { not: id } },
    select: { id: true },
  });

  if (sibling) {
    await prisma.beneluxContact.update({
      where: { id },
      data: {
        emailLookupStatus: "FOUND",
        emailSuggested: null,
        outreachExcluded: true,
      },
    });
    return { deduped: true };
  }

  await prisma.beneluxContact.update({
    where: { id },
    data: {
      email: normalized,
      emailLookupStatus: "FOUND",
      emailSuggested: null,
    },
  });

  // Auto-déblocage : talents belges uniquement (≥ 2 emails BE liés).
  try {
    const company = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: { linkedMarqueId: true },
    });
    if (company?.linkedMarqueId) {
      const { tryResolveAwaitingAfterEmailWrite } = await import(
        "@/lib/resolve-awaiting-enrichissement"
      );
      await tryResolveAwaitingAfterEmailWrite(company.linkedMarqueId);
    }
  } catch (e) {
    console.error("writeBeneluxContactEmail auto-resolve:", e);
  }

  return { deduped: false };
}
