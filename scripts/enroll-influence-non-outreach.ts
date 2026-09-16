/**
 * Enrôle dans le cycle outreach client (TO_CONTACT) tous les contacts
 * influence (CARTO) présents hors cycle, avec email valide.
 *
 * Usage: npx tsx scripts/enroll-influence-non-outreach.ts
 */
import prisma from "../src/lib/prisma";
import { findCrossPipelineConflict } from "../src/lib/outreach-bridge";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, prenom: true, nom: true },
  });
  if (!admin) {
    throw new Error("Aucun utilisateur ADMIN actif pour createdById.");
  }
  console.log(
    `Enrôlement avec createdBy=${admin.prenom} ${admin.nom} <${admin.email}>`
  );

  const contacts = await prisma.marqueContact.findMany({
    where: {
      source: "CARTO",
      outreachExcluded: false,
      diffusionOptOut: false,
      email: { not: null },
      outreachTargets: { none: {} },
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      language: true,
      marqueId: true,
      marque: { select: { nom: true } },
    },
    orderBy: [{ marque: { nom: "asc" } }, { nom: "asc" }],
  });

  // Emails déjà en cycle (autre fiche)
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

  let enrolled = 0;
  let skippedInvalid = 0;
  let skippedAlready = 0;
  let skippedConflict = 0;
  const conflicts: string[] = [];
  const enrolledSamples: string[] = [];

  for (const c of contacts) {
    const email = (c.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) {
      skippedInvalid++;
      continue;
    }
    if (inCycleSet.has(email)) {
      skippedAlready++;
      continue;
    }

    const conflict = await findCrossPipelineConflict(email, "client");
    if (conflict) {
      skippedConflict++;
      if (conflicts.length < 20) {
        conflicts.push(
          `${c.marque.nom} / ${email} → ${conflict.label} (${conflict.company})`
        );
      }
      continue;
    }

    // Double-check unique email (race / concurrent)
    const existing = await prisma.outreachTarget.findUnique({
      where: { email },
      select: { id: true },
    });
    if (existing) {
      skippedAlready++;
      inCycleSet.add(email);
      continue;
    }

    await prisma.outreachTarget.create({
      data: {
        marqueId: c.marqueId,
        marqueContactId: c.id,
        firstname: c.prenom || c.nom,
        lastname: c.prenom ? c.nom : null,
        email,
        company: c.marque.nom,
        language: c.language === "en" ? "en" : "fr",
        createdById: admin.id,
        // status TO_CONTACT par défaut
      },
    });
    await prisma.marqueContact.update({
      where: { id: c.id },
      data: {
        emailLookupStatus: "FOUND",
        emailSuggested: null,
        outreachEnrolledAt: new Date(),
        outreachTargetRef: "client:bulk-enroll",
      },
    });

    inCycleSet.add(email);
    enrolled++;
    if (enrolledSamples.length < 15) {
      enrolledSamples.push(`${c.marque.nom} — ${email}`);
    }
  }

  console.log("\n=== Résultat ===");
  console.log(`Enrôlés (TO_CONTACT) : ${enrolled}`);
  console.log(`Skip email invalide  : ${skippedInvalid}`);
  console.log(`Skip déjà en cycle   : ${skippedAlready}`);
  console.log(`Skip conflit pipeline: ${skippedConflict}`);
  if (enrolledSamples.length) {
    console.log("\nExemples enrôlés :");
    for (const s of enrolledSamples) console.log(`  + ${s}`);
  }
  if (conflicts.length) {
    console.log("\nConflits (échantillon) :");
    for (const s of conflicts) console.log(`  ! ${s}`);
  }
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
