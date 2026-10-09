import { PrismaClient } from "@prisma/client";
import { withEmailNormalization } from "@/lib/prisma-email-guard";

/** Bump uniquement si le singleton global doit être forcé après un `prisma generate`. */
const PRISMA_CLIENT_REV = 4;

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
  prismaClientRev?: number;
};

function createPrismaClient(): PrismaClient {
  const base = new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
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
