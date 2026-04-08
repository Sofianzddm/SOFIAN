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

// En dev, le singleton (ou le premier new) peut être un client généré avant `prisma generate` :
// sans delegate dossierProspection → .create / .findMany undefined.
// Il faut rafraîchir même quand global était vide (premier import avec cache HMR bancal).
if (
  process.env.NODE_ENV !== "production" &&
  typeof (prisma as unknown as { dossierProspection?: unknown }).dossierProspection ===
    "undefined"
) {
  prisma = createPrismaClient();
}

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.prisma = prisma;
}

export { prisma };
export default prisma;
