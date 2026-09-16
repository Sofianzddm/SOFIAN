/**
 * Rapport EN LECTURE SEULE des doublons de cartes pipeline (ContactMission)
 * pour un talent donné (par défaut « Royza »). N'écrit / ne supprime RIEN.
 *
 * Un doublon = plusieurs ContactMission ayant le même (talentId, targetBrandKey).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/report-royza-duplicates.ts
 *   npx tsx --env-file=.env scripts/report-royza-duplicates.ts "Autre Talent"
 */
import { prisma } from "../src/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

const NAME_QUERY = (process.argv[2] || "royza").trim();

async function main() {
  // 1) Retrouver le(s) talent(s) correspondant au nom donné.
  const talents = await prisma.talent.findMany({
    where: {
      OR: [
        { prenom: { contains: NAME_QUERY, mode: "insensitive" } },
        { nom: { contains: NAME_QUERY, mode: "insensitive" } },
      ],
    },
    select: { id: true, prenom: true, nom: true },
  });

  if (talents.length === 0) {
    console.log(`Aucun talent trouvé pour « ${NAME_QUERY} ».`);
    console.log(
      "Astuce : les cartes peuvent aussi être rattachées via creatorName sans talentId. Recherche aussi par creatorName…\n"
    );
  } else {
    console.log(
      `Talent(s) trouvé(s) pour « ${NAME_QUERY} » : ${talents
        .map((t) => `${t.prenom} ${t.nom} (${t.id})`)
        .join(", ")}\n`
    );
  }

  const talentIds = talents.map((t) => t.id);

  // 2) Charger toutes les missions rattachées, soit par talentId, soit par
  //    creatorName (cartes historiques créées avant l'usage de talentId).
  const missions = await contactMissionModel.findMany({
    where: {
      OR: [
        ...(talentIds.length ? [{ talentId: { in: talentIds } }] : []),
        { creatorName: { contains: NAME_QUERY, mode: "insensitive" } },
      ],
    },
    select: {
      id: true,
      talentId: true,
      creatorName: true,
      targetBrand: true,
      targetBrandKey: true,
      stage: true,
      status: true,
      sentAt: true,
      relanceSentAt: true,
      relance2SentAt: true,
      draftEmailBody: true,
      clientContacts: true,
      campaignId: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  console.log(`Total cartes rattachées à « ${NAME_QUERY} » : ${missions.length}\n`);

  // 3) Regrouper par clé de marque normalisée.
  const groups = new Map<string, typeof missions>();
  for (const m of missions) {
    const key = m.targetBrandKey || `__no_key__:${m.targetBrand}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const duplicateGroups = Array.from(groups.entries())
    .filter(([, rows]) => rows.length > 1)
    .sort((a, b) => b[1].length - a[1].length);

  const uniqueBrands = groups.size;
  const totalDuplicatesExtra = duplicateGroups.reduce(
    (acc, [, rows]) => acc + (rows.length - 1),
    0
  );

  console.log("=".repeat(70));
  console.log(`Marques distinctes           : ${uniqueBrands}`);
  console.log(`Marques avec doublons        : ${duplicateGroups.length}`);
  console.log(`Cartes en trop (doublons)    : ${totalDuplicatesExtra}`);
  console.log("=".repeat(70));
  console.log();

  const hasProgress = (m: (typeof missions)[number]) =>
    Boolean(m.sentAt || m.relanceSentAt || m.relance2SentAt) ||
    m.stage === "WON" ||
    m.stage === "IN_NEGOTIATION" ||
    m.stage === "RESPONSE_RECEIVED";

  for (const [key, rows] of duplicateGroups) {
    const brand = rows[0].targetBrand;
    console.log(`▶ ${brand}  [${key}] — ${rows.length} cartes`);
    for (const m of rows) {
      const flags: string[] = [];
      if (m.sentAt) flags.push(`envoyé ${new Date(m.sentAt).toLocaleDateString("fr-FR")}`);
      if (m.relanceSentAt) flags.push("relance1");
      if (m.relance2SentAt) flags.push("relance2");
      if (m.draftEmailBody) flags.push("brouillon");
      const contactsCount = Array.isArray(m.clientContacts) ? m.clientContacts.length : 0;
      if (contactsCount) flags.push(`${contactsCount} contact(s)`);
      const keep = hasProgress(m) ? " ⭐" : "";
      console.log(
        `    - ${m.id} | stage=${m.stage} status=${m.status} | créée ${new Date(
          m.createdAt
        ).toLocaleString("fr-FR")} | campagne=${m.campaignId ?? "—"}${
          flags.length ? " | " + flags.join(", ") : ""
        }${keep}`
      );
    }
    console.log();
  }

  console.log(
    "⭐ = carte avec activité (envoi/relance/négo/gagné) : à conserver en priorité si nettoyage."
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
