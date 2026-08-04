/**
 * Seed RH — crée/lie les profils RhEmployee aux User existants (ou en crée).
 * Usage: pnpm tsx scripts/seed-rh.ts
 */
import bcrypt from "bcryptjs";
import { PrismaClient, type RhRole } from "@prisma/client";

const prisma = new PrismaClient();

type SeedEmp = {
  email: string;
  prenom: string;
  nom: string;
  matricule: string;
  jobTitle: string;
  department: string;
  avatarColor: string;
  remoteAgreement: 0 | 2 | 3;
  rhRole: RhRole;
  hireDate: string;
  managerMatricule?: string;
  grossSalary?: number;
  cp?: number;
  rtt?: number;
  recup?: number;
};

const ROSTER: SeedEmp[] = [
  {
    email: "s.zeddam@glowupagence.fr",
    prenom: "Sofian",
    nom: "Ayad-Zeddam",
    matricule: "EMP-0001",
    jobTitle: "Fondateur",
    department: "Direction générale",
    avatarColor: "#E5F2B5",
    remoteAgreement: 2,
    rhRole: "HR",
    hireDate: "2020-01-15",
    grossSalary: 6500,
    cp: 25,
    rtt: 10,
    recup: 0,
  },
  {
    email: "maud@glowupagence.fr",
    prenom: "Maud",
    nom: "Arekonamand",
    matricule: "EMP-0004",
    jobTitle: "Assistante de direction",
    department: "Direction générale",
    avatarColor: "#8ED98A",
    remoteAgreement: 2,
    rhRole: "HR",
    hireDate: "2021-03-01",
    managerMatricule: "EMP-0001",
    grossSalary: 3200,
    cp: 22,
    rtt: 8,
    recup: 1,
  },
  {
    email: "manon.t@glowupagence.fr",
    prenom: "Manon",
    nom: "Teboul",
    matricule: "EMP-0007",
    jobTitle: "Talent Manager",
    department: "Talent Management",
    avatarColor: "#46D6C0",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2022-06-01",
    managerMatricule: "EMP-0001",
    cp: 18,
    rtt: 5,
  },
  {
    email: "daphne@glowupagence.fr",
    prenom: "Daphnée",
    nom: "Bessal",
    matricule: "EMP-0009",
    jobTitle: "Talent Manager / Cheffe de projet",
    department: "Talent Management",
    avatarColor: "#B48CF0",
    remoteAgreement: 3,
    rhRole: "COLLAB",
    hireDate: "2021-09-01",
    managerMatricule: "EMP-0001",
    cp: 20,
    rtt: 6,
  },
  {
    email: "coralie@glowupagence.fr",
    prenom: "Coralie",
    nom: "Loutre",
    matricule: "EMP-0011",
    jobTitle: "Talent Manager et Cheffe de projet",
    department: "Talent Management",
    avatarColor: "#F06FA8",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2022-01-10",
    managerMatricule: "EMP-0001",
    cp: 15,
    rtt: 4,
  },
  {
    email: "joey@glowupagence.fr",
    prenom: "Joey",
    nom: "Farrugia",
    matricule: "EMP-0012",
    jobTitle: "Talent Manager",
    department: "Talent Management",
    avatarColor: "#46D6C0",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2022-04-01",
    managerMatricule: "EMP-0001",
    cp: 14,
    rtt: 4,
  },
  {
    email: "anna@glowupagence.fr",
    prenom: "Anna",
    nom: "Jaume",
    matricule: "EMP-0015",
    jobTitle: "Talent Manager / Cheffe de projet",
    department: "Talent Management",
    avatarColor: "#5FB8E8",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2023-02-01",
    managerMatricule: "EMP-0001",
    cp: 12,
    rtt: 3,
  },
  {
    email: "ambre@glowupagence.fr",
    prenom: "Ambre",
    nom: "Claude",
    matricule: "EMP-0018",
    jobTitle: "Account Manager",
    department: "Business Development",
    avatarColor: "#F2874E",
    remoteAgreement: 3,
    rhRole: "COLLAB",
    hireDate: "2023-05-01",
    managerMatricule: "EMP-0001",
    cp: 10,
    rtt: 4,
  },
  {
    email: "cinssia@glowupagence.fr",
    prenom: "Cinssia",
    nom: "Soudani",
    matricule: "EMP-0019",
    jobTitle: "Talent Manager",
    department: "Talent Management",
    avatarColor: "#F2C24E",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2024-01-15",
    managerMatricule: "EMP-0001",
    cp: 8,
    rtt: 2,
  },
  {
    email: "manon.j@glowupagence.fr",
    prenom: "Manon",
    nom: "Jullien",
    matricule: "EMP-0021",
    jobTitle: "Partnerships & Casting Manager",
    department: "Business Development",
    avatarColor: "#46D6C0",
    remoteAgreement: 3,
    rhRole: "MANAGER",
    hireDate: "2022-09-01",
    managerMatricule: "EMP-0001",
    cp: 16,
    rtt: 5,
  },
  {
    email: "alice@glowupagence.fr",
    prenom: "Alice",
    nom: "Marinaro",
    matricule: "EMP-0024",
    jobTitle: "Talent Manager",
    department: "Talent Management",
    avatarColor: "#B48CF0",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2023-08-01",
    managerMatricule: "EMP-0001",
    cp: 11,
    rtt: 3,
  },
  {
    email: "janha@glowupagence.fr",
    prenom: "Janha",
    nom: "Messaoudi",
    matricule: "EMP-0027",
    jobTitle: "Social Media Manager",
    department: "Social Media",
    avatarColor: "#F2874E",
    remoteAgreement: 2,
    rhRole: "COLLAB",
    hireDate: "2023-11-01",
    managerMatricule: "EMP-0001",
    cp: 9,
    rtt: 3,
  },
  {
    email: "ines@glowupagence.fr",
    prenom: "Inès",
    nom: "Lettinger",
    matricule: "EMP-0030",
    jobTitle: "Account Manager",
    department: "Business Development",
    avatarColor: "#F0C24E",
    remoteAgreement: 3,
    rhRole: "COLLAB",
    hireDate: "2024-03-01",
    managerMatricule: "EMP-0001",
    cp: 6,
    rtt: 2,
  },
  {
    email: "leyna@glowupagence.fr",
    prenom: "Leyna",
    nom: "Khaled",
    matricule: "EMP-0042",
    jobTitle: "Account Manager",
    department: "Business Development",
    avatarColor: "#7C8CF8",
    remoteAgreement: 3,
    rhRole: "COLLAB",
    hireDate: "2025-12-02",
    managerMatricule: "EMP-0001",
    grossSalary: 2800,
    cp: 8.33,
    rtt: 3,
    recup: 2,
  },
];

async function ensureUser(e: SeedEmp) {
  const existing = await prisma.user.findFirst({
    where: { email: { equals: e.email, mode: "insensitive" } },
  });
  if (existing) return existing;
  const password = await bcrypt.hash("GlowUp2026!", 12);
  return prisma.user.create({
    data: {
      email: e.email,
      password,
      prenom: e.prenom,
      nom: e.nom,
      role: e.rhRole === "HR" || e.rhRole === "MANAGER" ? "ADMIN" : "TM",
      actif: true,
    },
  });
}

async function upsertBalances(
  employeeId: string,
  hireDate: Date,
  e: SeedEmp
) {
  const periodStart = new Date("2025-05-01");
  const periodEnd = new Date("2026-04-30");
  const today = new Date();
  const unlock = new Date(hireDate);
  unlock.setFullYear(unlock.getFullYear() + 1);
  const cpBookable = today >= unlock ? e.cp ?? 0 : 0;

  const rows: {
    accountCode: "CP" | "RTT" | "RECUP";
    label: string;
    accrued: number;
    remaining: number;
    bookable: number;
    expiresOn?: Date;
  }[] = [
    {
      accountCode: "CP",
      label: "Congés payés 2025/2026",
      accrued: e.cp ?? 0,
      remaining: e.cp ?? 0,
      bookable: cpBookable,
    },
    {
      accountCode: "RTT",
      label: "RTT 2026",
      accrued: e.rtt ?? 0,
      remaining: e.rtt ?? 0,
      bookable: e.rtt ?? 0,
      expiresOn: new Date("2026-12-31"),
    },
  ];
  if ((e.recup ?? 0) > 0) {
    rows.push({
      accountCode: "RECUP",
      label: "Récupération 2026",
      accrued: e.recup!,
      remaining: e.recup!,
      bookable: e.recup!,
      expiresOn: new Date("2026-08-16"),
    });
  }

  for (const r of rows) {
    await prisma.rhLeaveBalance.upsert({
      where: {
        employeeId_accountCode_periodStart: {
          employeeId,
          accountCode: r.accountCode,
          periodStart,
        },
      },
      create: {
        employeeId,
        accountCode: r.accountCode,
        label: r.label,
        periodStart,
        periodEnd,
        accrued: r.accrued,
        taken: 0,
        remaining: r.remaining,
        bookable: r.bookable,
        expiresOn: r.expiresOn,
      },
      update: {
        accrued: r.accrued,
        remaining: r.remaining,
        bookable: r.bookable,
        expiresOn: r.expiresOn,
      },
    });
  }
}

async function main() {
  const byMatricule = new Map<string, string>();

  // Pass 1: employees without managers
  for (const e of ROSTER) {
    const user = await ensureUser(e);
    const emp = await prisma.rhEmployee.upsert({
      where: { matricule: e.matricule },
      create: {
        userId: user.id,
        matricule: e.matricule,
        jobTitle: e.jobTitle,
        department: e.department,
        hireDate: new Date(e.hireDate),
        avatarColor: e.avatarColor,
        remoteAgreement: e.remoteAgreement,
        rhRole: e.rhRole,
        grossSalary: e.grossSalary,
        remoteAddressLine1:
          e.matricule === "EMP-0042"
            ? "14 rue des Cordeliers"
            : undefined,
        remoteCity: e.matricule === "EMP-0042" ? "Aix-en-Provence" : undefined,
        remotePostalCode: e.matricule === "EMP-0042" ? "13100" : undefined,
        remoteInsuranceExpiresOn:
          e.matricule === "EMP-0042" ? new Date("2026-12-31") : undefined,
      },
      update: {
        userId: user.id,
        jobTitle: e.jobTitle,
        department: e.department,
        avatarColor: e.avatarColor,
        remoteAgreement: e.remoteAgreement,
        rhRole: e.rhRole,
        grossSalary: e.grossSalary,
        actif: true,
      },
    });
    byMatricule.set(e.matricule, emp.id);
    await upsertBalances(emp.id, new Date(e.hireDate), e);

    if (e.matricule === "EMP-0042") {
      await prisma.rhDocument.createMany({
        data: [
          {
            employeeId: emp.id,
            kind: "CONTRACT",
            title: "Contrat CDI",
            status: "SIGNED",
            signedAt: new Date("2025-12-02"),
          },
          {
            employeeId: emp.id,
            kind: "REMOTE_AGREEMENT",
            title: "Avenant télétravail 3 j/semaine",
            status: "SIGNED",
            signedAt: new Date("2026-01-12"),
          },
          {
            employeeId: emp.id,
            kind: "PAYSLIP",
            title: "Bulletin juillet 2026",
            status: "ACTIVE",
            period: "2026-07",
          },
        ],
        skipDuplicates: true,
      });
      await prisma.rhVehicle.upsert({
        where: { employeeId: emp.id },
        create: {
          employeeId: emp.id,
          label: "Citadine 5 CV",
          fiscalHorsepower: 5,
          yearKm: 1200,
          carteGriseExpiresOn: new Date("2027-01-01"),
          insuranceExpiresOn: new Date("2026-12-31"),
          licenseExpiresOn: new Date("2030-06-01"),
        },
        update: {},
      });
    }
  }

  // Pass 2: managers
  for (const e of ROSTER) {
    if (!e.managerMatricule) continue;
    const id = byMatricule.get(e.matricule);
    const managerId = byMatricule.get(e.managerMatricule);
    if (id && managerId) {
      await prisma.rhEmployee.update({
        where: { id },
        data: { managerId },
      });
    }
  }

  console.log(`RH seed OK — ${ROSTER.length} collaborateurs`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
