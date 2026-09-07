/**
 * Seed idempotent du Decision Center.
 * Usage : pnpm seed:decision-center
 */
import { PrismaClient } from "@prisma/client";
import { DC_POLICY_SEEDS } from "../src/lib/decision-center/policies-seed";
import {
  DECISION_CENTER_ALLOWED_EMAILS,
  PHASE1_EMAIL_TO_ROLE,
} from "../src/lib/decision-center/constants";

const prisma = new PrismaClient();

async function main() {
  console.log("Decision Center — seed…");

  await prisma.dcSettings.upsert({
    where: { id: "default" },
    update: {},
    create: { id: "default" },
  });

  for (const email of DECISION_CENTER_ALLOWED_EMAILS) {
    const user = await prisma.user.findFirst({
      where: { email: { equals: email, mode: "insensitive" } },
    });
    if (!user) {
      console.log(`  (utilisateur ${email} absent — membership ignoré)`);
      continue;
    }
    const role = PHASE1_EMAIL_TO_ROLE[email];
    await prisma.dcMembership.upsert({
      where: { userId: user.id },
      update: { role, isActive: true },
      create: { userId: user.id, role, isActive: true },
    });
    console.log(`  membership ${email} → ${role}`);
  }

  let created = 0;
  let updated = 0;
  for (const seed of DC_POLICY_SEEDS) {
    const existing = await prisma.dcPolicy.findUnique({
      where: { code: seed.code },
    });
    const data = {
      domain: seed.domain,
      title: seed.title,
      description: seed.description,
      ownerRole: seed.ownerRole,
      executorRole: seed.executorRole,
      finalDecisionRole: seed.finalDecisionRole,
      level: seed.level,
      autonomyRule: seed.autonomyRule,
      thresholdType: seed.thresholdType,
      thresholdValue: seed.thresholdValue,
      thresholdUnit: seed.thresholdUnit,
      escalationRule: seed.escalationRule,
      justificationRequired: seed.justificationRequired,
      recommendationRequired: seed.recommendationRequired,
      evidenceRequired: seed.evidenceRequired,
      ceoVisibility: seed.ceoVisibility,
      visibilityScope: seed.visibilityScope,
      keywords: seed.keywords,
      examples: seed.examples,
    };

    if (!existing) {
      const policy = await prisma.dcPolicy.create({
        data: { code: seed.code, ...data },
      });
      await prisma.dcPolicyVersion.create({
        data: {
          policyId: policy.id,
          version: 1,
          snapshot: seed as object,
        },
      });
      created += 1;
    } else if (!existing.isActive) {
      // Ne pas réécrire une règle désactivée volontairement.
      continue;
    } else {
      await prisma.dcPolicy.update({
        where: { code: seed.code },
        data,
      });
      updated += 1;
    }
  }

  console.log(
    `✅ Seed OK — ${DC_POLICY_SEEDS.length} règles dans le fichier, ${created} créées, ${updated} mises à jour.`
  );
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
