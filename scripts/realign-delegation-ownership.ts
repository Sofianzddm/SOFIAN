/**
 * Réaligne l'ownership des dossiers en cours sur le responsable courant du
 * talent : la TM relai s'il y a une délégation active, sinon la TM du talent.
 *
 * Nécessaire une fois, pour rattraper les dossiers restés sur l'ancienne TM
 * après une délégation terminée (les négociations n'étaient pas rebasculées).
 *
 *   npx tsx scripts/realign-delegation-ownership.ts          # audit
 *   npx tsx scripts/realign-delegation-ownership.ts --apply  # correction
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();
const apply = process.argv.includes("--apply");

/** Gifts encore vivants : ceux clos restent de l'historique. */
const STATUTS_GIFT_OUVERTS = [
  "BROUILLON",
  "EN_ATTENTE",
  "EN_COURS",
  "ATTENTE_MARQUE",
  "ACCEPTE",
  "ENVOYE",
] as const;

async function main() {
  const delegationsActives = await prisma.delegationTM.findMany({
    where: { actif: true },
    orderBy: { updatedAt: "desc" },
    select: { talentId: true, tmRelaiId: true },
  });
  const relaiParTalent = new Map<string, string>();
  for (const d of delegationsActives) {
    if (!relaiParTalent.has(d.talentId)) relaiParTalent.set(d.talentId, d.tmRelaiId);
  }

  const responsableDe = (talentId: string, managerId: string) =>
    relaiParTalent.get(talentId) ?? managerId;

  const talentSelect = {
    prenom: true,
    nom: true,
    managerId: true,
    manager: { select: { prenom: true, nom: true } },
  } as const;

  // ---- Négociations ouvertes (non converties, non annulées) ----
  const negociations = await prisma.negociation.findMany({
    where: {
      collaborationId: null,
      statut: { notIn: ["ANNULEE"] },
      talent: { isArchived: false },
    },
    select: {
      id: true,
      reference: true,
      statut: true,
      tmId: true,
      talentId: true,
      tm: { select: { prenom: true, nom: true } },
      talent: { select: talentSelect },
    },
  });

  const negosADeplacer = negociations.filter(
    (n) => n.tmId !== responsableDe(n.talentId, n.talent.managerId)
  );

  // ---- Gifts en cours ----
  const gifts = await prisma.demandeGift.findMany({
    where: {
      statut: { in: [...STATUTS_GIFT_OUVERTS] },
      talent: { isArchived: false },
    },
    select: {
      id: true,
      reference: true,
      statut: true,
      tmId: true,
      talentId: true,
      tm: { select: { prenom: true, nom: true } },
      talent: { select: talentSelect },
    },
  });

  const giftsADeplacer = gifts.filter(
    (g) => g.tmId !== responsableDe(g.talentId, g.talent.managerId)
  );

  console.log(`Délégations actives : ${delegationsActives.length}`);
  console.log(
    `Négociations à réaligner : ${negosADeplacer.length} / ${negociations.length}`
  );
  for (const n of negosADeplacer) {
    console.log(
      `  ${n.reference} (${n.statut}) ${n.talent.prenom} ${n.talent.nom} : ` +
        `${n.tm.prenom} → ${n.talent.manager.prenom}`
    );
  }
  console.log(`Gifts à réaligner : ${giftsADeplacer.length} / ${gifts.length}`);
  for (const g of giftsADeplacer) {
    console.log(
      `  ${g.reference} (${g.statut}) ${g.talent.prenom} ${g.talent.nom} : ` +
        `${g.tm.prenom} → ${g.talent.manager.prenom}`
    );
  }

  // ---- tmOrigine désynchronisé du manager courant ----
  const delegations = await prisma.delegationTM.findMany({
    select: { id: true, tmOrigineId: true, talent: { select: { managerId: true } } },
  });
  const origineDesync = delegations.filter(
    (d) => d.tmOrigineId !== d.talent.managerId
  );
  console.log(`Délégations avec tmOrigine désynchronisé : ${origineDesync.length}`);

  if (!apply) {
    console.log("\nAudit seul. Relancer avec --apply pour corriger.");
    return;
  }

  for (const n of negosADeplacer) {
    await prisma.negociation.update({
      where: { id: n.id },
      data: { tmId: responsableDe(n.talentId, n.talent.managerId) },
    });
  }
  for (const g of giftsADeplacer) {
    await prisma.demandeGift.update({
      where: { id: g.id },
      data: { tmId: responsableDe(g.talentId, g.talent.managerId) },
    });
  }
  for (const d of origineDesync) {
    await prisma.delegationTM.update({
      where: { id: d.id },
      data: { tmOrigineId: d.talent.managerId },
    });
  }

  console.log("\nCorrection appliquée.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
