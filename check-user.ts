import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

async function checkUser() {
  const email = process.argv[2];
  
  if (!email) {
    console.log("❌ Usage: tsx check-user.ts <email>");
    process.exit(1);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      email: true,
      prenom: true,
      nom: true,
      role: true,
      actif: true,
      password: true,
      createdAt: true,
    },
  });

  if (!user) {
    console.log(`❌ Utilisateur ${email} introuvable`);
    process.exit(1);
  }

  console.log("\n✅ Utilisateur trouvé:");
  console.log(`   ID: ${user.id}`);
  console.log(`   Nom: ${user.prenom} ${user.nom}`);
  console.log(`   Email: ${user.email}`);
  console.log(`   Rôle: ${user.role}`);
  console.log(`   Actif: ${user.actif}`);
  console.log(`   Créé le: ${user.createdAt}`);
  console.log(`   Mot de passe défini: ${user.password ? "✅ OUI" : "❌ NON"}`);
  
  if (user.password) {
    console.log(`   Hash commence par: ${user.password.substring(0, 10)}...`);
    console.log(`   Longueur du hash: ${user.password.length} caractères`);
  }

  await prisma.$disconnect();
}

checkUser().catch(console.error);
