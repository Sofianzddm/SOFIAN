/**
 * Rattache tous les emails @kingcom.fr trouvés dans le CRM (contacts marques,
 * cycle client) à l'agence Partner « Kingcom », et bascule le cycle client
 * vers la Prospection Agences quand nécessaire.
 *
 * Usage: npx tsx scripts/enroll-kingcom-agency.ts
 */
import prisma from "../src/lib/prisma";

const KINGCOM_PARTNER_ID = "cmm0gaqcw0000l204c8euihdh";

function cleanName(prenom: string | null | undefined, nom: string | null | undefined) {
  const p = (prenom || "").trim();
  const n = (nom || "").trim();
  // Évite « Mélanie Mélanie » / « Solenn Solenn »
  if (p && n && p.toLowerCase() === n.toLowerCase()) {
    return { prenom: p, nom: null as string | null };
  }
  return { prenom: p || n || "Contact", nom: n && n.toLowerCase() !== p.toLowerCase() ? n : null };
}

async function main() {
  const partner = await prisma.partner.findUnique({
    where: { id: KINGCOM_PARTNER_ID },
    select: { id: true, name: true, slug: true, market: true },
  });
  if (!partner) throw new Error("Partner Kingcom introuvable.");

  const admin = await prisma.user.findFirst({
    where: { role: "ADMIN", actif: true },
    orderBy: { createdAt: "asc" },
    select: { id: true, email: true },
  });
  if (!admin) throw new Error("Aucun ADMIN actif.");

  const marqueContacts = await prisma.marqueContact.findMany({
    where: { email: { endsWith: "@kingcom.fr", mode: "insensitive" } },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      language: true,
      marque: { select: { nom: true } },
    },
    orderBy: { createdAt: "asc" },
  });

  // Dédup par email (garde la fiche la plus « propre »)
  const byEmail = new Map<
    string,
    {
      prenom: string;
      nom: string | null;
      email: string;
      poste: string | null;
      language: string;
      fromMarques: string[];
    }
  >();

  for (const c of marqueContacts) {
    const email = (c.email || "").trim().toLowerCase();
    if (!email.endsWith("@kingcom.fr")) continue;
    const names = cleanName(c.prenom, c.nom);
    const existing = byEmail.get(email);
    if (!existing) {
      byEmail.set(email, {
        prenom: names.prenom,
        nom: names.nom,
        email,
        poste: c.poste,
        language: c.language === "en" ? "en" : "fr",
        fromMarques: [c.marque.nom],
      });
    } else {
      if (!existing.fromMarques.includes(c.marque.nom)) {
        existing.fromMarques.push(c.marque.nom);
      }
      // Enrichit poste / nom si manquant
      if (!existing.poste && c.poste) existing.poste = c.poste;
      if (!existing.nom && names.nom) existing.nom = names.nom;
    }
  }

  console.log(`Partner: ${partner.name} (${partner.id})`);
  console.log(`Emails @kingcom.fr uniques: ${byEmail.size}`);
  for (const c of byEmail.values()) {
    console.log(`  - ${c.email} | ${c.prenom} ${c.nom || ""} | via ${c.fromMarques.join(", ")}`);
  }

  let contactsCreated = 0;
  let contactsUpdated = 0;
  let targetsCreated = 0;
  let targetsMigrated = 0;
  let alreadyOk = 0;

  for (const row of byEmail.values()) {
    const agencyContact = await prisma.agencyContact.upsert({
      where: {
        partnerId_email: { partnerId: partner.id, email: row.email },
      },
      create: {
        partnerId: partner.id,
        prenom: row.prenom,
        nom: row.nom,
        email: row.email,
        poste: row.poste,
        language: row.language,
        createdById: admin.id,
      },
      update: {
        prenom: row.prenom,
        nom: row.nom,
        poste: row.poste || undefined,
        language: row.language,
        excluded: false,
      },
    });

    // upsert ne dit pas create vs update clairement → on compte via createdAt vs updatedAt approx
    const isNew =
      agencyContact.createdAt.getTime() === agencyContact.updatedAt.getTime() ||
      Date.now() - agencyContact.createdAt.getTime() < 5000;
    if (isNew) contactsCreated += 1;
    else contactsUpdated += 1;

    // Déjà en cycle agence ?
    const existingAgency = await prisma.agencyOutreachTarget.findUnique({
      where: { email: row.email },
      select: { id: true, partnerId: true, status: true },
    });
    if (existingAgency) {
      if (existingAgency.partnerId !== partner.id) {
        await prisma.agencyOutreachTarget.update({
          where: { id: existingAgency.id },
          data: {
            partnerId: partner.id,
            agencyContactId: agencyContact.id,
            company: partner.name,
            partnerSlug: partner.slug,
            firstname: row.prenom,
            lastname: row.nom,
          },
        });
        targetsMigrated += 1;
        console.log(`  ↪ target agence réaligné: ${row.email}`);
      } else {
        alreadyOk += 1;
      }
      continue;
    }

    // En cycle client → on migre (supprime client, crée agence en conservant le statut WAITING si possible)
    const clientTarget = await prisma.outreachTarget.findUnique({
      where: { email: row.email },
      select: {
        id: true,
        status: true,
        language: true,
        fromEmail: true,
        cycleCount: true,
        lastSentAt: true,
        nextRecontactAt: true,
        lastRepliedAt: true,
        company: true,
      },
    });

    if (clientTarget) {
      await prisma.$transaction(async (tx) => {
        await tx.outreachTarget.delete({ where: { id: clientTarget.id } });
        await tx.agencyOutreachTarget.create({
          data: {
            partnerId: partner.id,
            agencyContactId: agencyContact.id,
            firstname: row.prenom,
            lastname: row.nom,
            email: row.email,
            company: partner.name,
            partnerSlug: partner.slug,
            language: clientTarget.language === "en" ? "en" : row.language,
            market: partner.market === "BENELUX" ? "BENELUX" : "FR",
            status: clientTarget.status === "STOPPED" ? "STOPPED" : clientTarget.status,
            fromEmail: clientTarget.fromEmail,
            cycleCount: clientTarget.cycleCount,
            lastSentAt: clientTarget.lastSentAt,
            nextRecontactAt: clientTarget.nextRecontactAt,
            lastRepliedAt: clientTarget.lastRepliedAt,
            createdById: admin.id,
          },
        });
      });
      targetsMigrated += 1;
      console.log(
        `  ↪ migré client→agence: ${row.email} (était chez ${clientTarget.company}, ${clientTarget.status})`
      );
      continue;
    }

    // Pas encore en cycle → enrôler en TO_CONTACT
    await prisma.agencyOutreachTarget.create({
      data: {
        partnerId: partner.id,
        agencyContactId: agencyContact.id,
        firstname: row.prenom,
        lastname: row.nom,
        email: row.email,
        company: partner.name,
        partnerSlug: partner.slug,
        language: row.language,
        market: "FR",
        status: "TO_CONTACT",
        createdById: admin.id,
      },
    });
    targetsCreated += 1;
    console.log(`  + enrôlé TO_CONTACT: ${row.email}`);
  }

  const final = await prisma.agencyContact.count({ where: { partnerId: partner.id } });
  const finalTargets = await prisma.agencyOutreachTarget.count({
    where: { partnerId: partner.id },
  });

  console.log("\n=== Résultat ===");
  console.log(`Contacts créés: ${contactsCreated}`);
  console.log(`Contacts maj:   ${contactsUpdated}`);
  console.log(`Targets créés:  ${targetsCreated}`);
  console.log(`Targets migrés: ${targetsMigrated}`);
  console.log(`Déjà OK:        ${alreadyOk}`);
  console.log(`Total contacts Kingcom: ${final}`);
  console.log(`Total targets Kingcom:  ${finalTargets}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
