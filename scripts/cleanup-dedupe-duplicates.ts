/**
 * Nettoyage one-shot : supprime (statut DISCARDED) les suggestions de doublons
 * marques PENDING redondantes.
 * - Même ensemble de marques proposé plusieurs fois -> on garde la plus récente.
 * - Groupes qui se recouvrent partiellement (partagent au moins une marque)
 *   -> on garde la suggestion la plus récente du cluster.
 *
 * Usage : npx tsx scripts/cleanup-dedupe-duplicates.ts [--dry-run]
 */
import { prisma } from "../src/lib/prisma";

const dryRun = process.argv.includes("--dry-run");

async function main() {
  const allPending = await prisma.marqueDedupeSuggestion.findMany({
    where: { status: "PENDING" },
    orderBy: { createdAt: "desc" },
    select: {
      id: true,
      marqueIds: true,
      groupKey: true,
      createdAt: true,
      recommendedTargetId: true,
      recommendedSourceIds: true,
    },
  });
  console.log(`Suggestions PENDING : ${allPending.length}`);

  // Passe 1 : suggestions "fantômes" dont la cible ou toutes les sources
  // recommandées n'existent plus (marques déjà fusionnées/supprimées).
  const allIds = [...new Set(allPending.flatMap((s) => s.marqueIds))];
  const existing = await prisma.marque.findMany({
    where: { id: { in: allIds } },
    select: { id: true },
  });
  const existingIds = new Set(existing.map((m) => m.id));

  const ghosts = allPending.filter((s) => {
    const target = s.recommendedTargetId;
    const sources = s.recommendedSourceIds.filter((id) => existingIds.has(id));
    return !target || !existingIds.has(target) || sources.length === 0;
  });
  console.log(`Fantômes (marques déjà fusionnées) : ${ghosts.length}`);
  for (const g of ghosts) {
    console.log(`  - ${g.groupKey} (créée ${g.createdAt.toISOString().slice(0, 10)})`);
  }

  if (!dryRun && ghosts.length > 0) {
    await prisma.marqueDedupeSuggestion.updateMany({
      where: { id: { in: ghosts.map((g) => g.id) } },
      data: { status: "DISCARDED", reviewedAt: new Date(), reviewedBy: "CLEANUP_SCRIPT" },
    });
  }

  const ghostIds = new Set(ghosts.map((g) => g.id));
  const pending = allPending.filter((s) => !ghostIds.has(s.id));

  const seenMarqueIds = new Set<string>();
  const keep: string[] = [];
  const discard: { id: string; groupKey: string; createdAt: Date }[] = [];

  // pending est trié du plus récent au plus ancien : le premier groupe qui
  // touche une marque la "réserve", les suivants sont écartés.
  for (const s of pending) {
    const overlaps = s.marqueIds.some((id) => seenMarqueIds.has(id));
    if (overlaps) {
      discard.push({ id: s.id, groupKey: s.groupKey, createdAt: s.createdAt });
    } else {
      keep.push(s.id);
      for (const id of s.marqueIds) seenMarqueIds.add(id);
    }
  }

  console.log(`À conserver : ${keep.length}`);
  console.log(`À écarter (redondantes) : ${discard.length}`);
  for (const d of discard) {
    console.log(`  - ${d.groupKey} (créée ${d.createdAt.toISOString().slice(0, 10)})`);
  }

  if (dryRun) {
    console.log("Dry-run : aucune modification.");
    return;
  }

  if (discard.length > 0) {
    const res = await prisma.marqueDedupeSuggestion.updateMany({
      where: { id: { in: discard.map((d) => d.id) } },
      data: { status: "DISCARDED", reviewedAt: new Date(), reviewedBy: "CLEANUP_SCRIPT" },
    });
    console.log(`Écartées : ${res.count}`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
