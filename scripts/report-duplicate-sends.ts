/**
 * Rapport EN LECTURE SEULE : parmi les doublons (même creatorName + targetBrandKey),
 * qu'est-ce qui a DÉJÀ ÉTÉ ENVOYÉ au client ? N'écrit / ne supprime RIEN.
 *
 * Objectif : distinguer
 *   - groupes SANS envoi (que des brouillons) → nettoyage trivial
 *   - groupes avec 1 seul envoi → garder la carte envoyée, supprimer les brouillons
 *   - groupes avec PLUSIEURS envois → double contact réel du client (à examiner)
 *
 * Usage : npx tsx --env-file=.env scripts/report-duplicate-sends.ts
 */
import { prisma } from "../src/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;

type Row = {
  id: string;
  creatorName: string;
  targetBrand: string;
  targetBrandKey: string;
  stage: string;
  status: string;
  sentAt: Date | null;
  relanceSentAt: Date | null;
  relance2SentAt: Date | null;
  sentMessageIds: unknown;
  clientContacts: unknown;
  createdAt: Date;
};

function sentEmails(m: Row): string[] {
  const ids = m.sentMessageIds;
  if (!ids || typeof ids !== "object") return [];
  return Object.entries(ids as Record<string, { threadId?: string; error?: string }>)
    .filter(([, r]) => r && r.threadId && !r.error)
    .map(([email]) => email.toLowerCase());
}

const isSent = (m: Row) => Boolean(m.sentAt) || sentEmails(m).length > 0;

async function main() {
  const missions: Row[] = await contactMissionModel.findMany({
    select: {
      id: true,
      creatorName: true,
      targetBrand: true,
      targetBrandKey: true,
      stage: true,
      status: true,
      sentAt: true,
      relanceSentAt: true,
      relance2SentAt: true,
      sentMessageIds: true,
      clientContacts: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  // Groupes (talent + marque) ayant >1 carte.
  const groups = new Map<string, Row[]>();
  for (const m of missions) {
    const key = `${(m.creatorName || "").trim().toLowerCase()}::${m.targetBrandKey || m.targetBrand}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }
  const dupGroups = Array.from(groups.values()).filter((g) => g.length > 1);

  let groupsNoSend = 0;
  let groupsOneSend = 0;
  const groupsMultiSend: Row[][] = [];
  let sameEmailMultiSend: Row[][] = [];

  for (const g of dupGroups) {
    const sentCards = g.filter(isSent);
    if (sentCards.length === 0) groupsNoSend += 1;
    else if (sentCards.length === 1) groupsOneSend += 1;
    else {
      groupsMultiSend.push(g);
      // Un même email contacté depuis 2 cartes différentes du même groupe ?
      const emailToCards = new Map<string, Set<string>>();
      for (const c of sentCards) {
        for (const e of sentEmails(c)) {
          if (!emailToCards.has(e)) emailToCards.set(e, new Set());
          emailToCards.get(e)!.add(c.id);
        }
      }
      const overlap = Array.from(emailToCards.values()).some((s) => s.size > 1);
      if (overlap) sameEmailMultiSend.push(g);
    }
  }

  console.log("=".repeat(78));
  console.log("DOUBLONS : ÉTAT DES ENVOIS (lecture seule)");
  console.log("=".repeat(78));
  console.log(`Groupes en doublon (talent+marque)          : ${dupGroups.length}`);
  console.log(`  · sans aucun envoi (que brouillons)       : ${groupsNoSend}`);
  console.log(`  · 1 seul envoi (garder la carte envoyée)  : ${groupsOneSend}`);
  console.log(`  · PLUSIEURS cartes envoyées               : ${groupsMultiSend.length}`);
  console.log(`     dont même adresse email recontactée    : ${sameEmailMultiSend.length}`);
  console.log("=".repeat(78));

  if (groupsMultiSend.length > 0) {
    console.log("\n>>> GROUPES AVEC PLUSIEURS ENVOIS RÉELS (le client a pu être contacté 2x) <<<\n");
    for (const g of groupsMultiSend) {
      console.log(`▶ ${g[0].creatorName} → ${g[0].targetBrand} [${g[0].targetBrandKey}]`);
      for (const m of g) {
        const emails = sentEmails(m);
        const flags: string[] = [];
        if (m.sentAt) flags.push(`envoyé ${new Date(m.sentAt).toLocaleDateString("fr-FR")}`);
        if (m.relanceSentAt) flags.push("relance1");
        if (m.relance2SentAt) flags.push("relance2");
        console.log(
          `    ${isSent(m) ? "📧" : "  "} ${m.id} | ${m.stage}/${m.status} | créée ${new Date(
            m.createdAt
          ).toLocaleDateString("fr-FR")}${flags.length ? " | " + flags.join(", ") : ""}` +
            `${emails.length ? ` | destinataires: ${emails.join(", ")}` : ""}`
        );
      }
      console.log();
    }
  }

  if (sameEmailMultiSend.length > 0) {
    console.log(
      `⚠️  ${sameEmailMultiSend.length} groupe(s) où la MÊME adresse a reçu un mail depuis 2 cartes différentes.`
    );
  } else if (groupsMultiSend.length > 0) {
    console.log(
      "ℹ️  Les envois multiples portent sur des adresses différentes (pas de doublon strict sur le même contact)."
    );
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
