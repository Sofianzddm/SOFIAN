/**
 * Enrôle les CARTO prêts (email OK) encore hors cycle — y compris sans AO.
 * Usage: npx tsx scripts/enroll-ready-carto-contacts.ts
 */
import prisma from "../src/lib/prisma";
import { enrollInfluenceContacts } from "../src/lib/envoyer-marque-outreach";
import { findCrossPipelineConflict } from "../src/lib/outreach-bridge";

const isValidEmail = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

async function main() {
  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Aucun ADMIN");

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
      email: true,
      prenom: true,
      nom: true,
      marqueId: true,
      marque: { select: { nom: true } },
    },
  });

  const emails = contacts
    .map((c) => c.email!.trim().toLowerCase())
    .filter(isValidEmail);

  const [client, agency, benelux] = await Promise.all([
    prisma.outreachTarget.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
    prisma.agencyOutreachTarget.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
    prisma.beneluxOutreachTarget.findMany({
      where: { email: { in: emails } },
      select: { email: true },
    }),
  ]);
  const tracked = new Set(
    [...client, ...agency, ...benelux].map((t) => t.email.toLowerCase())
  );

  const partners = await prisma.partner.findMany({
    select: {
      contactEmail: true,
      agencyContacts: { select: { email: true } },
    },
  });
  const partnerDomains = new Set<string>();
  const generic = new Set([
    "gmail.com",
    "yahoo.fr",
    "hotmail.com",
    "outlook.com",
    "icloud.com",
  ]);
  for (const p of partners) {
    for (const e of [p.contactEmail, ...p.agencyContacts.map((c) => c.email)]) {
      const d = e?.split("@")[1]?.toLowerCase();
      if (d && !generic.has(d)) partnerDomains.add(d);
    }
  }

  const byMarque = new Map<string, { nom: string; emails: string[] }>();
  for (const c of contacts) {
    const email = c.email!.trim().toLowerCase();
    if (!isValidEmail(email) || tracked.has(email)) continue;
    const d = email.split("@")[1];
    if (d && partnerDomains.has(d)) continue;
    const conflict = await findCrossPipelineConflict(email, "client");
    if (conflict) continue;
    const cur = byMarque.get(c.marqueId) || { nom: c.marque.nom, emails: [] };
    cur.emails.push(email);
    byMarque.set(c.marqueId, cur);
  }

  console.log(`Marques à enrôler: ${byMarque.size}`);
  let total = 0;
  for (const [marqueId, info] of byMarque) {
    const n = await enrollInfluenceContacts({
      marqueId,
      company: info.nom,
      createdById: admin.id,
    });
    total += n;
    console.log(`  ${info.nom}: +${n} (${info.emails.join(", ")})`);
  }
  console.log(`\nTotal enrôlés: ${total}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
