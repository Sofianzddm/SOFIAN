/**
 * Parser carto Fashion Week / enrichissement
 * npx tsx src/lib/parse-carto.test.ts
 */

import { parseCartoText, splitFullName } from "./parse-carto";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  const split = splitFullName("Landon L.");
  assert(split.prenom === "Landon" && split.nom === "L.", `split Landon → ${split.prenom} ${split.nom}`);

  const tsv = [
    "Chloé — Top Contacts",
    "Nom\tRôle\tÉquipe / Périmètre\tMarque(s) gérée(s)\tMarché\tLocalisation\tEmail\tURL Linkedin\tNote",
    "Landon L.\tPress\tPR\tChloé\tFR\tParis\t\thttps://linkedin.com/in/landon\tnote 1",
    "Marie Dupont\tDigital\tCom\tChloé\tFR\tParis\t\thttps://linkedin.com/in/marie\tnote 2",
    "Paul Martin\tBuyer\tAchat\tChloé\tFR\tParis\t\thttps://linkedin.com/in/paul\tnote 3",
    "Léa Bernard\tInfluence\tCom\tChloé\tFR\tParis\tlea@chloe.com\thttps://linkedin.com/in/lea\tnote 4",
    "Nina Rossi\tEvent\tPR\tChloé\tIT\tMilan\t\thttps://linkedin.com/in/nina\tnote 5",
  ].join("\n");

  const parsed = parseCartoText(tsv);
  assert(!parsed.error, parsed.error || "error");
  assert(parsed.rows.length === 5, `attendu 5 contacts, got ${parsed.rows.length}`);
  assert(parsed.suggestedCompany.startsWith("Chloé"), parsed.suggestedCompany);
  assert(parsed.rows[0].prenom === "Landon", parsed.rows[0].prenom);
  assert(parsed.rows[3].email === "lea@chloe.com", parsed.rows[3].email);
  assert(parsed.rows[4].prenom === "Nina", parsed.rows[4].prenom);

  const twoSheets = [
    tsv,
    "Nom\tRôle\tEmail\tURL Linkedin",
    "Alex Moreau\tCom\t\thttps://linkedin.com/in/alex",
  ].join("\n");
  const multi = parseCartoText(twoSheets);
  assert(multi.rows.length === 6, `deux tableaux → 6, got ${multi.rows.length}`);

  console.log("parse-carto.test.ts OK");
}

run();
