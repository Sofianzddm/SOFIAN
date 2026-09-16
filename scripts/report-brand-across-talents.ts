/**
 * LECTURE SEULE : marques contactées pour PLUSIEURS talents différents.
 * But : prouver que le partage d'une marque entre talents est traité comme
 * indépendant (jamais compté ni supprimé comme doublon).
 * Usage : npx tsx --env-file=.env scripts/report-brand-across-talents.ts
 */
import { prisma } from "../src/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

async function main() {
  const missions = await contactMissionModel.findMany({
    select: { creatorName: true, targetBrand: true, targetBrandKey: true },
  });

  const brandToTalents = new Map<string, { brand: string; talents: Set<string> }>();
  for (const m of missions) {
    const key = m.targetBrandKey || m.targetBrand;
    const talent = (m.creatorName || "").trim();
    if (!brandToTalents.has(key)) brandToTalents.set(key, { brand: m.targetBrand, talents: new Set() });
    brandToTalents.get(key)!.talents.add(talent);
  }

  const shared = Array.from(brandToTalents.values())
    .filter((v) => v.talents.size > 1)
    .sort((a, b) => b.talents.size - a.talents.size);

  console.log(
    `${shared.length} marque(s) contactées pour plusieurs talents (INDÉPENDANT, non-doublon) :\n`
  );
  for (const s of shared) {
    console.log(`  ${s.brand}  → ${s.talents.size} talents : ${Array.from(s.talents).join(", ")}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
