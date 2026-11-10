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

type DismissPlan = {
  dismissId: string;
  keepId: string;
  patchKeep: { poste?: string; linkedinUrl?: string };
};

function planDismissals(contacts: ContactRow[]): DismissPlan[] {
  const keepByKey = new Map<string, ContactRow>();
  for (const c of contacts) {
    if (!c.email?.trim()) continue;
    const key = contactPersonKey(c.prenom, c.nom);
    if (!key || keepByKey.has(key)) continue;
    keepByKey.set(key, c);
  }
  if (keepByKey.size === 0) return [];

  const plans: DismissPlan[] = [];
  const patchedKeep = new Map<string, ContactRow>();

  for (const c of contacts) {
    if (c.email?.trim()) continue;
    if (c.emailLookupStatus === "NOT_FOUND") continue;
    const key = contactPersonKey(c.prenom, c.nom);
    if (!key) continue;
    const keep = patchedKeep.get(key) || keepByKey.get(key);
    if (!keep) continue;

    const patch: { poste?: string; linkedinUrl?: string } = {};
    if (!keep.poste && c.poste) patch.poste = c.poste;
    if (!keep.linkedinUrl && c.linkedinUrl) patch.linkedinUrl = c.linkedinUrl;
    if (Object.keys(patch).length > 0) {
      Object.assign(keep, patch);
      patchedKeep.set(key, keep);
    }

    plans.push({
      dismissId: c.id,
      keepId: keep.id,
      patchKeep: patch,
    });
  }
  return plans;
}

async function mapPool<T>(
  items: T[],
  concurrency: number,
  worker: (item: T) => Promise<void>
): Promise<void> {
  if (items.length === 0) return;
  const limit = Math.max(1, concurrency);
  let next = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const idx = next;
      next += 1;
      await worker(items[idx]);
    }
  });
  await Promise.all(runners);
}

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
  const dismissed = await dismissMarqueEnrichissementDuplicatesBatch([marqueId]);
  return dismissed.size;
}

/** Version batch : 1 lecture pour N marques, puis purges en parallèle bornée. */
export async function dismissMarqueEnrichissementDuplicatesBatch(
  marqueIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(marqueIds.filter(Boolean)));
  const dismissed = new Set<string>();
  if (ids.length === 0) return dismissed;

  const contacts = await prisma.marqueContact.findMany({
    where: { marqueId: { in: ids } },
    select: {
      id: true,
      marqueId: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      linkedinUrl: true,
      emailLookupStatus: true,
    },
  });

  const byMarque = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const list = byMarque.get(c.marqueId) || [];
    list.push(c);
    byMarque.set(c.marqueId, list);
  }

  const plans: DismissPlan[] = [];
  for (const list of byMarque.values()) {
    plans.push(...planDismissals(list));
  }
  if (plans.length === 0) return dismissed;

  // Patches keep d'abord (peu nombreux), puis dismiss.
  const keepPatches = new Map<string, { poste?: string; linkedinUrl?: string }>();
  for (const p of plans) {
    if (Object.keys(p.patchKeep).length === 0) continue;
    const prev = keepPatches.get(p.keepId) || {};
    keepPatches.set(p.keepId, { ...prev, ...p.patchKeep });
  }
  await mapPool(Array.from(keepPatches.entries()), 8, async ([keepId, data]) => {
    await prisma.marqueContact.update({ where: { id: keepId }, data });
  });

  await mapPool(plans, 8, async (p) => {
    try {
      await prisma.marqueContactSousMarque.deleteMany({
        where: { contactId: p.dismissId },
      });
      await prisma.marqueContact.delete({ where: { id: p.dismissId } });
    } catch {
      // Lié (quotes / targets) → hors file sans supprimer.
      await prisma.marqueContact.update({
        where: { id: p.dismissId },
        data: {
          emailLookupStatus: "FOUND",
          emailSuggested: null,
          emailLookupQueuedAt: null,
          outreachExcluded: true,
        },
      });
    }
    dismissed.add(p.dismissId);
  });

  return dismissed;
}

export async function dismissBeneluxEnrichissementDuplicates(
  companyId: string
): Promise<number> {
  const dismissed = await dismissBeneluxEnrichissementDuplicatesBatch([companyId]);
  return dismissed.size;
}

/** Version batch : 1 lecture pour N entreprises BE, puis purges en parallèle bornée. */
export async function dismissBeneluxEnrichissementDuplicatesBatch(
  companyIds: string[]
): Promise<Set<string>> {
  const ids = Array.from(new Set(companyIds.filter(Boolean)));
  const dismissed = new Set<string>();
  if (ids.length === 0) return dismissed;

  const contacts = await prisma.beneluxContact.findMany({
    where: { companyId: { in: ids } },
    select: {
      id: true,
      companyId: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      linkedinUrl: true,
      emailLookupStatus: true,
    },
  });

  const byCompany = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const list = byCompany.get(c.companyId) || [];
    list.push(c);
    byCompany.set(c.companyId, list);
  }

  const plans: DismissPlan[] = [];
  for (const list of byCompany.values()) {
    plans.push(...planDismissals(list));
  }
  if (plans.length === 0) return dismissed;

  const keepPatches = new Map<string, { poste?: string; linkedinUrl?: string }>();
  for (const p of plans) {
    if (Object.keys(p.patchKeep).length === 0) continue;
    const prev = keepPatches.get(p.keepId) || {};
    keepPatches.set(p.keepId, { ...prev, ...p.patchKeep });
  }
  await mapPool(Array.from(keepPatches.entries()), 8, async ([keepId, data]) => {
    await prisma.beneluxContact.update({ where: { id: keepId }, data });
  });

  await mapPool(plans, 8, async (p) => {
    try {
      await prisma.beneluxContact.delete({ where: { id: p.dismissId } });
    } catch {
      await prisma.beneluxContact.update({
        where: { id: p.dismissId },
        data: {
          emailLookupStatus: "FOUND",
          emailSuggested: null,
          emailLookupQueuedAt: null,
          outreachExcluded: true,
        },
      });
    }
    dismissed.add(p.dismissId);
  });

  return dismissed;
}
