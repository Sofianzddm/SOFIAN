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

  // Régression : notes « Profil LinkedIn… » + périmètre « établissement… »
  // ne doivent PAS être prises pour une 2ᵉ ligne d’en-tête (noms vides).
  const ekoi = [
    "Priorité\tPrénom\tNom\tRôle\tÉquipe / Périmètre\tMarché\tLocalisation\tEmail\tURL LinkedIn\tNote",
    "P1\tAlexandre\tFRELIGER\tHead of Communication\tCommunication & marque — établissement du budget ; périmètre marque\tGlobal — FR\tFréjus\t\thttps://www.linkedin.com/in/alexandrefreliger/\tDÉCIDEUR : Head of Communication. Profil LinkedIn ouvert le 21/10/2026.",
    "P1\tWard\tWAUTERS\tCountry Manager Benelux\tEkoï Benelux\tBE + NL + LU\tGooik\t\thttps://www.linkedin.com/in/ward-wauters-b06a4a179/\tSEUL salarié Benelux. Profil LinkedIn ouvert le 21/10/2026.",
  ].join("\n");
  const ekoiParsed = parseCartoText(ekoi);
  assert(!ekoiParsed.error, ekoiParsed.error || "ekoi error");
  assert(ekoiParsed.rows.length === 2, `ekoi: attendu 2, got ${ekoiParsed.rows.length}`);
  assert(ekoiParsed.rows[0].prenom === "Alexandre", `ekoi prenom: ${ekoiParsed.rows[0].prenom}`);
  assert(ekoiParsed.rows[0].nom === "FRELIGER", `ekoi nom: ${ekoiParsed.rows[0].nom}`);
  assert(
    ekoiParsed.rows[0].linkedinUrl.includes("alexandrefreliger"),
    `ekoi linkedin: ${ekoiParsed.rows[0].linkedinUrl}`
  );
  assert(ekoiParsed.rows[1].prenom === "Ward", ekoiParsed.rows[1].prenom);

  console.log("parse-carto.test.ts OK");
}

run();
