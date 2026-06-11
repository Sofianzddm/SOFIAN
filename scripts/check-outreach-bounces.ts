/**
 * Vérification rétroactive des bounces sur les mails Outreach déjà envoyés.
 * Nécessite GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET (sinon utiliser le bouton
 * « Vérifier les bounces » dans /outreach, qui tourne sur Vercel).
 *
 * Usage :
 *   npx tsx scripts/check-outreach-bounces.ts          # dry-run (affiche sans écrire)
 *   npx tsx scripts/check-outreach-bounces.ts --apply  # supprime les bounces + corrige les repliedAt
 */
import "dotenv/config";
import { prisma } from "../src/lib/prisma";
import { checkOutreachBounces } from "../src/lib/outreach-bounce-check";

const APPLY = process.argv.includes("--apply");

async function main() {
  const result = await checkOutreachBounces(APPLY);
  console.log(`${result.scanned} contact(s) scannés — ${APPLY ? "MODE APPLY" : "dry-run"}\n`);
  for (const b of result.bounces) {
    console.log(`  ⛔ BOUNCE : ${b.name} (${b.company}) — ${b.email}${APPLY ? " → supprimé" : ""}`);
  }
  for (const f of result.falseReplies) {
    console.log(`  ✗ Fausse réponse : ${f.name} (${f.company}) cycle ${f.cycleNumber}`);
  }
  console.log(
    `\nRésumé : ${result.bounces.length} bounce(s), ${result.falseReplies.length} fausse(s) réponse(s), ${result.errors} erreur(s).`
  );
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
