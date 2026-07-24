import { prisma } from "../src/lib/prisma";

async function main() {
  const q = "Stabilo";

  const marques = await prisma.marque.findMany({
    where: { nom: { contains: q, mode: "insensitive" } },
    select: {
      id: true,
      nom: true,
      siteWeb: true,
      contacts: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          email: true,
          poste: true,
          language: true,
          source: true,
          emailLookupStatus: true,
          linkedinUrl: true,
          perimetre: true,
          localisation: true,
          priorite: true,
          outreachExcluded: true,
        },
      },
    },
  });
  console.log("=== FR (Marque) ===");
  for (const m of marques) {
    console.log(`- ${m.nom} (${m.id}) — site: ${m.siteWeb || "?"} — ${m.contacts.length} contacts`);
    for (const c of m.contacts) {
      console.log(`   • ${c.prenom || ""} ${c.nom} | ${c.email || "—"} | src=${c.source} | ${c.emailLookupStatus || "-"}`);
    }
  }

  const companies = await prisma.beneluxCompany.findMany({
    where: { nom: { contains: q, mode: "insensitive" } },
    select: {
      id: true,
      nom: true,
      contacts: { select: { id: true, prenom: true, nom: true, email: true, source: true, emailLookupStatus: true } },
    },
  });
  console.log("=== BENELUX (BeneluxCompany) ===");
  for (const c of companies) {
    console.log(`- ${c.nom} (${c.id}) — ${c.contacts.length} contacts`);
    for (const ct of c.contacts) {
      console.log(`   • ${ct.prenom || ""} ${ct.nom || ""} | ${ct.email || "—"} | src=${ct.source} | ${ct.emailLookupStatus || "-"}`);
    }
  }
}

main().finally(() => prisma.$disconnect());
