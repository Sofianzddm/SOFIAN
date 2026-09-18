/**
 * Audit + nettoyage : contacts marque / benelux / agency / clientContacts
 * qui correspondent à des talents Glow Up (email exact, nom, ou mail perso).
 *
 * Usage:
 *   npx tsx scripts/cleanup-talent-as-marque-contacts.ts           # dry-run
 *   npx tsx scripts/cleanup-talent-as-marque-contacts.ts --apply   # écrit
 */
import { PrismaClient } from "@prisma/client";
import { contactPersonKey } from "../src/lib/contact-person-key";

const APPLY = process.argv.includes("--apply");

const prisma = new PrismaClient();

const CONSUMER = new Set([
  "gmail.com",
  "googlemail.com",
  "yahoo.com",
  "yahoo.fr",
  "ymail.com",
  "hotmail.com",
  "hotmail.fr",
  "outlook.com",
  "outlook.fr",
  "live.com",
  "live.fr",
  "msn.com",
  "icloud.com",
  "me.com",
  "mac.com",
  "aol.com",
  "protonmail.com",
  "proton.me",
  "gmx.com",
  "gmx.fr",
  "orange.fr",
  "wanadoo.fr",
  "free.fr",
  "sfr.fr",
  "laposte.net",
  "bbox.fr",
  "numericable.fr",
  "yopmail.com",
  "mailinator.com",
]);

function tokenMatches(a: string, b: string): boolean {
  if (a === b) return true;
  if (a.length >= 3 && b.length >= 3 && (a.startsWith(b) || b.startsWith(a))) {
    return true;
  }
  return false;
}

function localPartTokens(email: string): string[] {
  return (email.split("@")[0] || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length >= 3);
}

type TalentRow = {
  prenom: string;
  nom: string;
  email: string;
  userEmail: string | null;
  nameTokens: string[];
};

function matchReason(
  email: string,
  prenom: string | null | undefined,
  nom: string | null | undefined,
  talentEmails: Set<string>,
  talentNames: Set<string>,
  talents: TalentRow[]
): string | null {
  const e = email.trim().toLowerCase();
  if (!e.includes("@")) return null;
  if (talentEmails.has(e)) return "email exact talent";

  const nameKey = contactPersonKey(prenom, nom);
  if (nameKey && talentNames.has(nameKey)) return "nom talent";

  const domain = e.split("@")[1] || "";
  if (!CONSUMER.has(domain)) return null;
  const local = localPartTokens(e);
  if (local.length === 0) return null;

  for (const t of talents) {
    if (t.nameTokens.length === 0) continue;
    let hits = 0;
    for (const nt of t.nameTokens) {
      if (local.some((lt) => tokenMatches(lt, nt))) hits += 1;
    }
    if (hits >= 2) return `mail perso ~ ${t.prenom} ${t.nom}`;
    if (hits >= 1 && local.length === 1 && t.nameTokens.length === 1) {
      return `mail perso ~ ${t.prenom} ${t.nom}`;
    }
  }
  return null;
}

async function main() {
  console.log(APPLY ? "=== APPLY (écriture) ===" : "=== DRY-RUN (aucune écriture) ===\n");

  const talentsRaw = await prisma.talent.findMany({
    select: {
      prenom: true,
      nom: true,
      email: true,
      user: { select: { email: true } },
    },
  });

  const talents: TalentRow[] = talentsRaw.map((t) => ({
    prenom: t.prenom,
    nom: t.nom,
    email: t.email,
    userEmail: t.user?.email ?? null,
    nameTokens: contactPersonKey(t.prenom, t.nom)
      .split(" ")
      .filter((x) => x.length >= 3),
  }));

  const talentEmails = new Set<string>();
  const talentNames = new Set<string>();
  for (const t of talents) {
    const e = (t.email || "").trim().toLowerCase();
    if (e.includes("@")) talentEmails.add(e);
    const ue = (t.userEmail || "").trim().toLowerCase();
    if (ue.includes("@")) talentEmails.add(ue);
    const k = contactPersonKey(t.prenom, t.nom);
    if (k) talentNames.add(k);
  }

  console.log(`Talents en base : ${talents.length}`);
  console.log(`Emails talent uniques : ${talentEmails.size}\n`);

  // ── Marque contacts ──────────────────────────────────────────────
  const marqueContacts = await prisma.marqueContact.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      outreachExcluded: true,
      marque: { select: { nom: true } },
    },
  });

  type Hit = {
    id: string;
    kind:
      | "marque"
      | "benelux"
      | "agency"
      | "outreach"
      | "agencyOutreach"
      | "beneluxOutreach"
      | "mission";
    label: string;
    email: string;
    name: string;
    reason: string;
    alreadyExcluded: boolean;
  };

  const hits: Hit[] = [];

  for (const c of marqueContacts) {
    const email = (c.email || "").trim().toLowerCase();
    const reason = matchReason(
      email,
      c.prenom,
      c.nom,
      talentEmails,
      talentNames,
      talents
    );
    if (!reason) continue;
    hits.push({
      id: c.id,
      kind: "marque",
      label: c.marque?.nom || "?",
      email,
      name: `${c.prenom || ""} ${c.nom || ""}`.trim(),
      reason,
      alreadyExcluded: c.outreachExcluded,
    });
  }

  // ── Benelux ──────────────────────────────────────────────────────
  const beneluxContacts = await prisma.beneluxContact.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      outreachExcluded: true,
      company: { select: { nom: true } },
    },
  });
  for (const c of beneluxContacts) {
    const email = (c.email || "").trim().toLowerCase();
    const reason = matchReason(
      email,
      c.prenom,
      c.nom,
      talentEmails,
      talentNames,
      talents
    );
    if (!reason) continue;
    hits.push({
      id: c.id,
      kind: "benelux",
      label: c.company?.nom || "?",
      email,
      name: `${c.prenom || ""} ${c.nom || ""}`.trim(),
      reason,
      alreadyExcluded: c.outreachExcluded,
    });
  }

  // ── Agency ───────────────────────────────────────────────────────
  const agencyContacts = await prisma.agencyContact.findMany({
    where: { email: { not: null } },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      excluded: true,
      partner: { select: { name: true } },
    },
  });
  for (const c of agencyContacts) {
    const email = (c.email || "").trim().toLowerCase();
    const reason = matchReason(
      email,
      c.prenom,
      c.nom,
      talentEmails,
      talentNames,
      talents
    );
    if (!reason) continue;
    hits.push({
      id: c.id,
      kind: "agency",
      label: c.partner?.name || "?",
      email,
      name: `${c.prenom || ""} ${c.nom || ""}`.trim(),
      reason,
      alreadyExcluded: c.excluded,
    });
  }

  // ── OutreachTarget ───────────────────────────────────────────────
  const outreachTargets = await prisma.outreachTarget.findMany({
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      company: true,
      status: true,
    },
  });
  for (const t of outreachTargets) {
    const email = (t.email || "").trim().toLowerCase();
    const reason = matchReason(
      email,
      t.firstname,
      t.lastname,
      talentEmails,
      talentNames,
      talents
    );
    if (!reason) continue;
    hits.push({
      id: t.id,
      kind: "outreach",
      label: t.company || "?",
      email,
      name: `${t.firstname || ""} ${t.lastname || ""}`.trim(),
      reason,
      alreadyExcluded: t.status === "STOPPED",
    });
  }

  // ── AgencyOutreachTarget ─────────────────────────────────────────
  const agencyTargets = await prisma.agencyOutreachTarget.findMany({
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      company: true,
      status: true,
    },
  });
  for (const t of agencyTargets) {
    const email = (t.email || "").trim().toLowerCase();
    const reason = matchReason(
      email,
      t.firstname,
      t.lastname,
      talentEmails,
      talentNames,
      talents
    );
    if (!reason) continue;
    hits.push({
      id: t.id,
      kind: "agencyOutreach",
      label: t.company || "?",
      email,
      name: `${t.firstname || ""} ${t.lastname || ""}`.trim(),
      reason,
      alreadyExcluded: t.status === "STOPPED",
    });
  }

  // ── BeneluxOutreachTarget ────────────────────────────────────────
  const beneluxTargets = await prisma.beneluxOutreachTarget.findMany({
    select: {
      id: true,
      email: true,
      firstname: true,
      lastname: true,
      companyName: true,
      status: true,
    },
  });
  for (const t of beneluxTargets) {
    const email = (t.email || "").trim().toLowerCase();
    const reason = matchReason(
      email,
      t.firstname,
      t.lastname,
      talentEmails,
      talentNames,
      talents
    );
    if (!reason) continue;
    hits.push({
      id: t.id,
      kind: "beneluxOutreach",
      label: t.companyName || "?",
      email,
      name: `${t.firstname || ""} ${t.lastname || ""}`.trim(),
      reason,
      alreadyExcluded: t.status === "STOPPED",
    });
  }

  // ── ContactMission.clientContacts (JSON) ─────────────────────────
  const missions = await prisma.contactMission.findMany({
    where: { clientContacts: { not: null as unknown as undefined } },
    select: {
      id: true,
      targetBrand: true,
      clientContacts: true,
      status: true,
    },
  });

  type MissionPatch = {
    id: string;
    brand: string;
    status: string;
    removed: Array<{ email: string; name: string; reason: string }>;
    nextContacts: unknown[];
  };
  const missionPatches: MissionPatch[] = [];

  for (const m of missions) {
    const list = Array.isArray(m.clientContacts) ? m.clientContacts : null;
    if (!list || list.length === 0) continue;
    const removed: MissionPatch["removed"] = [];
    const next: unknown[] = [];
    for (const raw of list) {
      const c = raw as {
        email?: string;
        firstname?: string;
        lastname?: string;
      };
      const email = String(c?.email || "")
        .trim()
        .toLowerCase();
      const reason = matchReason(
        email,
        c?.firstname,
        c?.lastname,
        talentEmails,
        talentNames,
        talents
      );
      if (reason) {
        removed.push({
          email,
          name: `${c?.firstname || ""} ${c?.lastname || ""}`.trim(),
          reason,
        });
        hits.push({
          id: m.id,
          kind: "mission",
          label: m.targetBrand || "?",
          email,
          name: `${c?.firstname || ""} ${c?.lastname || ""}`.trim(),
          reason,
          alreadyExcluded: false,
        });
      } else {
        next.push(raw);
      }
    }
    if (removed.length > 0) {
      missionPatches.push({
        id: m.id,
        brand: m.targetBrand || "?",
        status: String(m.status || ""),
        removed,
        nextContacts: next,
      });
    }
  }

  // ── Rapport ──────────────────────────────────────────────────────
  const byKind = (k: Hit["kind"]) => hits.filter((h) => h.kind === k);
  const printHits = (title: string, list: Hit[]) => {
    console.log(`\n## ${title} (${list.length})`);
    if (list.length === 0) {
      console.log("  (aucun)");
      return;
    }
    for (const h of list) {
      const flag = h.alreadyExcluded ? "déjà exclu" : "À NETTOYER";
      console.log(
        `  [${flag}] ${h.label} | ${h.email} | ${h.name || "—"} | ${h.reason}`
      );
    }
  };

  printHits("MarqueContact", byKind("marque"));
  printHits("BeneluxContact", byKind("benelux"));
  printHits("AgencyContact", byKind("agency"));
  printHits("OutreachTarget", byKind("outreach"));
  printHits("AgencyOutreachTarget", byKind("agencyOutreach"));
  printHits("BeneluxOutreachTarget", byKind("beneluxOutreach"));

  console.log(`\n## ContactMission.clientContacts (${missionPatches.length} missions)`);
  if (missionPatches.length === 0) {
    console.log("  (aucun)");
  } else {
    for (const p of missionPatches) {
      console.log(`  ${p.brand} [${p.status}] mission=${p.id}`);
      for (const r of p.removed) {
        console.log(`    - ${r.email} | ${r.name || "—"} | ${r.reason}`);
      }
    }
  }

  const toClean = hits.filter((h) => h.kind !== "mission" && !h.alreadyExcluded);
  console.log(
    `\nRésumé : ${hits.length} hits dont ${toClean.length} contacts actifs à exclure, ${missionPatches.length} missions à purger.`
  );

  if (!APPLY) {
    console.log("\nRelancer avec --apply pour écrire.");
    return;
  }

  let updated = 0;

  const marqueIds = byKind("marque")
    .filter((h) => !h.alreadyExcluded)
    .map((h) => h.id);
  if (marqueIds.length) {
    const r = await prisma.marqueContact.updateMany({
      where: { id: { in: marqueIds } },
      data: { outreachExcluded: true },
    });
    updated += r.count;
    console.log(`MarqueContact exclus : ${r.count}`);
  }

  // Aussi vider l'email des contacts marque talent pour qu'ils ne
  // réapparaissent plus dans les sélecteurs (on garde la ligne pour audit).
  // Non : trop destructif. On se contente d'exclure + retirer des missions.

  const beneluxIds = byKind("benelux")
    .filter((h) => !h.alreadyExcluded)
    .map((h) => h.id);
  if (beneluxIds.length) {
    const r = await prisma.beneluxContact.updateMany({
      where: { id: { in: beneluxIds } },
      data: { outreachExcluded: true },
    });
    updated += r.count;
    console.log(`BeneluxContact exclus : ${r.count}`);
  }

  const agencyIds = byKind("agency")
    .filter((h) => !h.alreadyExcluded)
    .map((h) => h.id);
  if (agencyIds.length) {
    const r = await prisma.agencyContact.updateMany({
      where: { id: { in: agencyIds } },
      data: { excluded: true },
    });
    updated += r.count;
    console.log(`AgencyContact exclus : ${r.count}`);
  }

  const outreachIds = byKind("outreach")
    .filter((h) => !h.alreadyExcluded)
    .map((h) => h.id);
  if (outreachIds.length) {
    const r = await prisma.outreachTarget.updateMany({
      where: { id: { in: outreachIds } },
      data: { status: "STOPPED", stoppedAt: new Date() },
    });
    updated += r.count;
    console.log(`OutreachTarget STOPPED : ${r.count}`);
  }

  const agencyOutreachIds = byKind("agencyOutreach")
    .filter((h) => !h.alreadyExcluded)
    .map((h) => h.id);
  if (agencyOutreachIds.length) {
    const r = await prisma.agencyOutreachTarget.updateMany({
      where: { id: { in: agencyOutreachIds } },
      data: { status: "STOPPED", stoppedAt: new Date() },
    });
    updated += r.count;
    console.log(`AgencyOutreachTarget STOPPED : ${r.count}`);
  }

  const beneluxOutreachIds = byKind("beneluxOutreach")
    .filter((h) => !h.alreadyExcluded)
    .map((h) => h.id);
  if (beneluxOutreachIds.length) {
    const r = await prisma.beneluxOutreachTarget.updateMany({
      where: { id: { in: beneluxOutreachIds } },
      data: { status: "STOPPED", stoppedAt: new Date() },
    });
    updated += r.count;
    console.log(`BeneluxOutreachTarget STOPPED : ${r.count}`);
  }

  for (const p of missionPatches) {
    await prisma.contactMission.update({
      where: { id: p.id },
      data: { clientContacts: p.nextContacts as object },
    });
    updated += 1;
    console.log(
      `Mission ${p.id} (${p.brand}) : retiré ${p.removed.map((r) => r.email).join(", ")}`
    );
  }

  console.log(`\n✅ Done. ${updated} écritures.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
