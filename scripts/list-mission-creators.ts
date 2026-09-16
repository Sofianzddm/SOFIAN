/**
 * LECTURE SEULE : liste les creatorName distincts des ContactMission avec le
 * nombre de cartes, pour identifier la bonne graphie d'un talent.
 * Usage : npx tsx --env-file=.env scripts/list-mission-creators.ts
 */
import { prisma } from "../src/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

async function main() {
  const missions = await contactMissionModel.findMany({
    select: { creatorName: true, talentId: true },
  });
  const counts = new Map<string, number>();
  for (const m of missions) {
    const name = (m.creatorName || "(vide)").trim();
    counts.set(name, (counts.get(name) || 0) + 1);
  }
  const sorted = Array.from(counts.entries()).sort((a, b) => b[1] - a[1]);
  console.log(`Total cartes : ${missions.length} — ${sorted.length} creatorName distincts\n`);
  for (const [name, count] of sorted) {
    console.log(`${String(count).padStart(4)}  ${name}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
