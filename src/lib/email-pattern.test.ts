/**
 * Motifs d'email — exécution : npx tsx src/lib/email-pattern.test.ts
 */

import {
  detectEmailPattern,
  matchPatternKind,
  suggestEmailsForContact,
} from "./email-pattern";

function assert(cond: unknown, msg: string) {
  if (!cond) throw new Error(msg);
}

function run() {
  assert(
    matchPatternKind("charline.b@oxygen-rp.com", "Charline", "Bellec") === "prenom.n",
    "charline.b → prenom.n"
  );
  assert(
    matchPatternKind("julie.l@oxygen-rp.com", "Julie", "Laurent") === "prenom.n",
    "julie.l → prenom.n"
  );
  assert(
    matchPatternKind("sophie.martin@joeo.fr", "Sophie", "Martin") === "prenom.nom",
    "sophie.martin → prenom.nom"
  );

  const pattern = detectEmailPattern([
    { email: "charline.b@oxygen-rp.com", prenom: "Charline", nom: "Bellec" },
    { email: "julie.l@oxygen-rp.com", prenom: "Julie", nom: "Laurent" },
  ]);
  assert(pattern?.kind === "prenom.n", `kind got ${pattern?.kind}`);
  assert(pattern?.domain === "oxygen-rp.com", "domain oxygen-rp.com");
  assert((pattern?.matches || 0) >= 2, "≥ 2 matches");

  const lara = suggestEmailsForContact({
    prenom: "Lara",
    nom: "Van Campenhout",
    pattern,
  });
  assert(
    lara[0]?.email === "lara.v@oxygen-rp.com",
    `Lara got ${lara[0]?.email}`
  );

  const capucine = suggestEmailsForContact({
    prenom: "Capucine",
    nom: "Abrysch",
    pattern,
  });
  assert(
    capucine[0]?.email === "capucine.a@oxygen-rp.com",
    `Capucine got ${capucine[0]?.email}`
  );

  console.log("✓ email-pattern (prenom.n / Oxygen RP)");
}

run();
