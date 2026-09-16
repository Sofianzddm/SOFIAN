import type { Prisma } from "@prisma/client";
import prisma from "@/lib/prisma";
import { contactPersonKey } from "@/lib/contact-person-key";

type Tx = Prisma.TransactionClient;

type ContactRow = {
  id: string;
  prenom: string | null;
  nom: string;
  email: string | null;
  source: string | null;
  principal: boolean;
  outreachExcluded: boolean;
  diffusionOptOut: boolean;
  _count: { outreachTargets: number };
};

function contactMatchKey(c: {
  prenom: string | null;
  nom: string;
  email: string | null;
  source?: string | null;
}): string | null {
  // AO et carto influence restent séparés (même email possible sur les deux feuilles).
  const bucket =
    String(c.source || "")
      .trim()
      .toUpperCase() === "AO"
      ? "AO"
      : "CARTO";
  const email = (c.email || "").trim().toLowerCase();
  if (email) return `${bucket}:email:${email}`;
  const person = contactPersonKey(c.prenom, c.nom);
  return person ? `${bucket}:person:${person}` : null;
}

/** Score pour choisir quel contact garder en cas de doublon. */
function keeperScore(c: ContactRow, emailsInCycle: Set<string>): number {
  let s = 0;
  // Priorité absolue : déjà en cycle outreach (FK ou email matché sur la marque).
  if (c._count.outreachTargets > 0) s += 1000;
  const email = (c.email || "").trim().toLowerCase();
  if (email && emailsInCycle.has(email)) s += 1000;
  if (c.principal) s += 50;
  if (c.diffusionOptOut) s += 40; // conserver l'opt-out client
  if (c.outreachExcluded) s += 10;
  if (c.email) s += 5;
  return s;
}

/**
 * Recolle les OutreachTarget de la marque à leurs MarqueContact (match email).
 * Si aucun contact n'existe pour l'email, en recrée un depuis le snapshot
 * du target — le cycle ne doit JAMAIS rester orphelin après une fusion.
 */
export async function ensureOutreachContactsLinked(
  tx: Tx,
  marqueId: string
): Promise<{ relinked: number; created: number }> {
  let relinked = 0;
  let created = 0;

  const contacts = await tx.marqueContact.findMany({
    where: { marqueId, email: { not: null } },
    select: { id: true, email: true },
  });
  const byEmail = new Map<string, string>();
  for (const c of contacts) {
    const email = (c.email || "").trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, c.id);
  }

  const targets = await tx.outreachTarget.findMany({
    where: { marqueId },
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      language: true,
      marqueContactId: true,
    },
  });

  for (const t of targets) {
    const email = (t.email || "").trim().toLowerCase();
    if (!email) continue;

    let contactId = byEmail.get(email) || null;
    if (!contactId) {
      const createdContact = await tx.marqueContact.create({
        data: {
          marqueId,
          prenom: (t.firstname || "").trim() || null,
          nom: (t.lastname || "").trim() || (t.firstname || "").trim() || email.split("@")[0],
          email,
          language: t.language === "en" ? "en" : "fr",
        },
        select: { id: true },
      });
      contactId = createdContact.id;
      byEmail.set(email, contactId);
      created += 1;
    }

    if (t.marqueContactId !== contactId) {
      await tx.outreachTarget.update({
        where: { id: t.id },
        data: { marqueContactId: contactId },
      });
      relinked += 1;
    }
  }

  return { relinked, created };
}

/** @deprecated Prefer ensureOutreachContactsLinked */
export async function relinkOutreachTargetsByEmail(
  tx: Tx,
  marqueId: string
): Promise<number> {
  const r = await ensureOutreachContactsLinked(tx, marqueId);
  return r.relinked + r.created;
}

/**
 * Fusionne les contacts doublons d'une marque (même email, sinon même
 * prénom+nom). Conserve en priorité celui déjà en cycle Outreach, puis le
 * principal / le plus complet. Réassigne les FK puis supprime les perdants.
 */
export async function dedupeMarqueContacts(
  tx: Tx,
  marqueId: string
): Promise<{ removed: number; kept: number }> {
  const cycleEmails = await tx.outreachTarget.findMany({
    where: { marqueId, status: { not: "STOPPED" } },
    select: { email: true },
  });
  const emailsInCycle = new Set(
    cycleEmails.map((t) => t.email.trim().toLowerCase()).filter(Boolean)
  );

  const contacts = await tx.marqueContact.findMany({
    where: { marqueId },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      source: true,
      principal: true,
      outreachExcluded: true,
      diffusionOptOut: true,
      _count: { select: { outreachTargets: true } },
    },
  });

  const byKey = new Map<string, ContactRow[]>();
  for (const c of contacts) {
    const key = contactMatchKey(c);
    if (!key) continue;
    const arr = byKey.get(key) ?? [];
    arr.push(c);
    byKey.set(key, arr);
  }

  let removed = 0;
  let kept = 0;

  for (const group of byKey.values()) {
    if (group.length < 2) continue;
    group.sort((a, b) => keeperScore(b, emailsInCycle) - keeperScore(a, emailsInCycle));
    const winner = group[0];
    const losers = group.slice(1);
    kept += 1;

    const anyPrincipal = group.some((c) => c.principal);
    const anyOptOut = group.some((c) => c.diffusionOptOut);
    const anyExcluded = group.some((c) => c.outreachExcluded);
    await tx.marqueContact.update({
      where: { id: winner.id },
      data: {
        principal: anyPrincipal || winner.principal,
        diffusionOptOut: anyOptOut,
        diffusionOptOutAt: anyOptOut ? new Date() : null,
        outreachExcluded: anyOptOut || anyExcluded,
      },
    });

    for (const loser of losers) {
      // TOUJOURS réassigner le cycle AVANT delete (sinon onDelete: SetNull → orphelin).
      await tx.outreachTarget.updateMany({
        where: { marqueContactId: loser.id },
        data: { marqueContactId: winner.id },
      });
      const loserEmail = (loser.email || "").trim().toLowerCase();
      if (loserEmail) {
        await tx.outreachTarget.updateMany({
          where: {
            marqueId,
            email: loserEmail,
            OR: [{ marqueContactId: null }, { marqueContactId: loser.id }],
          },
          data: { marqueContactId: winner.id },
        });
      }
      await tx.quote.updateMany({
        where: { marqueContactId: loser.id },
        data: { marqueContactId: winner.id },
      });

      const links = await tx.marqueContactSousMarque.findMany({
        where: { contactId: loser.id },
        select: { id: true, marqueId: true },
      });
      for (const link of links) {
        const exists = await tx.marqueContactSousMarque.findUnique({
          where: {
            contactId_marqueId: { contactId: winner.id, marqueId: link.marqueId },
          },
          select: { id: true },
        });
        if (exists) {
          await tx.marqueContactSousMarque.delete({ where: { id: link.id } });
        } else {
          await tx.marqueContactSousMarque.update({
            where: { id: link.id },
            data: { contactId: winner.id },
          });
        }
      }

      await tx.marqueContact.delete({ where: { id: loser.id } });
      removed += 1;
    }
  }

  return { removed, kept };
}

/**
 * Fusionne `sourceMarqueId` dans `targetMarqueId` (la fiche cible est conservée).
 * Déplace tous les FK puis supprime la source. Dédoublonne ensuite les contacts
 * (même email) en gardant en priorité celui déjà en cycle Outreach.
 *
 * Garantie : aucun OutreachTarget actif ne reste orphelin (marqueContactId null).
 * Périmètre : table `Marque` (CRM FR) uniquement.
 */
export async function mergeMarques(
  targetMarqueId: string,
  sourceMarqueId: string
): Promise<{ moved: Record<string, number> }> {
  if (targetMarqueId === sourceMarqueId) {
    throw new Error("Impossible de fusionner une marque avec elle-même.");
  }

  const [target, source] = await Promise.all([
    prisma.marque.findUnique({ where: { id: targetMarqueId }, select: { id: true, nom: true } }),
    prisma.marque.findUnique({ where: { id: sourceMarqueId }, select: { id: true, nom: true } }),
  ]);

  if (!target || !source) {
    throw new Error("Marque source ou cible introuvable.");
  }

  const moved: Record<string, number> = {};

  await prisma.$transaction(async (tx) => {
    const upd = async (model: keyof Prisma.TransactionClient, countKey: string) => {
      const m = tx[model] as { updateMany: (args: unknown) => Promise<{ count: number }> };
      const result = await m.updateMany({
        where: { marqueId: sourceMarqueId },
        data: { marqueId: targetMarqueId },
      });
      if (result.count > 0) moved[countKey] = result.count;
    };

    // 1) Outreach EN PREMIER : FK Marque en CASCADE — ne jamais supprimer la
    // source tant que les targets n'ont pas basculé sur la cible.
    const outreach = await tx.outreachTarget.updateMany({
      where: { marqueId: sourceMarqueId },
      data: { marqueId: targetMarqueId, company: target.nom },
    });
    if (outreach.count > 0) moved.outreachTargets = outreach.count;

    // 2) Reste des relations
    await upd("marqueContact", "contacts");
    await upd("collaboration", "collaborations");
    await upd("negociation", "negociations");
    await upd("prospection", "prospections");
    await upd("demandeGift", "demandesGift");
    await upd("quote", "quotes");
    await upd("inboundOpportunity", "inboundOpportunities");
    await upd("contactMission", "contactMissions");
    await upd("opportuniteMarque", "opportunitesMarque");
    await upd("demandeEntrante", "demandesEntrantes");
    await upd("marqueCartoFile", "cartoFiles");
    await upd("marqueContactSousMarque", "sousMarqueLinks");

    const notif = await tx.notification.updateMany({
      where: { marqueId: sourceMarqueId },
      data: { marqueId: targetMarqueId },
    });
    if (notif.count > 0) moved.notifications = notif.count;

    const aliases = await tx.marqueAlias.findMany({
      where: { marqueId: sourceMarqueId },
    });
    for (const alias of aliases) {
      // Upsert : pas de create().catch() en transaction (P2002 abort Postgres).
      await tx.marqueAlias.upsert({
        where: {
          slug_marqueId: { slug: alias.slug, marqueId: targetMarqueId },
        },
        create: {
          marqueId: targetMarqueId,
          slug: alias.slug,
          label: alias.label,
          source: `MERGE_FROM_${alias.source}`,
        },
        update: {},
      });
    }
    await tx.marqueAlias.deleteMany({ where: { marqueId: sourceMarqueId } });

    if (source.nom.trim().toLowerCase() !== target.nom.trim().toLowerCase()) {
      const { marqueSlug } = await import("@/lib/marque-resolver");
      const slug = marqueSlug(source.nom);
      if (slug) {
        await tx.marqueAlias.upsert({
          where: {
            slug_marqueId: { slug, marqueId: targetMarqueId },
          },
          create: {
            marqueId: targetMarqueId,
            slug,
            label: source.nom,
            source: "MERGE",
          },
          update: {},
        });
      }
    }

    // 3) Dédoublonnage contacts (réassigne le cycle avant chaque delete)
    const deduped = await dedupeMarqueContacts(tx, targetMarqueId);
    if (deduped.removed > 0) moved.contactsDeduped = deduped.removed;

    // 4) Filet de sécurité : reclasse / recrée les contacts manquants pour le cycle
    const ensured = await ensureOutreachContactsLinked(tx, targetMarqueId);
    if (ensured.relinked > 0) moved.outreachRelinked = ensured.relinked;
    if (ensured.created > 0) moved.outreachContactsCreated = ensured.created;

    // 5) Garde-fou dur : aucun target actif orphelin ne doit rester
    const orphans = await tx.outreachTarget.count({
      where: {
        marqueId: targetMarqueId,
        marqueContactId: null,
        status: { not: "STOPPED" },
      },
    });
    if (orphans > 0) {
      throw new Error(
        `Fusion annulée : ${orphans} contact(s) Outreach resteraient hors fiche. Réessaie ou contacte Sofian.`
      );
    }

    // 6) Suppression source (CASCADE safe : plus aucun target dessus)
    await tx.marque.delete({ where: { id: sourceMarqueId } });
  });

  return { moved };
}
