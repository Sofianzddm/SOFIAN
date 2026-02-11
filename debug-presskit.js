const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function debug() {
  console.log('\n🔍 DEBUG PRESS KIT\n');

  // 1. Vérifier la marque
  const brand = await prisma.brand.findUnique({
    where: { slug: 'tezenis' },
  });
  
  if (!brand) {
    console.log('❌ Aucune marque "tezenis" trouvée');
    console.log('💡 Créer la marque d\'abord via /api/presskit/generate-batch');
    await prisma.$disconnect();
    return;
  }
  
  console.log('✅ Marque trouvée:', brand.name);
  console.log('   Niche:', brand.niche);

  // 2. Vérifier les talents disponibles
  const allTalents = await prisma.talent.findMany({
    include: { stats: true },
    take: 5,
  });
  
  console.log(`\n📊 Total de talents en base: ${allTalents.length}`);
  
  if (allTalents.length > 0) {
    console.log('\n🎭 Exemple de talents:');
    allTalents.slice(0, 3).forEach(t => {
      console.log(`   - ${t.prenom} ${t.nom}`);
      console.log(`     Niches: [${t.niches.join(', ')}]`);
      console.log(`     Stats: ${t.stats ? '✅' : '❌ MANQUANT'}`);
      if (t.stats) {
        console.log(`     IG Followers: ${t.stats.igFollowers || 'N/A'}`);
        console.log(`     IG Engagement: ${t.stats.igEngagement || 'N/A'}`);
      }
    });
  }

  // 3. Tester la query de matching
  console.log(`\n🎯 Test matching avec niche "${brand.niche}":\n`);
  
  const matchingTalents = await prisma.talent.findMany({
    where: {
      niches: {
        has: brand.niche,
      },
    },
    include: {
      stats: true,
    },
    orderBy: {
      stats: {
        igEngagement: 'desc',
      },
    },
    take: 5,
  });

  console.log(`   Résultat: ${matchingTalents.length} talent(s) trouvé(s)`);
  
  if (matchingTalents.length > 0) {
    console.log('\n✅ Talents qui matchent:');
    matchingTalents.forEach(t => {
      console.log(`   - ${t.prenom} ${t.nom}`);
      console.log(`     Niches: [${t.niches.join(', ')}]`);
      console.log(`     Engagement: ${t.stats?.igEngagement || 'N/A'}%`);
    });
  } else {
    console.log('\n❌ Aucun talent ne match !');
    console.log('\n💡 Solutions:');
    console.log('   1. Vérifier que des talents ont la niche "' + brand.niche + '"');
    console.log('   2. Vérifier la casse (Fashion vs fashion)');
    console.log('   3. Ajouter des talents avec cette niche via Prisma Studio');
  }

  // 4. Vérifier les PressKitTalent existants
  const presskitTalents = await prisma.pressKitTalent.findMany({
    where: { brandId: brand.id },
    include: {
      talent: {
        include: { stats: true },
      },
    },
  });

  console.log(`\n📝 PressKitTalent en base: ${presskitTalents.length}`);
  if (presskitTalents.length > 0) {
    presskitTalents.forEach(pt => {
      console.log(`   - ${pt.talent.prenom} ${pt.talent.nom}`);
      console.log(`     Pitch: ${pt.pitch.substring(0, 80)}...`);
    });
  }

  await prisma.$disconnect();
}

debug().catch(console.error);
