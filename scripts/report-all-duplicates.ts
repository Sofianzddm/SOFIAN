/**
 * Rapport EN LECTURE SEULE des doublons de cartes pipeline (ContactMission)
 * pour TOUS les talents. N'écrit / ne supprime RIEN.
 *
 * Un doublon = plusieurs ContactMission ayant le même (creatorName, targetBrandKey).
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/report-all-duplicates.ts            # résumé par talent
 *   npx tsx --env-file=.env scripts/report-all-duplicates.ts --detail   # + détail des groupes
 */
import { prisma } from "../src/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
const DETAIL = process.argv.includes("--detail");

type Row = {
  id: string;
  creatorName: string;
  targetBrand: string;
  targetBrandKey: string;
  stage: string;
  status: string;
  sentAt: Date | null;
  relanceSentAt: Date | null;
  relance2SentAt: Date | null;
  draftEmailBody: string | null;
  clientContacts: unknown;
  createdAt: Date;
};

const hasActivity = (m: Row) =>
  Boolean(m.sentAt || m.relanceSentAt || m.relance2SentAt) ||
  m.stage === "WON" ||
  m.stage === "IN_NEGOTIATION" ||
  m.stage === "RESPONSE_RECEIVED";

async function main() {
  const missions: Row[] = await contactMissionModel.findMany({
    select: {
      id: true,
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
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Regroupe par talent (creatorName normalisé).
  const byTalent = new Map<string, Row[]>();
  for (const m of missions) {
    const t = (m.creatorName || "(vide)").trim();
    if (!byTalent.has(t)) byTalent.set(t, []);
    byTalent.get(t)!.push(m);
  }

  type TalentStat = {
    talent: string;
    total: number;
    distinctBrands: number;
    dupBrands: number;
    extraCards: number;
    extraSafeToDelete: number; // doublons sans activité (supprimables sans risque)
    dupGroups: Array<{ brand: string; key: string; rows: Row[] }>;
  };

  const stats: TalentStat[] = [];

  for (const [talent, rows] of byTalent.entries()) {
    const groups = new Map<string, Row[]>();
    for (const m of rows) {
      const key = m.targetBrandKey || `__nokey__:${m.targetBrand}`;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(m);
    }
    const dupGroups = Array.from(groups.entries())
      .filter(([, g]) => g.length > 1)
      .map(([key, g]) => ({ brand: g[0].targetBrand, key, rows: g }))
      .sort((a, b) => b.rows.length - a.rows.length);

    let extraCards = 0;
    let extraSafeToDelete = 0;
    for (const g of dupGroups) {
      extraCards += g.rows.length - 1;
      const active = g.rows.filter(hasActivity).length;
      // On garde 1 carte au total : si >=1 active, on garde une active et on
      // peut supprimer toutes les inactives ; sinon on garde 1 inactive.
      const inactive = g.rows.length - active;
      const safe = active >= 1 ? inactive : Math.max(0, inactive - 1);
      extraSafeToDelete += safe;
    }

    stats.push({
      talent,
      total: rows.length,
      distinctBrands: groups.size,
      dupBrands: dupGroups.length,
      extraCards,
      extraSafeToDelete,
      dupGroups,
    });
  }

  stats.sort((a, b) => b.extraCards - a.extraCards);

  const grand = {
    total: missions.length,
    extraCards: stats.reduce((a, s) => a + s.extraCards, 0),
    extraSafe: stats.reduce((a, s) => a + s.extraSafeToDelete, 0),
    talentsWithDup: stats.filter((s) => s.dupBrands > 0).length,
  };

  console.log("=".repeat(78));
  console.log("RAPPORT DOUBLONS PIPELINE — TOUS TALENTS (lecture seule)");
  console.log("=".repeat(78));
  console.log(`Cartes totales            : ${grand.total}`);
  console.log(`Talents avec doublons     : ${grand.talentsWithDup} / ${stats.length}`);
  console.log(`Cartes en trop (doublons) : ${grand.extraCards}`);
  console.log(`  dont supprimables sûr   : ${grand.extraSafe} (aucune activité)`);
  console.log(`  à trancher manuellement : ${grand.extraCards - grand.extraSafe} (plusieurs cartes actives sur une même marque)`);
  console.log("=".repeat(78));
  console.log();

  console.log(
    "Talent".padEnd(28) +
      "Total".padStart(7) +
      "Marques".padStart(9) +
      "MqDup".padStart(7) +
      "EnTrop".padStart(8) +
      "SûrDel".padStart(8)
  );
  console.log("-".repeat(78));
  for (const s of stats) {
    console.log(
      s.talent.padEnd(28) +
        String(s.total).padStart(7) +
        String(s.distinctBrands).padStart(9) +
        String(s.dupBrands).padStart(7) +
        String(s.extraCards).padStart(8) +
        String(s.extraSafeToDelete).padStart(8)
    );
  }
  console.log();

  if (DETAIL) {
    for (const s of stats.filter((x) => x.dupBrands > 0)) {
      console.log("\n" + "#".repeat(70));
      console.log(`# ${s.talent} — ${s.dupBrands} marque(s) en doublon, ${s.extraCards} carte(s) en trop`);
      console.log("#".repeat(70));
      for (const g of s.dupGroups) {
        console.log(`\n  ▶ ${g.brand} [${g.key}] — ${g.rows.length} cartes`);
        for (const m of g.rows) {
          const flags: string[] = [];
          if (m.sentAt) flags.push(`envoyé ${new Date(m.sentAt).toLocaleDateString("fr-FR")}`);
          if (m.relanceSentAt) flags.push("relance1");
          if (m.relance2SentAt) flags.push("relance2");
          if (m.draftEmailBody) flags.push("brouillon");
          const c = Array.isArray(m.clientContacts) ? m.clientContacts.length : 0;
          if (c) flags.push(`${c} contact(s)`);
          console.log(
            `      - ${m.id} | ${m.stage}/${m.status} | ${new Date(m.createdAt).toLocaleDateString("fr-FR")}` +
              `${flags.length ? " | " + flags.join(", ") : ""}${hasActivity(m) ? " ⭐" : ""}`
          );
        }
      }
    }
  } else {
    console.log("Astuce : relance avec --detail pour voir chaque groupe de doublons.");
  }

  console.log("\n⭐ = carte avec activité (envoi/relance/négo/gagné) : à conserver en priorité.");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
