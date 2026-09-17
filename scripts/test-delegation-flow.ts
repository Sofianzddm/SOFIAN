/**
 * Test de bout en bout du flux de délégation TM.
 *
 * ⚠️ Écrit dans la base pointée par DATABASE_URL (délégations, `tmId` des gifts
 * et des négos du talent de test) avant de restaurer l'état initial exact
 * (snapshot au début, restore dans un `finally`, avec vérification). Le talent
 * de test est volontairement un talent **archivé**, invisible de l'équipe.
 * Ne pas lancer pendant une délégation active sur ce talent.
 *
 *   npx tsx scripts/test-delegation-flow.ts
 */
import prisma from "@/lib/prisma";
import {
  alignerOwnershipSurResponsable,
  desactiverAutresDelegations,
  getDelegationActive,
  getDestinatairesNotification,
  getResponsableTmId,
  getTalentIdsAccessibles,
  syncDelegationsApresChangementManager,
} from "@/lib/delegations";
import {
  canReadContratMarqueReview,
  isTmAssigneOuRelai,
} from "@/lib/contratMarqueAccess";

const TALENT = "Louise Begon";
const TM = {
  coralie: "cmjx2fucp0006q82dkyp049aa",
  daphnee: "cmjx2fu1w0003q82d719cnoka",
  anna: "cmroyzepy0000jl04o2q9nbxa",
  alice: "cmjx2fu960005q82dsmqtf9t5",
};
const NOM: Record<string, string> = {
  [TM.coralie]: "Coralie",
  [TM.daphnee]: "Daphnée",
  [TM.anna]: "Anna",
  [TM.alice]: "Alice",
};

let ok = 0;
let ko = 0;

function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a === e) {
    ok++;
    console.log(`  ✓ ${label}`);
  } else {
    ko++;
    console.log(`  ✗ ${label}\n      attendu ${e}\n      obtenu  ${a}`);
  }
}

/** Réplique la logique de POST /api/admin/delegations. */
async function activerDelegation(talentId: string, tmRelaiId: string) {
  const talent = await prisma.talent.findUniqueOrThrow({
    where: { id: talentId },
    select: { managerId: true },
  });
  const delegation = await prisma.delegationTM.upsert({
    where: { talentId_tmRelaiId: { talentId, tmRelaiId } },
    update: { tmOrigineId: talent.managerId, actif: true },
    create: { talentId, tmOrigineId: talent.managerId, tmRelaiId, actif: true },
  });
  await desactiverAutresDelegations(talentId, delegation.id);
  await alignerOwnershipSurResponsable(talentId, tmRelaiId);
  return delegation;
}

/** Réplique la logique de PATCH /api/admin/delegations/[id] avec actif=false. */
async function desactiverDelegation(id: string) {
  const updated = await prisma.delegationTM.update({
    where: { id },
    data: { actif: false },
    select: { talentId: true },
  });
  await alignerOwnershipSurResponsable(updated.talentId);
}

const GIFTS_OUVERTS = [
  "BROUILLON",
  "EN_ATTENTE",
  "EN_COURS",
  "ATTENTE_MARQUE",
  "ACCEPTE",
  "ENVOYE",
] as const;

const fmt = (rows: { tmId: string; _count: { _all: number } }[]) =>
  rows
    .map((r) => `${NOM[r.tmId] ?? r.tmId}:${r._count._all}`)
    .sort()
    .join(",") || "—";

/** Dossiers vivants : ceux que la délégation doit déplacer. */
async function etatOwnership(talentId: string) {
  const [gifts, negos] = await Promise.all([
    prisma.demandeGift.groupBy({
      by: ["tmId"],
      where: { talentId, statut: { in: [...GIFTS_OUVERTS] } },
      _count: { _all: true },
    }),
    prisma.negociation.groupBy({
      by: ["tmId"],
      where: { talentId, collaborationId: null, statut: { notIn: ["ANNULEE"] } },
      _count: { _all: true },
    }),
  ]);
  return { gifts: fmt(gifts), negos: fmt(negos) };
}

/** Historique : doit rester figé sur la TM qui a traité les dossiers. */
async function etatHistorique(talentId: string) {
  const [gifts, negos] = await Promise.all([
    prisma.demandeGift.groupBy({
      by: ["tmId"],
      where: { talentId, statut: { notIn: [...GIFTS_OUVERTS] } },
      _count: { _all: true },
    }),
    prisma.negociation.groupBy({
      by: ["tmId"],
      where: {
        talentId,
        OR: [{ collaborationId: { not: null } }, { statut: "ANNULEE" }],
      },
      _count: { _all: true },
    }),
  ]);
  return { gifts: fmt(gifts), negos: fmt(negos) };
}

async function nbRelaisActifs(talentId: string) {
  return prisma.delegationTM.count({ where: { talentId, actif: true } });
}

async function accesContrat(talentId: string) {
  const collab = await prisma.collaboration.findFirst({
    where: { talentId },
    select: {
      accountManagerId: true,
      isPrivate: true,
      accountManager: { select: { role: true } },
      talent: {
        select: {
          managerId: true,
          delegations: { where: { actif: true }, select: { tmRelaiId: true } },
        },
      },
    },
  });
  if (!collab) return null;
  return Object.fromEntries(
    Object.entries(TM).map(([nom, id]) => [
      nom,
      canReadContratMarqueReview(id, "TM", collab),
    ])
  );
}

async function main() {
  const talent = await prisma.talent.findFirstOrThrow({
    where: { prenom: "Louise", nom: "Begon" },
    select: { id: true, managerId: true },
  });
  const talentId = talent.id;

  // ---------- SNAPSHOT ----------
  const snapManagerId = talent.managerId;
  const snapDelegations = await prisma.delegationTM.findMany({
    where: { talentId },
    orderBy: { id: "asc" },
    select: { id: true, actif: true, tmOrigineId: true, tmRelaiId: true },
  });
  const snapGifts = await prisma.demandeGift.findMany({
    where: { talentId },
    orderBy: { id: "asc" },
    select: { id: true, tmId: true },
  });
  const snapNegos = await prisma.negociation.findMany({
    where: { talentId },
    orderBy: { id: "asc" },
    select: { id: true, tmId: true },
  });
  const snapIds = new Set(snapDelegations.map((d) => d.id));

  console.log(`Talent de test : ${TALENT} (${talentId})`);
  console.log(`Manager initial : ${NOM[snapManagerId] ?? snapManagerId}`);
  console.log(
    `Snapshot : ${snapDelegations.length} délégation(s), ${snapGifts.length} gift(s), ${snapNegos.length} négo(s)`
  );
  console.log(`Dossiers en cours :`, await etatOwnership(talentId));
  console.log(`Historique (doit rester figé) :`, await etatHistorique(talentId));
  const histoInitial = await etatHistorique(talentId);

  try {
    // ---------- T0 : au repos ----------
    console.log("\nT0 — au repos (aucune délégation active)");
    check("responsable = manager", await getResponsableTmId(talentId), snapManagerId);
    check("destinataires notif", await getDestinatairesNotification(talentId), [snapManagerId]);
    check("relais actifs", await nbRelaisActifs(talentId), 0);

    // ---------- T1 : activation Coralie -> Daphnée ----------
    console.log("\nT1 — activation du relai Daphnée");
    await activerDelegation(talentId, TM.daphnee);
    check("responsable = relai", NOM[(await getResponsableTmId(talentId))!], "Daphnée");
    check(
      "destinataires = relai seul",
      (await getDestinatairesNotification(talentId)).map((i) => NOM[i]),
      ["Daphnée"]
    );
    check("un seul relai actif", await nbRelaisActifs(talentId), 1);
    check("dossiers en cours passés au relai", await etatOwnership(talentId), {
      gifts: "Daphnée:1",
      negos: "Daphnée:1",
    });
    check("historique non réécrit", await etatHistorique(talentId), histoInitial);
    const talentAcces = await prisma.talent.findUniqueOrThrow({
      where: { id: talentId },
      select: {
        managerId: true,
        delegations: { where: { actif: true }, select: { tmRelaiId: true } },
      },
    });
    check("relai a accès", isTmAssigneOuRelai(TM.daphnee, talentAcces), true);
    check("origine garde la lecture", isTmAssigneOuRelai(TM.coralie, talentAcces), true);
    check("TM tierce sans accès", isTmAssigneOuRelai(TM.anna, talentAcces), false);
    check("accès contrat marque", await accesContrat(talentId), {
      coralie: true,
      daphnee: true,
      anna: false,
      alice: false,
    });
    check("talent dans le périmètre du relai", (await getTalentIdsAccessibles(TM.daphnee)).includes(talentId), true);

    // ---------- T2 : bascule vers un autre relai ----------
    console.log("\nT2 — changement de relai (Daphnée → Anna)");
    await activerDelegation(talentId, TM.anna);
    check("un seul relai actif", await nbRelaisActifs(talentId), 1);
    check("responsable = nouveau relai", NOM[(await getResponsableTmId(talentId))!], "Anna");
    check("ownership entièrement transféré", await etatOwnership(talentId), {
      gifts: "Anna:1",
      negos: "Anna:1",
    });
    check(
      "ancien relai n'a plus accès",
      (await getTalentIdsAccessibles(TM.daphnee)).includes(talentId),
      false
    );

    // ---------- T3 : changement de TM pendant la délégation ----------
    console.log("\nT3 — changement de TM du talent (Coralie → Alice) pendant la délégation");
    await prisma.talent.update({ where: { id: talentId }, data: { managerId: TM.alice } });
    await syncDelegationsApresChangementManager({
      talentId,
      ancienManagerId: TM.coralie,
      nouveauManagerId: TM.alice,
    });
    const apresChgt = await getDelegationActive(talentId);
    check("tmOrigine resynchronisé", NOM[apresChgt!.tmOrigineId], "Alice");
    check("relai inchangé", NOM[apresChgt!.tmRelaiId], "Anna");
    check("responsable inchangé", NOM[(await getResponsableTmId(talentId))!], "Anna");
    check("ownership reste au relai", await etatOwnership(talentId), {
      gifts: "Anna:1",
      negos: "Anna:1",
    });

    // ---------- T4 : le nouveau TM est le relai lui-même ----------
    console.log("\nT4 — le talent est réattribué au relai lui-même (Anna)");
    await prisma.talent.update({ where: { id: talentId }, data: { managerId: TM.anna } });
    await syncDelegationsApresChangementManager({
      talentId,
      ancienManagerId: TM.alice,
      nouveauManagerId: TM.anna,
    });
    check("délégation devenue inutile coupée", await nbRelaisActifs(talentId), 0);
    check("responsable = manager", NOM[(await getResponsableTmId(talentId))!], "Anna");

    // ---------- T5 : retour au TM d'origine, puis fin de délégation ----------
    console.log("\nT5 — le talent revient à Coralie, nouvelle délégation, puis retour");
    await prisma.talent.update({ where: { id: talentId }, data: { managerId: TM.coralie } });
    await syncDelegationsApresChangementManager({
      talentId,
      ancienManagerId: TM.anna,
      nouveauManagerId: TM.coralie,
    });
    check("ownership suit le nouveau manager", await etatOwnership(talentId), {
      gifts: "Coralie:1",
      negos: "Coralie:1",
    });

    const deleg = await activerDelegation(talentId, TM.daphnee);
    check("relai reprend la main", await etatOwnership(talentId), {
      gifts: "Daphnée:1",
      negos: "Daphnée:1",
    });

    await desactiverDelegation(deleg.id);
    check("responsable = manager", NOM[(await getResponsableTmId(talentId))!], "Coralie");
    check(
      "destinataires = manager",
      (await getDestinatairesNotification(talentId)).map((i) => NOM[i]),
      ["Coralie"]
    );
    check("relais actifs", await nbRelaisActifs(talentId), 0);
    check("ownership rendu au manager", await etatOwnership(talentId), {
      gifts: "Coralie:1",
      negos: "Coralie:1",
    });
    check(
      "ex-relai n'a plus accès",
      (await getTalentIdsAccessibles(TM.daphnee)).includes(talentId),
      false
    );

    // ---------- T6 : auto-réparation d'une dérive ----------
    // Simule l'état qu'on a trouvé en base : des dossiers restés sur une TM
    // tierce après une délégation mal terminée.
    console.log("\nT6 — dérive d'ownership vers une TM tierce (Alice)");
    await prisma.demandeGift.updateMany({
      where: { talentId, statut: { in: [...GIFTS_OUVERTS] } },
      data: { tmId: TM.alice },
    });
    await prisma.negociation.updateMany({
      where: { talentId, collaborationId: null, statut: { notIn: ["ANNULEE"] } },
      data: { tmId: TM.alice },
    });
    check("dérive en place", await etatOwnership(talentId), {
      gifts: "Alice:1",
      negos: "Alice:1",
    });

    const delegReparation = await activerDelegation(talentId, TM.daphnee);
    check("activation rapatrie les dossiers dérivés", await etatOwnership(talentId), {
      gifts: "Daphnée:1",
      negos: "Daphnée:1",
    });
    await desactiverDelegation(delegReparation.id);
    check("fin de délégation rend tout au manager", await etatOwnership(talentId), {
      gifts: "Coralie:1",
      negos: "Coralie:1",
    });
    check("historique toujours intact", await etatHistorique(talentId), histoInitial);
  } finally {
    // ---------- RESTORE ----------
    console.log("\nRestauration de l'état initial…");
    await prisma.talent.update({
      where: { id: talentId },
      data: { managerId: snapManagerId },
    });
    await prisma.delegationTM.deleteMany({
      where: { talentId, id: { notIn: [...snapIds] } },
    });
    for (const d of snapDelegations) {
      await prisma.delegationTM.update({
        where: { id: d.id },
        data: { actif: d.actif, tmOrigineId: d.tmOrigineId },
      });
    }
    for (const g of snapGifts) {
      await prisma.demandeGift.update({ where: { id: g.id }, data: { tmId: g.tmId } });
    }
    for (const n of snapNegos) {
      await prisma.negociation.update({ where: { id: n.id }, data: { tmId: n.tmId } });
    }

    const finalTalent = await prisma.talent.findUniqueOrThrow({
      where: { id: talentId },
      select: { managerId: true },
    });
    const finalDelegs = await prisma.delegationTM.findMany({
      where: { talentId },
      orderBy: { id: "asc" },
      select: { id: true, actif: true, tmOrigineId: true, tmRelaiId: true },
    });
    const finalGifts = await prisma.demandeGift.findMany({
      where: { talentId },
      orderBy: { id: "asc" },
      select: { id: true, tmId: true },
    });
    const finalNegos = await prisma.negociation.findMany({
      where: { talentId },
      orderBy: { id: "asc" },
      select: { id: true, tmId: true },
    });
    const identique =
      finalTalent.managerId === snapManagerId &&
      JSON.stringify(finalDelegs) === JSON.stringify(snapDelegations) &&
      JSON.stringify(finalGifts) === JSON.stringify(snapGifts) &&
      JSON.stringify(finalNegos) === JSON.stringify(snapNegos);
    console.log(
      identique
        ? "  ✓ état initial restauré à l'identique"
        : "  ✗ ATTENTION : l'état restauré diffère du snapshot"
    );

    console.log(`\nRésultat : ${ok} vérification(s) OK, ${ko} échec(s)`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
