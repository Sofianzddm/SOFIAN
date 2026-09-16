/**
 * Nettoyage des doublons de cartes pipeline (ContactMission).
 *
 * Doublon = MÊME talent (creatorName) + MÊME marque (targetBrandKey).
 * Les talents sont indépendants : une marque partagée entre talents n'est
 * JAMAIS un doublon.
 *
 * Règle de conservation, groupe par groupe :
 *   1. Groupe avec PLUSIEURS cartes réellement envoyées  → IGNORÉ (décision
 *      manuelle : ex. Vans/Alexis, Nuxe/Laura). On ne supprime rien.
 *   2. Groupe avec 1 carte envoyée/active                → on garde celle-là,
 *      on supprime les autres (brouillons).
 *   3. Groupe sans aucun envoi                           → on garde la carte la
 *      plus « riche » (contacts > brouillon > plus récente), on supprime le reste.
 *
 * Une carte envoyée / active n'est JAMAIS supprimée.
 *
 * Usage :
 *   npx tsx --env-file=.env scripts/cleanup-pipeline-duplicates.ts            # dry-run
 *   npx tsx --env-file=.env scripts/cleanup-pipeline-duplicates.ts --apply    # supprime
 */
import { prisma } from "../src/lib/prisma";

const contactMissionModel = (prisma as unknown as { contactMission: any }).contactMission;
const APPLY = process.argv.includes("--apply");

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
  draftEmailBody: string | null;
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

const isActive = (m: Row) =>
  isSent(m) ||
  Boolean(m.relanceSentAt || m.relance2SentAt) ||
  m.stage === "WON" ||
  m.stage === "IN_NEGOTIATION" ||
  m.stage === "RESPONSE_RECEIVED";

const contactsCount = (m: Row) => (Array.isArray(m.clientContacts) ? m.clientContacts.length : 0);

/** Score de richesse pour choisir quelle carte garder parmi des brouillons. */
function richnessScore(m: Row): number {
  let s = 0;
  if (contactsCount(m) > 0) s += 1000 + contactsCount(m);
  if (m.draftEmailBody) s += 100;
  if (m.stage === "TO_SEND") s += 50;
  else if (m.stage === "DRAFTED_FOR_VALIDATION") s += 30;
  else if (m.stage === "TO_DRAFT") s += 10;
  return s;
}

/** Retourne la carte à conserver dans un groupe (hors cas multi-envois ignorés). */
function pickKeeper(rows: Row[]): Row {
  const active = rows.filter(isActive);
  const pool = active.length > 0 ? active : rows;
  return pool.slice().sort((a, b) => {
    const ra = richnessScore(a);
    const rb = richnessScore(b);
    if (rb !== ra) return rb - ra;
    // à richesse égale, garder la plus récente
    return b.createdAt.getTime() - a.createdAt.getTime();
  })[0];
}

function fmt(m: Row): string {
  const flags: string[] = [];
  if (m.sentAt) flags.push(`envoyé ${new Date(m.sentAt).toLocaleDateString("fr-FR")}`);
  if (m.relanceSentAt) flags.push("relance1");
  if (m.relance2SentAt) flags.push("relance2");
  if (m.draftEmailBody) flags.push("brouillon");
  const c = contactsCount(m);
  if (c) flags.push(`${c} contact(s)`);
  return `${m.stage}/${m.status} | créée ${new Date(m.createdAt).toLocaleDateString("fr-FR")}${
    flags.length ? " | " + flags.join(", ") : ""
  }`;
}

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
      draftEmailBody: true,
      clientContacts: true,
      createdAt: true,
    },
    orderBy: { createdAt: "asc" },
  });

  const groups = new Map<string, Row[]>();
  for (const m of missions) {
    const key = `${(m.creatorName || "").trim().toLowerCase()}::${m.targetBrandKey || m.targetBrand}`;
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key)!.push(m);
  }

  const toDelete: Row[] = [];
  const skippedGroups: Row[][] = [];
  let cleanedGroups = 0;

  for (const rows of groups.values()) {
    if (rows.length < 2) continue;
    const sentCards = rows.filter(isSent);
    if (sentCards.length > 1) {
      skippedGroups.push(rows);
      continue;
    }
    const keeper = pickKeeper(rows);
    const removals = rows.filter((r) => r.id !== keeper.id);
    // Sécurité absolue : ne jamais supprimer une carte active.
    const safeRemovals = removals.filter((r) => !isActive(r));
    const unsafe = removals.filter((r) => isActive(r));
    if (unsafe.length > 0) {
      // cas improbable : plusieurs actives non détectées comme sent → on ignore.
      skippedGroups.push(rows);
      continue;
    }
    if (safeRemovals.length === 0) continue;
    cleanedGroups += 1;
    console.log(`▶ ${keeper.creatorName} → ${keeper.targetBrand}`);
    console.log(`   GARDE   ${keeper.id} | ${fmt(keeper)}`);
    for (const r of safeRemovals) {
      console.log(`   SUPPR.  ${r.id} | ${fmt(r)}`);
      toDelete.push(r);
    }
    console.log();
  }

  console.log("=".repeat(70));
  console.log(`Groupes nettoyés          : ${cleanedGroups}`);
  console.log(`Cartes à supprimer        : ${toDelete.length}`);
  console.log(`Groupes ignorés (manuel)  : ${skippedGroups.length}`);
  for (const g of skippedGroups) {
    console.log(`   ⏭  ${g[0].creatorName} → ${g[0].targetBrand} (plusieurs envois réels)`);
  }
  console.log("=".repeat(70));

  if (!APPLY) {
    console.log("\nDRY-RUN : aucune suppression effectuée. Relancer avec --apply pour supprimer.");
    return;
  }

  console.log(`\nAPPLY : suppression de ${toDelete.length} carte(s)…`);
  const ids = toDelete.map((r) => r.id);
  const res = await contactMissionModel.deleteMany({ where: { id: { in: ids } } });
  console.log(`✅ ${res.count} carte(s) supprimée(s).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
