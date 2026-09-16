/**
 * Analyse pourquoi les contacts CARTO ne sont pas en outreach client.
 * Usage: npx tsx scripts/analyze-non-outreach-reasons.ts
 */
import prisma from "../src/lib/prisma";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function main() {
  const contacts = await prisma.marqueContact.findMany({
    where: {
      source: "CARTO",
      outreachExcluded: false,
      outreachTargets: { none: {} },
    },
    select: {
      id: true,
      email: true,
      emailLookupStatus: true,
      marqueId: true,
      marque: {
        select: {
          nom: true,
          cartoFiles: { where: { kind: "AO" }, select: { id: true }, take: 1 },
          contacts: {
            where: { source: "AO", outreachExcluded: false },
            select: { id: true },
            take: 1,
          },
        },
      },
    },
  });

  const emails = contacts
    .map((c) => c.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));
  const inCycle = emails.length
    ? await prisma.outreachTarget.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      })
    : [];
  const inCycleSet = new Set(inCycle.map((t) => t.email.toLowerCase()));

  const filtered = contacts.filter((c) => {
    const e = c.email?.trim().toLowerCase();
    return !(e && inCycleSet.has(e));
  });

  let noEmail = 0;
  let invalidEmail = 0;
  let validEmail = 0;
  let queued = 0;
  let found = 0;
  let notFound = 0;
  let nullStatus = 0;
  let withAo = 0;
  let withoutAo = 0;
  const invalidSamples: string[] = [];

  type Agg = {
    nom: string;
    hasAo: boolean;
    valid: number;
    invalid: number;
    noEmail: number;
    queued: number;
  };
  const marqueReasons = new Map<string, Agg>();

  for (const c of filtered) {
    const hasAo =
      c.marque.cartoFiles.length > 0 || c.marque.contacts.length > 0;
    if (hasAo) withAo++;
    else withoutAo++;

    const email = c.email?.trim() || "";
    let bucket: "valid" | "invalid" | "noEmail";
    if (!email) {
      noEmail++;
      bucket = "noEmail";
    } else if (!isValidEmail(email)) {
      invalidEmail++;
      bucket = "invalid";
      if (invalidSamples.length < 15) {
        invalidSamples.push(`${c.marque.nom}: "${email}"`);
      }
    } else {
      validEmail++;
      bucket = "valid";
    }

    if (c.emailLookupStatus === "QUEUED") queued++;
    else if (c.emailLookupStatus === "FOUND") found++;
    else if (c.emailLookupStatus === "NOT_FOUND") notFound++;
    else nullStatus++;

    let m = marqueReasons.get(c.marqueId);
    if (!m) {
      m = { nom: c.marque.nom, hasAo, valid: 0, invalid: 0, noEmail: 0, queued: 0 };
      marqueReasons.set(c.marqueId, m);
    }
    if (bucket === "valid") m.valid++;
    if (bucket === "invalid") m.invalid++;
    if (bucket === "noEmail") m.noEmail++;
    if (c.emailLookupStatus === "QUEUED") m.queued++;
  }

  const all = [...marqueReasons.values()];
  const blockedNoAo = all.filter((m) => !m.hasAo);
  const blockedMissingEmail = all.filter(
    (m) => m.hasAo && (m.noEmail > 0 || m.queued > 0)
  );
  const blockedInvalid = all.filter((m) => m.hasAo && m.invalid > 0);
  const readyButNotEnrolled = all.filter(
    (m) =>
      m.hasAo &&
      m.valid > 0 &&
      m.noEmail === 0 &&
      m.invalid === 0 &&
      m.queued === 0
  );

  console.log("=== CONTACTS ===");
  console.log(`Total non envoyés : ${filtered.length}`);
  console.log(`  Email valide    : ${validEmail}`);
  console.log(`  Email invalide  : ${invalidEmail}`);
  console.log(`  Sans email      : ${noEmail}`);
  console.log(`  QUEUED          : ${queued}`);
  console.log(`  FOUND           : ${found}`);
  console.log(`  NOT_FOUND       : ${notFound}`);
  console.log(`  statut null     : ${nullStatus}`);
  console.log(`  Avec AO         : ${withAo}`);
  console.log(`  Sans AO         : ${withoutAo}`);

  console.log("\n=== MARQUES ===");
  console.log(`Total : ${all.length}`);
  console.log(`  Bloquées faute d'AO              : ${blockedNoAo.length}`);
  console.log(`  Bloquées email manquant/QUEUED   : ${blockedMissingEmail.length}`);
  console.log(`  Avec au moins 1 email invalide   : ${blockedInvalid.length}`);
  console.log(`  Prêtes (AO + emails OK) mais pas : ${readyButNotEnrolled.length}`);

  if (invalidSamples.length) {
    console.log("\nExemples emails invalides :");
    for (const s of invalidSamples) console.log(`  - ${s}`);
  }
  if (readyButNotEnrolled.length) {
    console.log("\nMarques prêtes non enrôlées (échantillon) :");
    for (const m of readyButNotEnrolled.slice(0, 12)) {
      console.log(`  - ${m.nom} (${m.valid} emails valides)`);
    }
  }
  console.log("\nSans AO (échantillon) :");
  for (const m of blockedNoAo.slice(0, 8)) console.log(`  - ${m.nom}`);
  console.log("\nEmail manquant/QUEUED (échantillon) :");
  for (const m of blockedMissingEmail.slice(0, 8)) {
    console.log(
      `  - ${m.nom}: ${m.noEmail} sans email, ${m.queued} queued, ${m.valid} valides`
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
