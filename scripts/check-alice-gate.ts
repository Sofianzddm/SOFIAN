import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function normalizeLabel(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function main() {
  const alice = await prisma.user.findFirst({
    where: { prenom: { contains: "Alice", mode: "insensitive" }, role: "TM" },
    select: { id: true, prenom: true, nom: true, role: true, email: true },
  });
  console.log("Alice:", alice);
  if (!alice) return;

  const talents = await prisma.talent.findMany({
    where: {
      isArchived: false,
      OR: [
        { managerId: alice.id },
        { delegations: { some: { tmRelaiId: alice.id, actif: true } } },
      ],
    },
    select: { id: true },
  });
  const talentIds = talents.map((t) => t.id);
  console.log("talents count:", talentIds.length);

  const collabs = await prisma.collaboration.findMany({
    where: {
      talentId: { in: talentIds },
      isPrivate: false,
      statut: { not: "PERDU" },
    },
    select: {
      id: true,
      reference: true,
      contactKind: true,
      contactAgence: true,
      marque: { select: { nom: true, raisonSociale: true } },
      negociation: { select: { contactKind: true, contactAgence: true } },
    },
  });
  console.log("collabs non-privées non-perdues:", collabs.length);

  const byKind: Record<string, number> = {};
  for (const c of collabs) {
    const k = (c.contactKind || c.negociation?.contactKind || "NULL").toUpperCase();
    byKind[k] = (byKind[k] || 0) + 1;
  }
  console.log("by contactKind:", byKind);

  let incomplete = 0;
  const examples: any[] = [];
  for (const c of collabs) {
    const kind = (c.contactKind || c.negociation?.contactKind || "").toUpperCase();
    if (kind !== "AGENCE") continue;
    const agence = (c.contactAgence || c.negociation?.contactAgence || "").trim();
    const nom = (c.marque?.nom || "").trim();
    let bad = false;
    if (!nom) bad = true;
    else {
      const nNom = normalizeLabel(nom);
      if (agence && nNom === normalizeLabel(agence)) bad = true;
      const rs = (c.marque?.raisonSociale || "").trim();
      if (rs && nNom === normalizeLabel(rs) && (!agence || normalizeLabel(rs) === normalizeLabel(agence))) bad = true;
    }
    if (bad) {
      incomplete++;
      if (examples.length < 8) {
        examples.push({
          ref: c.reference,
          nom,
          agence,
          rs: c.marque?.raisonSociale,
          kind,
        });
      }
    }
  }
  console.log("incomplete AGENCE:", incomplete);
  console.log("examples:", JSON.stringify(examples, null, 2));
}

main().finally(() => prisma.$disconnect());
