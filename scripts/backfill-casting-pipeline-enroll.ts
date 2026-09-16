/**
 * Rattrapage : contacts déjà contactés via pipeline casting/projets
 * mais pas encore en cycle outreach client. Hors partners/agences.
 *
 * Usage: npx tsx scripts/backfill-casting-pipeline-enroll.ts
 */
import prisma from "../src/lib/prisma";
import {
  enrollIfMissingAfterPipelineSend,
  resolveOutreachPipeline,
} from "../src/lib/outreach-bridge";

type Contact = { email?: string; firstname?: string; lastname?: string };

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true },
  });
  if (!admin) throw new Error("Aucun ADMIN");

  const missions = await prisma.contactMission.findMany({
    where: { sentAt: { not: null } },
    select: {
      targetBrand: true,
      marqueId: true,
      createdById: true,
      sentAt: true,
      clientContacts: true,
    },
  });

  // Déduplique par email (dernier sentAt gagne)
  const byEmail = new Map<
    string,
    {
      email: string;
      firstname?: string;
      lastname?: string;
      company: string;
      marqueId: string | null;
      createdById: string;
      sentAt: Date;
    }
  >();

  for (const m of missions) {
    const contacts = Array.isArray(m.clientContacts)
      ? (m.clientContacts as Contact[])
      : [];
    for (const c of contacts) {
      const email = (c.email || "").trim().toLowerCase();
      if (!email || !email.includes("@")) continue;
      const sentAt = m.sentAt || new Date();
      const prev = byEmail.get(email);
      if (!prev || sentAt > prev.sentAt) {
        byEmail.set(email, {
          email,
          firstname: c.firstname,
          lastname: c.lastname,
          company: m.targetBrand,
          marqueId: m.marqueId,
          createdById: m.createdById || admin.id,
          sentAt,
        });
      }
    }
  }

  console.log(`Emails uniques (missions envoyées): ${byEmail.size}`);

  let enrolled = 0;
  let already = 0;
  let partner = 0;
  let failed = 0;
  const samples: string[] = [];

  for (const c of byEmail.values()) {
    // Pre-filtre rapide pour éviter le bridge si déjà suivi / partner
    const res = await resolveOutreachPipeline(c.email);
    if (res.kind === "existing-target") {
      already++;
      continue;
    }
    if (res.kind === "known-agency") {
      partner++;
      continue;
    }

    try {
      const r = await enrollIfMissingAfterPipelineSend({
        email: c.email,
        firstname: c.firstname,
        lastname: c.lastname,
        company: c.company,
        marqueId: c.marqueId,
        createdById: c.createdById,
        sentAt: c.sentAt,
        sourceLabel: "Mail pipeline casting envoyé (rattrapage)",
      });
      if (!r.ok) {
        failed++;
      } else if (r.action === "already-tracked") {
        already++;
      } else if (r.action === "skipped-partner") {
        partner++;
      } else if (r.action === "created") {
        enrolled++;
        if (samples.length < 40) samples.push(`${c.company} — ${c.email}`);
      } else {
        already++;
      }
    } catch {
      failed++;
    }
  }

  console.log({ enrolled, already, partner, failed });
  if (samples.length) {
    console.log("Nouveaux enrôlés:");
    samples.forEach((s) => console.log(" +", s));
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
