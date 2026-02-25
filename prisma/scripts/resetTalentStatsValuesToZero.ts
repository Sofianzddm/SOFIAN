import { PrismaClient, Prisma } from "@prisma/client";

const prisma = new PrismaClient();

async function main() {
  console.log("🔁 Réinitialisation des stats talents à 0 et lastUpdate à 45j...");

  const fortyFiveDaysAgo = new Date(Date.now() - 45 * 24 * 60 * 60 * 1000);

  const result = await prisma.talentStats.updateMany({
    data: {
      // Instagram
      igFollowers: 0,
      igFollowersEvol: 0,
      igEngagement: 0,
      igEngagementEvol: 0,
      igGenreFemme: 0,
      igGenreHomme: 0,
      igAge13_17: 0,
      igAge18_24: 0,
      igAge25_34: 0,
      igAge35_44: 0,
      igAge45Plus: 0,
      igLocFrance: 0,
      igLocAutre: null,

      // TikTok
      ttFollowers: 0,
      ttFollowersEvol: 0,
      ttEngagement: 0,
      ttEngagementEvol: 0,
      ttGenreFemme: 0,
      ttGenreHomme: 0,
      ttAge13_17: 0,
      ttAge18_24: 0,
      ttAge25_34: 0,
      ttAge35_44: 0,
      ttAge45Plus: 0,
      ttLocFrance: 0,
      ttLocAutre: null,

      // YouTube
      ytAbonnes: 0,
      ytAbonnesEvol: 0,

      // Stories
      storyViews30d: 0,
      storyViews7d: 0,
      storyLinkClicks30d: 0,
      storyScreenshots: Prisma.JsonNull,

      // Date de dernière mise à jour forcée à 45j
      lastUpdate: fortyFiveDaysAgo,
    },
  });

  console.log(`✅ Stats réinitialisées pour ${result.count} enregistrement(s) de TalentStats.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

