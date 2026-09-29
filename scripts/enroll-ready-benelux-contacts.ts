/**
 * Rattrapage Benelux : contacts CARTO avec email, hors cycle, non exclus.
 * Couvre les échecs dus à l'ancien filtre `diffusionOptOut` (inexistant sur BeneluxContact).
 *
 * Usage:
 *   npx tsx scripts/enroll-ready-benelux-contacts.ts          # dry-run
 *   npx tsx scripts/enroll-ready-benelux-contacts.ts --apply   # enrôle
 */
import prisma from "../src/lib/prisma";
import { tryEnrollBeneluxAfterEmailComplete } from "../src/lib/envoyer-marque-outreach";
import { ENROLLABLE_BENELUX_CONTACT_WHERE } from "../src/lib/diffusion-opt-out";

const APPLY = process.argv.includes("--apply");
const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true, prenom: true, nom: true },
  });
  if (!admin) throw new Error("Aucun ADMIN actif");

  console.log(
    `Mode: ${APPLY ? "APPLY" : "DRY-RUN"} — createdBy=${admin.prenom} ${admin.nom} <${admin.email}>`
  );

  const candidates = await prisma.beneluxContact.findMany({
    where: {
      source: "CARTO",
      ...ENROLLABLE_BENELUX_CONTACT_WHERE,
      email: { not: null },
      outreachTargets: { none: {} },
    },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      companyId: true,
      company: { select: { nom: true } },
    },
  });

  const byCompany = new Map<
    string,
    { nom: string; contacts: typeof candidates }
  >();
  for (const c of candidates) {
    const email = (c.email || "").trim().toLowerCase();
    if (!isValidEmail(email)) continue;
    const cur = byCompany.get(c.companyId) || {
      nom: c.company.nom,
      contacts: [],
    };
    cur.contacts.push(c);
    byCompany.set(c.companyId, cur);
  }

  console.log(
    `\nContacts candidats hors cycle: ${candidates.length} sur ${byCompany.size} entreprise(s)\n`
  );

  let enrolledTotal = 0;
  let blockedMissing = 0;
  let blockedOther = 0;

  for (const [companyId, info] of byCompany) {
    // Même règle métier : on n'enrôle que si plus aucun CARTO sans email
    // (hors NOT_FOUND).
    const carto = await prisma.beneluxContact.findMany({
      where: {
        companyId,
        source: "CARTO",
        ...ENROLLABLE_BENELUX_CONTACT_WHERE,
      },
      select: { email: true, emailLookupStatus: true },
    });
    const stillMissing = carto.filter(
      (c) => !c.email?.trim() && c.emailLookupStatus !== "NOT_FOUND"
    ).length;

    const sample = info.contacts
      .slice(0, 3)
      .map((c) => c.email)
      .join(", ");

    if (stillMissing > 0) {
      blockedMissing += info.contacts.length;
      console.log(
        `  ⏳ ${info.nom}: ${info.contacts.length} prêt(s) mais ${stillMissing} email(s) encore manquant(s) — skip (${sample})`
      );
      continue;
    }

    if (!APPLY) {
      console.log(
        `  ✓ ${info.nom}: ${info.contacts.length} à enrôler (${sample})`
      );
      enrolledTotal += info.contacts.length;
      continue;
    }

    const result = await tryEnrollBeneluxAfterEmailComplete({
      companyId,
      userId: admin.id,
    });
    enrolledTotal += result.enrolled;
    if (result.stillQueued > 0) {
      blockedMissing += result.stillQueued;
      console.log(
        `  ⏳ ${info.nom}: encore ${result.stillQueued} en file — +${result.enrolled}`
      );
    } else if (result.enrolled === 0) {
      blockedOther += info.contacts.length;
      console.log(
        `  · ${info.nom}: 0 enrôlé (conflit pipeline / déjà tracké ?) — candidats: ${info.contacts.length}`
      );
    } else {
      console.log(`  ✓ ${info.nom}: +${result.enrolled}`);
    }
  }

  console.log(`\n---`);
  console.log(
    APPLY
      ? `Enrôlés: ${enrolledTotal}`
      : `À enrôler (estimation max): ${enrolledTotal}`
  );
  console.log(`Bloqués (emails manquants sur la fiche): ${blockedMissing}`);
  if (APPLY) console.log(`Non enrôlés (autre raison): ${blockedOther}`);
  if (!APPLY) {
    console.log(`\nRelancer avec --apply pour écrire.`);
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
