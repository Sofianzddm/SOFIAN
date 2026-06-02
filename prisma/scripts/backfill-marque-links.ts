/**
 * Rattache les enregistrements historiques à une fiche Marque via le nom extrait/saisi.
 *
 * Usage:
 *   pnpm tsx prisma/scripts/backfill-marque-links.ts
 *   pnpm tsx prisma/scripts/backfill-marque-links.ts --dry-run
 */

import prisma from "../../src/lib/prisma";
import {
  findOrCreateMarque,
  syncMissionClientContactsToMarque,
} from "../../src/lib/marque-resolver";

const dryRun = process.argv.includes("--dry-run");

async function backfillInbound() {
  const rows = await prisma.inboundOpportunity.findMany({
    where: { marqueId: null, extractedBrand: { not: null } },
    select: { id: true, extractedBrand: true, senderEmail: true, senderName: true },
  });
  let n = 0;
  for (const row of rows) {
    const name = row.extractedBrand?.trim();
    if (!name) continue;
    if (dryRun) {
      n++;
      continue;
    }
    const r = await findOrCreateMarque({ name, source: "INBOUND" });
    await prisma.inboundOpportunity.update({
      where: { id: row.id },
      data: { marqueId: r.marqueId },
    });
    n++;
  }
  console.log(`InboundOpportunity: ${n}/${rows.length}`);
}

async function backfillContactMissions() {
  const rows = await prisma.contactMission.findMany({
    where: { marqueId: null },
    select: { id: true, targetBrand: true },
  });
  let n = 0;
  for (const row of rows) {
    const name = row.targetBrand?.trim();
    if (!name) continue;
    if (dryRun) {
      n++;
      continue;
    }
    const r = await findOrCreateMarque({ name, source: "CONTACT_MISSION" });
    await prisma.contactMission.update({
      where: { id: row.id },
      data: { marqueId: r.marqueId },
    });
    n++;
  }
  console.log(`ContactMission: ${n}/${rows.length}`);
}

async function backfillOpportunites() {
  const rows = await prisma.opportuniteMarque.findMany({
    where: { marqueId: null },
    select: { id: true, nomMarque: true },
  });
  let n = 0;
  for (const row of rows) {
    const name = row.nomMarque?.trim();
    if (!name) continue;
    if (dryRun) {
      n++;
      continue;
    }
    const r = await findOrCreateMarque({ name, source: "OPPORTUNITE_MARQUE" });
    await prisma.opportuniteMarque.update({
      where: { id: row.id },
      data: { marqueId: r.marqueId },
    });
    n++;
  }
  console.log(`OpportuniteMarque: ${n}/${rows.length}`);
}

async function backfillDemandesEntrantes() {
  const rows = await prisma.demandeEntrante.findMany({
    where: { marqueId: null, extractedBrand: { not: null } },
    select: { id: true, extractedBrand: true },
  });
  let n = 0;
  for (const row of rows) {
    const name = row.extractedBrand?.trim();
    if (!name) continue;
    if (dryRun) {
      n++;
      continue;
    }
    const r = await findOrCreateMarque({ name, source: "DEMANDE_ENTRANTE" });
    await prisma.demandeEntrante.update({
      where: { id: row.id },
      data: { marqueId: r.marqueId },
    });
    n++;
  }
  console.log(`DemandeEntrante: ${n}/${rows.length}`);
}

async function backfillNegociations() {
  const rows = await prisma.negociation.findMany({
    where: { marqueId: null, nomMarqueSaisi: { not: null } },
    select: { id: true, nomMarqueSaisi: true },
  });
  let n = 0;
  for (const row of rows) {
    const name = row.nomMarqueSaisi?.trim();
    if (!name) continue;
    if (dryRun) {
      n++;
      continue;
    }
    const r = await findOrCreateMarque({ name, source: "NEGOCIATION" });
    await prisma.negociation.update({
      where: { id: row.id },
      data: { marqueId: r.marqueId },
    });
    n++;
  }
  console.log(`Negociation (nomMarqueSaisi): ${n}/${rows.length}`);
}

/** Copie contact_missions.clientContacts (JSON) vers marque_contacts */
async function backfillPipelineContactsOnMarques() {
  const rows = await prisma.contactMission.findMany({
    select: { id: true, targetBrand: true, marqueId: true, clientContacts: true },
  });
  let n = 0;
  for (const row of rows) {
    const contacts = row.clientContacts;
    if (!Array.isArray(contacts) || contacts.length === 0) continue;
    if (dryRun) {
      n++;
      continue;
    }
    const marqueId = await syncMissionClientContactsToMarque(
      row.targetBrand,
      row.marqueId,
      contacts
    );
    if (marqueId && marqueId !== row.marqueId) {
      await prisma.contactMission.update({
        where: { id: row.id },
        data: { marqueId },
      });
    }
    n++;
  }
  console.log(`ContactMission.clientContacts → MarqueContact: ${n}/${rows.length}`);
}

async function main() {
  console.log(dryRun ? "=== DRY RUN ===" : "=== BACKFILL marqueId ===");
  await backfillInbound();
  await backfillContactMissions();
  await backfillOpportunites();
  await backfillDemandesEntrantes();
  await backfillNegociations();
  await backfillPipelineContactsOnMarques();
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });
