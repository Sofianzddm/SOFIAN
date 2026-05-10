import { PrismaClient } from "@prisma/client";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

function createPrismaClient() {
  return new PrismaClient({
    log:
      process.env.NODE_ENV === "development"
        ? ["query", "error", "warn"]
        : ["error"],
  });
}

let prisma = globalForPrisma.prisma ?? createPrismaClient();

// En dev, le singleton peut être un PrismaClient généré *avant* `prisma generate` : les delegates
// récents (ex. dossierProspection, cannesCoiffeurPrestation) restent alors `undefined`.
if (process.env.NODE_ENV !== "production") {
  const p = prisma as unknown as {
    dossierProspection?: unknown;
    cannesCoiffeurPrestation?: unknown;
  };
  if (typeof p.dossierProspection === "undefined" || typeof p.cannesCoiffeurPrestation === "undefined") {
    prisma = createPrismaClient();
  }
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export default prisma;
