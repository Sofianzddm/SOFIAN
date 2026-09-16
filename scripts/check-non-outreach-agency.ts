import prisma from "../src/lib/prisma";

async function main() {
  const contacts = await prisma.marqueContact.findMany({
    where: {
      source: "CARTO",
      outreachExcluded: false,
      outreachTargets: { none: {} },
    },
    select: {
      id: true,
      email: true,
      marque: { select: { id: true, nom: true, secteur: true } },
    },
  });

  const emails = contacts
    .map((c) => c.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));
  const inClientCycle = emails.length
    ? await prisma.outreachTarget.findMany({
        where: { email: { in: emails } },
        select: { email: true },
      })
    : [];
  const inClientSet = new Set(inClientCycle.map((t) => t.email.toLowerCase()));
  const filtered = contacts.filter((c) => {
    const e = c.email?.trim().toLowerCase();
    return !(e && inClientSet.has(e));
  });

  const emailsLeft = filtered
    .map((c) => c.email?.trim().toLowerCase())
    .filter((e): e is string => Boolean(e));

  const [agencyTargets, beneluxTargets, partners, agencyContacts] =
    await Promise.all([
      emailsLeft.length
        ? prisma.agencyOutreachTarget.findMany({
            where: { email: { in: emailsLeft } },
            select: { email: true, company: true, status: true },
          })
        : Promise.resolve([]),
      emailsLeft.length
        ? prisma.beneluxOutreachTarget.findMany({
            where: { email: { in: emailsLeft } },
            select: { email: true, company: true, status: true },
          })
        : Promise.resolve([]),
      prisma.partner.findMany({ select: { name: true } }),
      emailsLeft.length
        ? prisma.agencyContact.findMany({
            where: { email: { in: emailsLeft } },
            select: {
              email: true,
              partner: { select: { name: true } },
            },
          })
        : Promise.resolve([]),
    ]);

  const agencyEmailSet = new Set(agencyTargets.map((t) => t.email.toLowerCase()));
  const agencyContactEmailSet = new Set(
    agencyContacts
      .map((c) => c.email?.trim().toLowerCase())
      .filter((e): e is string => Boolean(e))
  );
  const beneluxEmailSet = new Set(
    beneluxTargets.map((t) => t.email.toLowerCase())
  );
  const partnerNames = new Set(partners.map((p) => p.name.trim().toLowerCase()));

  let inAgency = 0;
  let inAgencyContact = 0;
  let inBenelux = 0;
  const agencySamples: string[] = [];
  const secteurCounts = new Map<string, number>();
  const marquesPartner = new Set<string>();
  const marqueIds = new Set<string>();

  for (const c of filtered) {
    marqueIds.add(c.marque.id);
    const secteur = (c.marque.secteur || "(vide)").toLowerCase();
    secteurCounts.set(secteur, (secteurCounts.get(secteur) || 0) + 1);

    const e = c.email?.trim().toLowerCase();
    if (e && agencyEmailSet.has(e)) {
      inAgency++;
      if (agencySamples.length < 12) {
        const t = agencyTargets.find((x) => x.email.toLowerCase() === e);
        agencySamples.push(
          `${c.marque.nom} / ${e} → cycle agence: ${t?.company} (${t?.status})`
        );
      }
    }
    if (e && agencyContactEmailSet.has(e)) inAgencyContact++;
    if (e && beneluxEmailSet.has(e)) inBenelux++;
    if (partnerNames.has(c.marque.nom.trim().toLowerCase())) {
      marquesPartner.add(c.marque.nom);
    }
  }

  const topSecteurs = [...secteurCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 12);

  console.log(`Contacts influence hors cycle client : ${filtered.length}`);
  console.log(`Marques : ${marqueIds.size}`);
  console.log(`Emails déjà en cycle AGENCES : ${inAgency}`);
  console.log(`Emails présents comme AgencyContact : ${inAgencyContact}`);
  console.log(`Emails déjà en cycle BENELUX : ${inBenelux}`);
  console.log(
    `Marques dont le nom matche un Partner (agence) : ${marquesPartner.size}`
  );
  if (marquesPartner.size) {
    console.log("  →", [...marquesPartner].slice(0, 20).join(", "));
  }
  if (agencySamples.length) {
    console.log("\nExemples emails en cycle agences :");
    for (const s of agencySamples) console.log(" ", s);
  }
  console.log("\nTop secteurs :");
  for (const [s, n] of topSecteurs) console.log(`  ${s}: ${n}`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
