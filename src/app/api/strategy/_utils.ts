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

// Valeurs par défaut utilisées à la première création du projet (le record
// Prisma fait ensuite foi ; modifier les dates en base si besoin).
// senderEmail : boîte Gmail qui envoie TOUTE la prospection du projet
// (null = leyna@glowupagence.fr).
const PROJECT_DEFAULTS: Record<
  string,
  { nom: string; dateDebut: string; dateFin: string; senderEmail: string | null }
> = {
  "villa-cannes": {
    nom: "Villa Cannes 2026",
    dateDebut: "2026-05-12T00:00:00.000Z",
    dateFin: "2026-05-25T23:59:59.999Z",
    senderEmail: null,
  },
  "ski-trip": {
    nom: "Ski Trip 2027",
    dateDebut: "2027-01-10T00:00:00.000Z",
    dateFin: "2027-01-17T23:59:59.999Z",
    senderEmail: "ines@glowupagence.fr",
  },
  "coachella-2026": {
    nom: "Coachella 2026",
    dateDebut: "2026-04-10T00:00:00.000Z",
    dateFin: "2026-04-19T23:59:59.999Z",
    senderEmail: "ines@glowupagence.fr",
  },
};

export async function getOrCreateVillaProject(projetSlug: string) {
  const defaults = PROJECT_DEFAULTS[projetSlug] ?? PROJECT_DEFAULTS["villa-cannes"];
  return prisma.projetEvenement.upsert({
    where: { slug: projetSlug },
    update: {},
    create: {
      nom: defaults.nom,
      slug: projetSlug,
      dateDebut: new Date(defaults.dateDebut),
      dateFin: new Date(defaults.dateFin),
      senderEmail: defaults.senderEmail,
      statut: "ACTIF",
    },
  });
}
