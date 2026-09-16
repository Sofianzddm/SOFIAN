import { PrismaClient } from "@prisma/client";
const prisma = new PrismaClient();

function normalizeLabel(s: string) {
  return s.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim();
}

async function main() {
  const alice = await prisma.user.findFirst({
    where: { prenom: { contains: "Alice", mode: "insensitive" }, role: "TM" },
    select: { id: true },
  });
  if (!alice) return;

  const talentIds = (
    await prisma.talent.findMany({
      where: {
        isArchived: false,
        OR: [
          { managerId: alice.id },
          { delegations: { some: { tmRelaiId: alice.id, actif: true } } },
        ],
      },
      select: { id: true },
    })
  ).map((t) => t.id);

  const partners = await prisma.partner.findMany({ select: { name: true } });
  const agencyNames = new Set(partners.map((p) => normalizeLabel(p.name)).filter(Boolean));

  const collabs = await prisma.collaboration.findMany({
    where: { talentId: { in: talentIds }, isPrivate: false, statut: { not: "PERDU" } },
    select: {
      reference: true,
      contactKind: true,
      contactAgence: true,
      marque: { select: { nom: true, raisonSociale: true } },
      negociation: { select: { contactKind: true, contactAgence: true } },
    },
  });

  const matchesAgencyName = collabs.filter((c) => {
    const nom = normalizeLabel(c.marque.nom || "");
    return agencyNames.has(nom) || /agence|agency|woo\b|influence4you|leap|kolsquare|reech/.test(nom);
  });

  console.log("collabs whose marque.nom matches known agency / agency-like:", matchesAgencyName.length);
  console.log(matchesAgencyName.map((c) => ({
    ref: c.reference,
    nom: c.marque.nom,
    kind: c.contactKind || c.negociation?.contactKind || null,
    rs: c.marque.raisonSociale,
  })));

  const agenceOk = collabs.filter((c) => {
    const kind = (c.contactKind || c.negociation?.contactKind || "").toUpperCase();
    return kind === "AGENCE";
  });
  console.log("\nAGENCE collabs detail:");
  for (const c of agenceOk) {
    console.log({
      ref: c.reference,
      nom: c.marque.nom,
      agence: c.contactAgence || c.negociation?.contactAgence,
      rs: c.marque.raisonSociale,
    });
  }

  // All TMs: how many incomplete with current heuristic
  const tms = await prisma.user.findMany({ where: { role: "TM", actif: true }, select: { id: true, prenom: true, nom: true } });
  for (const tm of tms) {
    const tids = (
      await prisma.talent.findMany({
        where: {
          isArchived: false,
          OR: [
            { managerId: tm.id },
            { delegations: { some: { tmRelaiId: tm.id, actif: true } } },
          ],
        },
        select: { id: true },
      })
    ).map((t) => t.id);
    if (!tids.length) continue;
    const cs = await prisma.collaboration.findMany({
      where: {
        talentId: { in: tids },
        isPrivate: false,
        statut: { not: "PERDU" },
        OR: [{ contactKind: "AGENCE" }, { negociation: { is: { contactKind: "AGENCE" } } }],
      },
      select: {
        contactAgence: true,
        marque: { select: { nom: true, raisonSociale: true } },
        negociation: { select: { contactAgence: true } },
      },
    });
    let inc = 0;
    for (const c of cs) {
      const agence = (c.contactAgence || c.negociation?.contactAgence || "").trim();
      const nom = (c.marque.nom || "").trim();
      if (!nom) { inc++; continue; }
      const nNom = normalizeLabel(nom);
      if (agence && nNom === normalizeLabel(agence)) inc++;
      else {
        const rs = (c.marque.raisonSociale || "").trim();
        if (rs && nNom === normalizeLabel(rs) && (!agence || normalizeLabel(rs) === normalizeLabel(agence))) inc++;
      }
    }
    console.log(`${tm.prenom} ${tm.nom}: AGENCE=${cs.length} incomplete=${inc}`);
  }
}

main().finally(() => prisma.$disconnect());
