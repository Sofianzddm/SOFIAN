/**
 * Garde-fou « à vie » : normalise les emails à CHAQUE écriture Prisma.
 *
 * Même si un formulaire, un import ou un script oublie `normalizeEmail`,
 * les chevrons < > et les headers "Name <email>" ne peuvent plus polluer
 * les tables CRM / outreach.
 */

import { Prisma, PrismaClient } from "@prisma/client";
import { normalizeEmail } from "@/lib/normalize-email";

/** Modèle Prisma → champs email à scrubber à l'écriture. */
const EMAIL_FIELDS: Record<string, readonly string[]> = {
  OutreachTarget: ["email"],
  AgencyOutreachTarget: ["email"],
  BeneluxOutreachTarget: ["email"],
  AgencyContact: ["email"],
  MarqueContact: ["email"],
  BeneluxContact: ["email"],
  InboundOpportunity: ["senderEmail"],
  Negociation: ["emailContact"],
  DemandeEntrante: [], // `from` est un header complet "Name <email>" — on ne le touche pas
};

function scrubEmailFields(
  model: string,
  data: Record<string, unknown> | null | undefined
): Record<string, unknown> | null | undefined {
  if (!data || typeof data !== "object") return data;
  const fields = EMAIL_FIELDS[model];
  if (!fields?.length) return data;

  let changed = false;
  const out: Record<string, unknown> = { ...data };
  for (const field of fields) {
    const raw = out[field];
    if (typeof raw !== "string") continue;
    const cleaned = normalizeEmail(raw);
    // Champ obligatoire (email) : on garde le nettoyé même vide (la validation
    // métier rejettera ensuite). Champ optionnel nullifiable : vide → null.
    const next =
      field === "email" || field === "senderEmail"
        ? cleaned
        : cleaned || null;
    if (next !== raw) {
      out[field] = next;
      changed = true;
    }
  }
  return changed ? out : data;
}

function scrubArgs(model: string, args: { data?: unknown } | null | undefined) {
  if (!args || typeof args !== "object") return args;
  if (!("data" in args) || args.data == null) return args;

  // createMany : data est un tableau
  if (Array.isArray(args.data)) {
    return {
      ...args,
      data: args.data.map((row) =>
        scrubEmailFields(model, row as Record<string, unknown>)
      ),
    };
  }

  return {
    ...args,
    data: scrubEmailFields(model, args.data as Record<string, unknown>),
  };
}

/**
 * Étend un PrismaClient avec le scrub automatique des emails.
 * À appliquer UNE fois à la création du client (voir `src/lib/prisma.ts`).
 */
export function withEmailNormalization<T extends PrismaClient>(client: T) {
  return client.$extends({
    name: "email-normalization",
    query: {
      $allModels: {
        async create({ model, args, query }) {
          return query(scrubArgs(model, args) as typeof args);
        },
        async update({ model, args, query }) {
          return query(scrubArgs(model, args) as typeof args);
        },
        async upsert({ model, args, query }) {
          const next = { ...args };
          if (args.create) {
            next.create = scrubEmailFields(
              model,
              args.create as Record<string, unknown>
            ) as typeof args.create;
          }
          if (args.update) {
            next.update = scrubEmailFields(
              model,
              args.update as Record<string, unknown>
            ) as typeof args.update;
          }
          return query(next);
        },
        async createMany({ model, args, query }) {
          return query(scrubArgs(model, args) as typeof args);
        },
        async updateMany({ model, args, query }) {
          return query(scrubArgs(model, args) as typeof args);
        },
      },
    },
  });
}

// Aide TypeScript : le client étendu reste utilisable comme PrismaClient
// pour les appels métier (les types exacts d'extension sont verbeux).
export type EmailNormalizedClient = ReturnType<typeof withEmailNormalization>;

// Ré-export Prisma pour les imports qui en ont besoin via ce module.
export { Prisma };
