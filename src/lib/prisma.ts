import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { Pool } from "pg";
import { withEmailNormalization } from "@/lib/prisma-email-guard";

/** Bump uniquement si le singleton global doit être forcé après un `prisma generate`. */
const PRISMA_CLIENT_REV = 5;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaClientRev?: number;
  prismaPool?: Pool;
};

function createPrismaClient(): PrismaClient {
  const log =
    process.env.NODE_ENV === "development"
      ? (["query", "error", "warn"] as const)
      : (["error"] as const);

  /**
   * En local, Node/Prisma résolvent souvent Neon en IPv6 en premier.
   * Sur ce réseau l’IPv6 timeoute alors que l’IPv4 répond → « Can't reach database ».
   * Adapter `pg` + `family: 4` force IPv4 sans toucher à la DATABASE_URL.
   * En production (Vercel etc.) on garde le moteur Prisma natif.
   */
  const connectionString = process.env.DATABASE_URL;
  if (process.env.NODE_ENV !== "production" && connectionString) {
    const pool =
      globalForPrisma.prismaPool ??
      new Pool({
        connectionString,
        ssl: { rejectUnauthorized: false },
        // Force IPv4 (évite le timeout IPv6 → Neon). `family` est supporté runtime par `pg`
        // mais absent des types PoolConfig selon les versions de @types/pg.
        ...({ family: 4 } as object),
      });
    globalForPrisma.prismaPool = pool;
    const adapter = new PrismaPg(pool);
    const base = new PrismaClient({ adapter, log: [...log] });
    return withEmailNormalization(base) as unknown as PrismaClient;
  }

  const base = new PrismaClient({ log: [...log] });
  return withEmailNormalization(base) as unknown as PrismaClient;
}

function missingDelegates(client: PrismaClient): boolean {
  const p = client as unknown as Record<string, unknown>;
  return (
    typeof p.rhEmployee === "undefined" ||
    typeof p.rhPayslipScan === "undefined" ||
    typeof p.rhSettings === "undefined" ||
    typeof p.rhLoginChallenge === "undefined" ||
    typeof p.dossierProspection === "undefined" ||
    typeof p.cannesCoiffeurPrestation === "undefined" ||
    typeof p.fwCartoFile === "undefined" ||
    typeof p.dcPolicy === "undefined"
  );
}

function getClient(): PrismaClient {
  const existing = globalForPrisma.prisma;
  const revOk = globalForPrisma.prismaClientRev === PRISMA_CLIENT_REV;
  if (
    process.env.NODE_ENV !== "production" &&
    existing &&
    revOk &&
    !missingDelegates(existing)
  ) {
    return existing;
  }
  if (
    process.env.NODE_ENV === "production" &&
    existing &&
    !missingDelegates(existing)
  ) {
    return existing;
  }

  // Ne jamais $disconnect() l’ancien client ici (casse les requêtes en cours).
  const client = createPrismaClient();
  if (process.env.NODE_ENV !== "production") {
    globalForPrisma.prisma = client;
    globalForPrisma.prismaClientRev = PRISMA_CLIENT_REV;
  }
  return client;
}

const prisma = getClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaClientRev = PRISMA_CLIENT_REV;
}

export { prisma };
export default prisma;
