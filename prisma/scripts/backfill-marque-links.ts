/**
 * Rattache les enregistrements historiques à une fiche Marque via le nom extrait/saisi.
 *
 * Usage:
 *   pnpm tsx prisma/scripts/backfill-marque-links.ts
 *   pnpm tsx prisma/scripts/backfill-marque-links.ts --dry-run
 */

import prisma from "../../src/lib/prisma";
import {
  ensureMarqueContact,
  findOrCreateMarque,
  linkMarqueFromBrandName,
  parseSenderName,
  syncMissionClientContactsToMarque,
} from "../../src/lib/marque-resolver";

const dryRun = process.argv.includes("--dry-run");

async function backfillInbound() {
  // 1) Inbounds non encore liés : on résout/crée la marque ET on ajoute le sender comme contact marque
  const unlinked = await prisma.inboundOpportunity.findMany({
    where: { marqueId: null, extractedBrand: { not: null } },
    select: { id: true, extractedBrand: true, senderEmail: true, senderName: true },
  });
  let linkedCount = 0;
  for (const row of unlinked) {
    const name = row.extractedBrand?.trim();
    if (!name) continue;
    if (dryRun) {
      linkedCount++;
      continue;
    }
    const sender = parseSenderName(row.senderName);
    const r = await linkMarqueFromBrandName({
      brandName: name,
      source: "INBOUND",
      contact: row.senderEmail
        ? {
            email: row.senderEmail,
            prenom: sender.prenom,
            nom: sender.nom,
          }
        : undefined,
    });
    if (r?.marqueId) {
      await prisma.inboundOpportunity.update({
        where: { id: row.id },
        data: { marqueId: r.marqueId },
      });
      linkedCount++;
    }
  }
  console.log(`InboundOpportunity (lien marqueId + contact): ${linkedCount}/${unlinked.length}`);

  // 2) Inbounds déjà liés à une marque : on rattrape juste le contact (sender) manquant
  const alreadyLinked = await prisma.inboundOpportunity.findMany({
    where: { marqueId: { not: null }, senderEmail: { not: "" } },
    select: { id: true, marqueId: true, senderEmail: true, senderName: true },
  });
  let contactCount = 0;
  for (const row of alreadyLinked) {
    if (!row.marqueId || !row.senderEmail) continue;
    if (dryRun) {
      contactCount++;
      continue;
    }
    const sender = parseSenderName(row.senderName);
    await ensureMarqueContact({
      marqueId: row.marqueId,
      email: row.senderEmail,
      prenom: sender.prenom,
      nom: sender.nom,
    });
    contactCount++;
  }
  console.log(`InboundOpportunity (contacts existants): ${contactCount}/${alreadyLinked.length}`);
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

/** Parse "Marie Dupont <marie@brand.com>" → { email, prenom, nom } */
function parseFromHeader(from: string | null | undefined): {
  email: string | null;
  prenom: string | null;
  nom: string;
} {
  const raw = (from || "").trim();
  if (!raw) return { email: null, prenom: null, nom: "Contact" };
  const match = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (match) {
    const label = match[1]?.trim() || "";
    const email = match[2]?.trim().toLowerCase() || null;
    const parsed = parseSenderName(label);
    return { email, prenom: parsed.prenom, nom: parsed.nom };
  }
  // Pas de label, juste l'email
  if (raw.includes("@")) {
    return { email: raw.toLowerCase(), prenom: null, nom: raw.split("@")[0] || "Contact" };
  }
  const parsed = parseSenderName(raw);
  return { email: null, prenom: parsed.prenom, nom: parsed.nom };
}

async function backfillDemandesEntrantes() {
  // 1) Lien manquant
  const unlinked = await prisma.demandeEntrante.findMany({
    where: { marqueId: null, extractedBrand: { not: null } },
    select: { id: true, extractedBrand: true, from: true },
  });
  let linkedCount = 0;
  for (const row of unlinked) {
    const name = row.extractedBrand?.trim();
    if (!name) continue;
    if (dryRun) {
      linkedCount++;
      continue;
    }
    const sender = parseFromHeader(row.from);
    const r = await linkMarqueFromBrandName({
      brandName: name,
      source: "DEMANDE_ENTRANTE",
      contact: sender.email
        ? { email: sender.email, prenom: sender.prenom, nom: sender.nom }
        : undefined,
    });
    if (r?.marqueId) {
      await prisma.demandeEntrante.update({
        where: { id: row.id },
        data: { marqueId: r.marqueId },
      });
      linkedCount++;
    }
  }
  console.log(`DemandeEntrante (lien marqueId + contact): ${linkedCount}/${unlinked.length}`);

  // 2) Contacts manquants sur celles déjà liées
  const alreadyLinked = await prisma.demandeEntrante.findMany({
    where: { marqueId: { not: null } },
    select: { id: true, marqueId: true, from: true },
  });
  let contactCount = 0;
  for (const row of alreadyLinked) {
    if (!row.marqueId) continue;
    const sender = parseFromHeader(row.from);
    if (!sender.email) continue;
    if (dryRun) {
      contactCount++;
      continue;
    }
    await ensureMarqueContact({
      marqueId: row.marqueId,
      email: sender.email,
      prenom: sender.prenom,
      nom: sender.nom,
    });
    contactCount++;
  }
  console.log(`DemandeEntrante (contacts existants): ${contactCount}/${alreadyLinked.length}`);
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

/**
 * Copie contact_missions.clientContacts (JSON sur la carte pipeline) vers
 * marque_contacts (onglet Contacts de /marques/[id]). Idempotent (dédup email).
 */
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
