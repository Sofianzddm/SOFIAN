import { prisma } from "@/lib/prisma";
import {
  isForbiddenCastingRecipient,
  loadCastingRecipientBlocklist,
} from "@/lib/casting-recipient-guard";

/**
 * Écrit l'email d'un contact marque. S'il existe déjà un frère sur la même
 * fiche avec cet email, le contact courant est un doublon : on le sort de la
 * file (`FOUND` + exclus) sans recopier l'email — un seul enrôlement outreach.
 *
 * Si l'email correspond à un talent (exact ou mail perso détecté), on n'écrit
 * pas l'adresse et on exclut le contact de l'outreach.
 */
export async function writeMarqueContactEmail(
  id: string,
  marqueId: string,
  email: string,
  opts?: {
    /** Cannes / hors cycle : ne jamais remettre outreachExcluded=false. */
    keepOutreachExcluded?: boolean;
  }
): Promise<{ deduped: boolean; blockedAsTalent?: boolean }> {
  const normalized = String(email || "")
    .trim()
    .toLowerCase();

  const contact = await prisma.marqueContact.findFirst({
    where: { id, marqueId },
    select: {
      prenom: true,
      nom: true,
      diffusionOptOut: true,
      marque: { select: { nom: true } },
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
        { brand: contact.marque?.nom }
      )
    ) {
      await prisma.marqueContact.update({
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

  const sibling = await prisma.marqueContact.findFirst({
    where: {
      marqueId,
      email: normalized,
      id: { not: id },
    },
    select: { id: true },
  });

  if (sibling) {
    await prisma.marqueContact.update({
      where: { id },
      data: {
        emailLookupStatus: "FOUND",
        emailSuggested: null,
        emailLookupQueuedAt: null,
        outreachExcluded: true,
      },
    });
    return { deduped: true };
  }

  const forceExcluded =
    opts?.keepOutreachExcluded === true || Boolean(contact?.diffusionOptOut);

  await prisma.marqueContact.update({
    where: { id },
    data: {
      email: normalized,
      emailLookupStatus: "FOUND",
      emailSuggested: null,
      emailLookupQueuedAt: null,
      // Réouvre le contact si un save précédent l'avait exclus à tort
      // (ex. hard-block L’Oréal avant exception Margiela) — sauf Cannes / opt-out.
      ...(forceExcluded ? { outreachExcluded: true } : { outreachExcluded: false }),
    },
  });

  // Auto-déblocage : talents non belges uniquement (≥ 2 emails FR).
  // Les belges ne sont débloqués que via writeBeneluxContactEmail.
  try {
    const { tryResolveAwaitingAfterEmailWrite } = await import(
      "@/lib/resolve-awaiting-enrichissement"
    );
    await tryResolveAwaitingAfterEmailWrite(marqueId);
  } catch (e) {
    console.error("writeMarqueContactEmail auto-resolve:", e);
  }

  return { deduped: false };
}
