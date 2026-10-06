import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

function norm(s: string) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[''`]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Marques à retirer des projets (matching strict). */
function isBrandToRemove(name: string): boolean {
  const x = norm(name);
  const compact = x.replace(/\s/g, "");

  // L'OREAL exact — pas "men expert", pas Lancôme, etc.
  if (compact === "loreal" || x === "l oreal") return true;

  // Dior Beauty / Dior
  if (x === "dior" || x === "dior beauty" || x.startsWith("dior ")) return true;

  // Chloé exact
  if (x === "chloe") return true;

  // Corsair
  if (x === "corsair" || x.includes("corsair")) return true;

  return false;
}

function hasEmailable(
  contacts: Array<{
    email: string | null;
    emailSuggested: string | null;
    outreachExcluded: boolean;
    diffusionOptOut: boolean;
  }>
) {
  return contacts.some((c) => {
    if (c.outreachExcluded || c.diffusionOptOut) return false;
    const email = (c.email || c.emailSuggested || "").trim();
    return email.includes("@");
  });
}

async function main() {
  const admin = await prisma.user.findFirst({
    where: {
      role: "ADMIN",
      OR: [
        { email: { equals: "sofian@glowupagence.fr", mode: "insensitive" } },
        { email: { equals: "s.zeddam@glowupagence.fr", mode: "insensitive" } },
      ],
    },
    select: { id: true, email: true },
  });
  if (!admin) {
    throw new Error("Aucun admin Sofian trouvé pour tracer les events.");
  }

  const missions = await prisma.contactMission.findMany({
    where: {
      status: { not: "CANCELLED" },
      campaignId: { not: null },
    },
    select: {
      id: true,
      targetBrand: true,
      marqueId: true,
      campaignId: true,
      awaitingContactsCompletion: true,
      sentAt: true,
      stage: true,
      status: true,
      campaign: { select: { id: true, title: true } },
      marque: { select: { id: true, nom: true } },
    },
  });

  const toRemove = missions.filter((m) =>
    isBrandToRemove(m.marque?.nom || m.targetBrand || "")
  );

  console.log(`\n=== RETRAIT: ${toRemove.length} missions ===`);
  let deleted = 0;
  for (const m of toRemove) {
    if (!m.campaignId) continue;
    const label = m.marque?.nom || m.targetBrand;
    console.log(
      `- DELETE [${m.campaign?.title}] ${label} stage=${m.stage} awaiting=${m.awaitingContactsCompletion}`
    );
    await prisma.contactMission.delete({ where: { id: m.id } });
    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId: m.campaignId,
        actorId: admin.id,
        type: "BRANDS_ADDED",
        message: `Marque retirée : ${label}`,
        payload: {
          removed: label,
          missionId: m.id,
          source: "script-cleanup-locked-projet-brands",
          wasSent: Boolean(m.sentAt),
          stage: m.stage,
        },
      },
    });
    deleted += 1;
  }
  console.log(`Supprimées: ${deleted}`);

  // Débloquer les missions projet restantes avec ≥1 email utilisable
  const awaiting = await prisma.contactMission.findMany({
    where: {
      awaitingContactsCompletion: true,
      status: { not: "CANCELLED" },
      campaignId: { not: null },
    },
    select: {
      id: true,
      targetBrand: true,
      marqueId: true,
      marque: {
        select: {
          id: true,
          nom: true,
          contacts: {
            where: { outreachExcluded: false, diffusionOptOut: false },
            select: {
              email: true,
              emailSuggested: true,
              outreachExcluded: true,
              diffusionOptOut: true,
            },
          },
        },
      },
    },
  });

  const unlockableMarqueIds = [
    ...new Set(
      awaiting
        .filter((m) => m.marqueId && m.marque && hasEmailable(m.marque.contacts))
        .map((m) => m.marqueId as string)
    ),
  ];

  console.log(
    `\n=== DEBLOCAGE: ${unlockableMarqueIds.length} marques (>=1 email) ===`
  );

  const { resolveAwaitingEnrichissementForMarque } = await import(
    "../src/lib/resolve-awaiting-enrichissement"
  );

  let resolvedTotal = 0;
  for (const marqueId of unlockableMarqueIds) {
    const result = await resolveAwaitingEnrichissementForMarque({
      marqueId,
      actorId: admin.id,
      notifyCasting: false,
    });
    if (result.resolvedCount > 0) {
      resolvedTotal += result.resolvedCount;
      const name = result.missions[0]?.brandName || marqueId;
      console.log(`- ${name}: ${result.resolvedCount} mission(s)`);
    }
  }

  const stillBlocked = await prisma.contactMission.count({
    where: {
      awaitingContactsCompletion: true,
      status: { not: "CANCELLED" },
      campaignId: { not: null },
    },
  });

  console.log(`\nTotal débloqué: ${resolvedTotal}`);
  console.log(`Encore bloquées (projets): ${stillBlocked}`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
