/**
 * Purge totale mae.brun@orange.fr des surfaces d'envoi.
 * Usage: npx tsx scripts/purge-mae-brun-from-outreach.ts --apply
 */
import { PrismaClient } from "@prisma/client";

const APPLY = process.argv.includes("--apply");
const TARGET = "mae.brun@orange.fr";

const prisma = new PrismaClient();

function isTarget(email: string | null | undefined): boolean {
  return String(email || "")
    .trim()
    .toLowerCase() === TARGET;
}

async function main() {
  console.log(APPLY ? "=== APPLY ===" : "=== DRY-RUN ===");
  console.log(`Cible: ${TARGET}\n`);

  // 1) MarqueContact : vider email + exclure
  const marques = await prisma.marqueContact.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      outreachExcluded: true,
      marque: { select: { nom: true } },
    },
  });
  console.log(`MarqueContact: ${marques.length}`);
  for (const c of marques) {
    console.log(
      `  - ${c.marque?.nom} | ${c.prenom} ${c.nom} | excluded=${c.outreachExcluded}`
    );
  }

  // 2) Outreach targets
  const ots = await prisma.outreachTarget.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: { id: true, company: true, status: true },
  });
  console.log(`\nOutreachTarget: ${ots.length}`);
  for (const t of ots) console.log(`  - ${t.company} [${t.status}]`);

  // 3) Agency / Benelux / FW
  const agency = await prisma.agencyContact.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: { id: true, prenom: true, nom: true, excluded: true },
  });
  const benelux = await prisma.beneluxContact.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: { id: true, prenom: true, nom: true, outreachExcluded: true },
  });
  const fw = await prisma.fwContact.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: { id: true, firstName: true, lastName: true },
  });
  const agencyOt = await prisma.agencyOutreachTarget.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: { id: true, company: true, status: true },
  });
  const beneluxOt = await prisma.beneluxOutreachTarget.findMany({
    where: { email: { equals: TARGET, mode: "insensitive" } },
    select: { id: true, companyName: true, status: true },
  });
  console.log(
    `\nAgencyContact=${agency.length} BeneluxContact=${benelux.length} FwContact=${fw.length}`
  );
  console.log(
    `AgencyOT=${agencyOt.length} BeneluxOT=${beneluxOt.length}`
  );

  // 4) Missions : clientContacts + sentMessageIds + relanceMessageIds
  const missions = await prisma.contactMission.findMany({
    select: {
      id: true,
      targetBrand: true,
      status: true,
      clientContacts: true,
      sentMessageIds: true,
      relanceMessageIds: true,
      relanceCancelledAt: true,
    },
  });

  type MissionFix = {
    id: string;
    brand: string;
    status: string;
    nextCc: unknown[] | null;
    nextSent: Record<string, unknown> | null;
    nextRelance: Record<string, unknown> | null;
    removedFrom: string[];
  };
  const missionFixes: MissionFix[] = [];

  for (const m of missions) {
    const removedFrom: string[] = [];
    let nextCc: unknown[] | null = null;
    let nextSent: Record<string, unknown> | null = null;
    let nextRelance: Record<string, unknown> | null = null;

    if (Array.isArray(m.clientContacts)) {
      const filtered = m.clientContacts.filter(
        (c) => !isTarget((c as { email?: string })?.email)
      );
      if (filtered.length !== m.clientContacts.length) {
        nextCc = filtered;
        removedFrom.push("clientContacts");
      }
    }

    if (m.sentMessageIds && typeof m.sentMessageIds === "object") {
      const obj = { ...(m.sentMessageIds as Record<string, unknown>) };
      const keys = Object.keys(obj).filter((k) => isTarget(k));
      if (keys.length) {
        for (const k of keys) delete obj[k];
        nextSent = obj;
        removedFrom.push("sentMessageIds");
      }
    }

    if (m.relanceMessageIds && typeof m.relanceMessageIds === "object") {
      const obj = { ...(m.relanceMessageIds as Record<string, unknown>) };
      const keys = Object.keys(obj).filter((k) => isTarget(k));
      if (keys.length) {
        for (const k of keys) delete obj[k];
        nextRelance = obj;
        removedFrom.push("relanceMessageIds");
      }
    }

    if (removedFrom.length) {
      missionFixes.push({
        id: m.id,
        brand: m.targetBrand,
        status: String(m.status),
        nextCc,
        nextSent,
        nextRelance,
        removedFrom,
      });
    }
  }

  console.log(`\nMissions à purger: ${missionFixes.length}`);
  for (const f of missionFixes) {
    console.log(
      `  - ${f.brand} [${f.status}] ${f.id} → ${f.removedFrom.join(", ")}`
    );
  }

  if (!APPLY) {
    console.log("\nRelancer avec --apply pour écrire.");
    return;
  }

  let n = 0;

  if (marques.length) {
    const r = await prisma.marqueContact.updateMany({
      where: { id: { in: marques.map((c) => c.id) } },
      data: {
        email: null,
        outreachExcluded: true,
        emailLookupStatus: "NOT_FOUND",
        emailSuggested: null,
      },
    });
    n += r.count;
    console.log(`\nMarqueContact email vidé + exclu: ${r.count}`);
  }

  for (const t of ots) {
    await prisma.outreachTarget.update({
      where: { id: t.id },
      data: {
        status: "STOPPED",
        stoppedAt: new Date(),
        scheduledSendAt: null,
        scheduledSubject: null,
        scheduledBodyHtml: null,
      },
    });
    n += 1;
  }
  if (ots.length) console.log(`OutreachTarget STOPPED: ${ots.length}`);

  if (agency.length) {
    const r = await prisma.agencyContact.updateMany({
      where: { id: { in: agency.map((c) => c.id) } },
      data: { email: null, excluded: true, emailLookupStatus: "NOT_FOUND" },
    });
    n += r.count;
    console.log(`AgencyContact: ${r.count}`);
  }

  if (benelux.length) {
    const r = await prisma.beneluxContact.updateMany({
      where: { id: { in: benelux.map((c) => c.id) } },
      data: {
        email: null,
        outreachExcluded: true,
        emailLookupStatus: "NOT_FOUND",
      },
    });
    n += r.count;
    console.log(`BeneluxContact: ${r.count}`);
  }

  if (fw.length) {
    const r = await prisma.fwContact.updateMany({
      where: { id: { in: fw.map((c) => c.id) } },
      data: { email: null, emailLookupStatus: "NOT_FOUND" },
    });
    n += r.count;
    console.log(`FwContact: ${r.count}`);
  }

  for (const t of agencyOt) {
    await prisma.agencyOutreachTarget.update({
      where: { id: t.id },
      data: {
        status: "STOPPED",
        stoppedAt: new Date(),
        scheduledSendAt: null,
      },
    });
    n += 1;
  }
  for (const t of beneluxOt) {
    await prisma.beneluxOutreachTarget.update({
      where: { id: t.id },
      data: {
        status: "STOPPED",
        stoppedAt: new Date(),
      },
    });
    n += 1;
  }

  for (const f of missionFixes) {
    const data: Record<string, unknown> = {};
    if (f.nextCc !== null) data.clientContacts = f.nextCc;
    if (f.nextSent !== null) data.sentMessageIds = f.nextSent;
    if (f.nextRelance !== null) data.relanceMessageIds = f.nextRelance;
    await prisma.contactMission.update({
      where: { id: f.id },
      data,
    });
    n += 1;
    console.log(`Mission ${f.id} (${f.brand}): retiré de ${f.removedFrom.join(", ")}`);
  }

  // Ajouter l'email perso à une note ? Non — le garde-fou suffit.
  // Soft: s'assurer que Talent.email n'est PAS orange (sinon blocklist le couvre).
  const talent = await prisma.talent.findFirst({
    where: {
      OR: [
        { email: { equals: TARGET, mode: "insensitive" } },
        { prenom: { contains: "Maé", mode: "insensitive" }, nom: { equals: "Brun", mode: "insensitive" } },
      ],
    },
    select: { id: true, prenom: true, nom: true, email: true },
  });
  console.log(`\nTalent fiche:`, talent);

  console.log(`\n✅ Done. ${n} écritures. ${TARGET} ne peut plus être contacté via CRM/missions.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
