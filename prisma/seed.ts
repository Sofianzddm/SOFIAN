import { PrismaClient, Role } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function main() {
  console.log("🌱 Seeding database...");

  // ================================
  // Créer l'admin Sofian
  // ================================
  const hashedPassword = await bcrypt.hash("admin123", 12);
  
  const sofian = await prisma.user.upsert({
    where: { email: "sofian@glowup-agence.com" },
    update: {},
    create: {
      email: "sofian@glowup-agence.com",
      password: hashedPassword,
      prenom: "Sofian",
      nom: "Admin",
      role: Role.ADMIN,
      actif: true,
    },
  });
  console.log("✅ Admin Sofian créé:", sofian.email);

  // ================================
  // Créer Maud (Admin aussi)
  // ================================
  const maud = await prisma.user.upsert({
    where: { email: "maud@glowup-agence.com" },
    update: {},
    create: {
      email: "maud@glowup-agence.com",
      password: hashedPassword,
      prenom: "Maud",
      nom: "Assistante",
      role: Role.ADMIN,
      actif: true,
    },
  });
  console.log("✅ Admin Maud créée:", maud.email);

  // ================================
  // Créer la Head of Influence
  // ================================
  const headOf = await prisma.user.upsert({
    where: { email: "headof@glowup-agence.com" },
    update: {},
    create: {
      email: "headof@glowup-agence.com",
      password: hashedPassword,
      prenom: "Head",
      nom: "Of Influence",
      role: Role.HEAD_OF,
      actif: true,
    },
  });
  console.log("✅ Head of créée:", headOf.email);

  // ================================
  // Créer Leyna (Head of Sales)
  // ================================
  const leyna = await prisma.user.upsert({
    where: { email: "leyna@glowup-agence.com" },
    update: {},
    create: {
      email: "leyna@glowup-agence.com",
      password: hashedPassword,
      prenom: "Leyna",
      nom: "Head of Sales",
      role: Role.HEAD_OF_SALES,
      actif: true,
    },
  });
  console.log("✅ Head of Sales Leyna créée:", leyna.email);

  // ================================
  // Créer Ines (Account Manager / CM)
  // ================================
  const ines = await prisma.user.upsert({
    where: { email: "ines@glowup-agence.com" },
    update: {},
    create: {
      email: "ines@glowup-agence.com",
      password: hashedPassword,
      prenom: "Ines",
      nom: "Account Manager",
      role: Role.CM,
      actif: true,
    },
  });
  console.log("✅ Account Manager Ines créée:", ines.email);

  // ================================
  // Créer les Talent Managers
  // ================================
  const tmNames = [
    { prenom: "Daphné", nom: "TM" },
    { prenom: "Joey", nom: "TM" },
    { prenom: "Alice", nom: "TM" },
    { prenom: "Coralie", nom: "TM" },
    { prenom: "Cinssia", nom: "TM" },
  ];

  for (const tm of tmNames) {
    const email = `${tm.prenom.toLowerCase()}@glowup-agence.com`;
    const user = await prisma.user.upsert({
      where: { email },
      update: {},
      create: {
        email,
        password: hashedPassword,
        prenom: tm.prenom,
        nom: tm.nom,
        role: Role.TM,
        actif: true,
      },
    });
    console.log(`✅ TM ${tm.prenom} créé:`, user.email);
  }

  // ================================
  // Créer le compte Expert-Comptable
  // ================================
  const comptable = await prisma.user.upsert({
    where: { email: "comptable@glowup-agence.com" },
    update: {},
    create: {
      email: "comptable@glowup-agence.com",
      password: hashedPassword,
      prenom: "Cabinet",
      nom: "Expert-Comptable",
      role: Role.COMPTABLE,
      departement: "ADMIN",
      actif: true,
    },
  });
  console.log("✅ Expert-Comptable créé:", comptable.email);

  // ================================
  // Créer les paramètres agence
  // ================================
  const settings = await prisma.agenceSettings.upsert({
    where: { id: "default" },
    update: {},
    create: {
      id: "default",
      nom: "Glow Up Agence",
      email: "contact@glowup-agence.com",
      siteWeb: "https://glowup-agence.com",
    },
  });
  console.log("✅ Paramètres agence créés");

  // ================================
  // Initialiser les compteurs
  // ================================
  const currentYear = new Date().getFullYear();
  const compteurTypes = ["COLLAB", "BDC", "DEV", "FAC"];

  for (const type of compteurTypes) {
    await prisma.compteur.upsert({
      where: {
        type_annee: { type, annee: currentYear },
      },
      update: {},
      create: {
        type,
        annee: currentYear,
        dernierNumero: 0,
      },
    });
  }
  console.log("✅ Compteurs initialisés pour", currentYear);

  console.log("\n🎉 Seed terminé avec succès!");
  console.log("\n📝 Comptes créés (mot de passe: admin123):");
  console.log("   - sofian@glowup-agence.com (Admin)");
  console.log("   - maud@glowup-agence.com (Admin)");
  console.log("   - headof@glowup-agence.com (Head of)");
  console.log("   - leyna@glowup-agence.com (Head of Sales) 🎯");
  console.log("   - ines@glowup-agence.com (Account Manager) 💼");
  console.log("   - comptable@glowup-agence.com (Expert-Comptable) 📊");
  console.log("   - daphné@glowup-agence.com (TM)");
  console.log("   - joey@glowup-agence.com (TM)");
  console.log("   - alice@glowup-agence.com (TM)");
  console.log("   - coralie@glowup-agence.com (TM)");
  console.log("   - cinssia@glowup-agence.com (TM)");
}

main()
  .catch((e) => {
    console.error("❌ Erreur seed:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
