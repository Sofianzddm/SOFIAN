import { prisma } from "@/lib/prisma";

export const STRATEGY_ALLOWED_ROLES = ["STRATEGY_PLANNER", "ADMIN"] as const;

export function canAccessStrategy(role: string): boolean {
  return STRATEGY_ALLOWED_ROLES.includes(role as (typeof STRATEGY_ALLOWED_ROLES)[number]);
}

export function sanitizeOpportuniteForRole<T extends { contacts: unknown }>(
  role: string,
  opportunite: T
) {
  if (role === "STRATEGY_PLANNER") {
    const { contacts, ...safe } = opportunite;
    return safe;
  }
  return opportunite;
}

export async function getOrCreateVillaProject(projetSlug: string) {
  return prisma.projetEvenement.upsert({
    where: { slug: projetSlug },
    update: {},
    create: {
      nom: "Villa Cannes 2026",
      slug: projetSlug,
      dateDebut: new Date("2026-05-12T00:00:00.000Z"),
      dateFin: new Date("2026-05-25T23:59:59.999Z"),
      statut: "ACTIF",
    },
  });
}
