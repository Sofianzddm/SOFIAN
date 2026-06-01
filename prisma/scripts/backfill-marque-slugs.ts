/**
 * Backfill du slug canonique sur toutes les marques existantes.
 *
 * Stratégie :
 *   1) Pour chaque marque sans slug → on calcule `marqueSlug(nom)` et on l'écrit.
 *   2) On détecte les doublons (même slug, plusieurs marqueId) → log clair pour
 *      que l'humain décide quelle fiche garder.
 *
 * Idempotent : peut être relancé plusieurs fois sans danger.
 *
 * Usage :
 *   pnpm tsx prisma/scripts/backfill-marque-slugs.ts
 *   pnpm tsx prisma/scripts/backfill-marque-slugs.ts --dry-run   # n'écrit rien
 */

import prisma from "../../src/lib/prisma";
import { marqueSlug } from "../../src/lib/marque-resolver";

type Row = { id: string; nom: string; slug: string | null; createdAt: Date };

async function main() {
  const dryRun = process.argv.includes("--dry-run");

  const all = (await prisma.marque.findMany({
    select: { id: true, nom: true, slug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  })) as Row[];

  console.log(`→ ${all.length} marques en base.`);

  let updated = 0;
  let skipped = 0;
  const skippedEmpty: Row[] = [];
  const bySlug = new Map<string, Row[]>();

  for (const m of all) {
    const slug = marqueSlug(m.nom);
    if (!slug) {
      skippedEmpty.push(m);
      continue;
    }

    if (m.slug !== slug) {
      if (!dryRun) {
        await prisma.marque.update({
          where: { id: m.id },
          data: { slug },
        });
      }
      updated++;
    } else {
      skipped++;
    }

    const arr = bySlug.get(slug) ?? [];
    arr.push({ ...m, slug });
    bySlug.set(slug, arr);
  }

  console.log(
    `${dryRun ? "[DRY-RUN] " : ""}Slugs écrits : ${updated} | déjà à jour : ${skipped} | impossibles : ${skippedEmpty.length}`
  );

  if (skippedEmpty.length > 0) {
    console.log("\n⚠  Marques sans nom slugifiable (à corriger manuellement) :");
    for (const m of skippedEmpty) {
      console.log(`   - ${m.id} | "${m.nom}"`);
    }
  }

  const duplicates = [...bySlug.entries()].filter(([, rows]) => rows.length > 1);
  if (duplicates.length > 0) {
    console.log(`\n⚠  ${duplicates.length} doublon(s) détecté(s) :`);
    for (const [slug, rows] of duplicates) {
      console.log(`\n   slug="${slug}" — ${rows.length} fiches :`);
      for (const r of rows) {
        console.log(`     • ${r.id} | "${r.nom}" | créée le ${r.createdAt.toISOString()}`);
      }
    }
    console.log(
      "\n→ Ces doublons ne bloquent pas le backfill, mais l'index UNIQUE final ne pourra pas être posé tant qu'ils existent."
    );
    console.log(
      "→ Utiliser l'UI 'Fusionner deux marques' (livrée en couche 3.b) ou un script de merge dédié."
    );
  } else {
    console.log("\n✓ Aucun doublon détecté. Tu peux poser l'index UNIQUE sur marques.slug.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error(err);
    process.exit(1);
  });
