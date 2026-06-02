import prisma from "@/lib/prisma";
import { ensureMarqueContact, parseSenderName } from "@/lib/marque-resolver";

/**
 * Reconstruit la liste `MarqueContact` à partir de TOUTES les sources :
 *   - InboundOpportunity (senderEmail / senderName)
 *   - DemandeEntrante (from)
 *   - Negociation (emailContact / contactMarque)
 *   - OpportuniteMarque.contacts (JSON [{firstName, lastName, email, role}])
 *   - ContactMission.clientContacts (JSON)
 *
 * Idempotent : `ensureMarqueContact` dédup par email par marque.
 */
export type BackfillContactsResult = {
  scanned: number;
  created: number;
  skipped: number;
  bySource: Record<string, { scanned: number; created: number }>;
  errors: string[];
};

/** Parse "Marie Dupont <marie@nike.com>" → { name: "Marie Dupont", email: "marie@nike.com" } */
function parseFromHeader(raw: string | null | undefined): {
  name: string | null;
  email: string | null;
} {
  if (!raw) return { name: null, email: null };
  const trimmed = raw.trim();

  const angleMatch = trimmed.match(/^(.*?)\s*<([^>]+)>\s*$/);
  if (angleMatch) {
    const name = angleMatch[1].replace(/^"|"$/g, "").trim() || null;
    const email = angleMatch[2].trim().toLowerCase() || null;
    return { name, email };
  }
  if (trimmed.includes("@")) {
    return { name: null, email: trimmed.toLowerCase() };
  }
  return { name: trimmed, email: null };
}

type JsonContact = {
  firstName?: string | null;
  lastName?: string | null;
  name?: string | null;
  email?: string | null;
  role?: string | null;
  poste?: string | null;
};

function normalizeJsonContacts(value: unknown): JsonContact[] {
  if (!value) return [];
  if (typeof value === "string") {
    try {
      return normalizeJsonContacts(JSON.parse(value));
    } catch {
      return [];
    }
  }
  if (Array.isArray(value)) return value as JsonContact[];
  if (typeof value === "object") return [value as JsonContact];
  return [];
}

export async function backfillMarqueContacts(
  options: { dryRun?: boolean } = {}
): Promise<BackfillContactsResult> {
  const result: BackfillContactsResult = {
    scanned: 0,
    created: 0,
    skipped: 0,
    bySource: {},
    errors: [],
  };

  const ensureBucket = (key: string) => {
    if (!result.bySource[key]) result.bySource[key] = { scanned: 0, created: 0 };
    return result.bySource[key];
  };

  const tryEnsure = async (
    bucketName: string,
    marqueId: string,
    payload: { email?: string | null; nom?: string | null; prenom?: string | null; poste?: string | null }
  ) => {
    const bucket = ensureBucket(bucketName);
    bucket.scanned++;
    result.scanned++;

    const email = payload.email?.trim().toLowerCase() || null;
    const nom = payload.nom?.trim() || null;
    if (!email && !nom) {
      result.skipped++;
      return;
    }

    if (options.dryRun) {
      bucket.created++;
      result.created++;
      return;
    }

    try {
      const before = await prisma.marqueContact.count({ where: { marqueId } });
      await ensureMarqueContact({
        marqueId,
        email,
        nom,
        prenom: payload.prenom,
        poste: payload.poste,
      });
      const after = await prisma.marqueContact.count({ where: { marqueId } });
      if (after > before) {
        bucket.created++;
        result.created++;
      } else {
        result.skipped++;
      }
    } catch (e) {
      result.errors.push(`${bucketName}: ${e instanceof Error ? e.message : "erreur"}`);
    }
  };

  // ─── 1. InboundOpportunity ─────────────────────────────────────────
  const inbounds = await prisma.inboundOpportunity.findMany({
    where: { marqueId: { not: null }, senderEmail: { not: "" } },
    select: { marqueId: true, senderEmail: true, senderName: true },
  });
  for (const row of inbounds) {
    if (!row.marqueId) continue;
    const { prenom, nom } = parseSenderName(row.senderName);
    await tryEnsure("inboundOpportunities", row.marqueId, {
      email: row.senderEmail,
      nom,
      prenom,
    });
  }

  // ─── 2. DemandeEntrante ────────────────────────────────────────────
  const demandes = await prisma.demandeEntrante.findMany({
    where: { marqueId: { not: null } },
    select: { marqueId: true, from: true },
  });
  for (const row of demandes) {
    if (!row.marqueId) continue;
    const { name, email } = parseFromHeader(row.from);
    const { prenom, nom } = parseSenderName(name);
    await tryEnsure("demandesEntrantes", row.marqueId, { email, nom, prenom });
  }

  // ─── 3. Negociation ────────────────────────────────────────────────
  const negos = await prisma.negociation.findMany({
    where: {
      marqueId: { not: null },
      OR: [{ emailContact: { not: null } }, { contactMarque: { not: null } }],
    },
    select: { marqueId: true, emailContact: true, contactMarque: true },
  });
  for (const row of negos) {
    if (!row.marqueId) continue;
    const { prenom, nom } = parseSenderName(row.contactMarque);
    await tryEnsure("negociations", row.marqueId, {
      email: row.emailContact,
      nom,
      prenom,
    });
  }

  // ─── 4. OpportuniteMarque.contacts (JSON) ──────────────────────────
  const opps = await prisma.opportuniteMarque.findMany({
    where: { marqueId: { not: null } },
    select: { marqueId: true, contacts: true },
  });
  for (const row of opps) {
    if (!row.marqueId) continue;
    const list = normalizeJsonContacts(row.contacts);
    for (const c of list) {
      const prenom = c.firstName?.trim() || null;
      const lastFromFull = !c.lastName && c.name ? parseSenderName(c.name).nom : null;
      const nom = (c.lastName?.trim() || lastFromFull || (prenom ? null : c.email?.split("@")[0])) ?? null;
      await tryEnsure("opportunitesMarque", row.marqueId, {
        email: c.email ?? null,
        nom,
        prenom,
        poste: c.role ?? c.poste ?? null,
      });
    }
  }

  // ─── 5. ContactMission.clientContacts (JSON) ───────────────────────
  const missions = await prisma.contactMission.findMany({
    where: { marqueId: { not: null } },
    select: { marqueId: true, clientContacts: true },
  });
  for (const row of missions) {
    if (!row.marqueId) continue;
    const list = normalizeJsonContacts(row.clientContacts);
    for (const c of list) {
      const prenom = c.firstName?.trim() || null;
      const lastFromFull = !c.lastName && c.name ? parseSenderName(c.name).nom : null;
      const nom = (c.lastName?.trim() || lastFromFull || (prenom ? null : c.email?.split("@")[0])) ?? null;
      await tryEnsure("contactMissions", row.marqueId, {
        email: c.email ?? null,
        nom,
        prenom,
        poste: c.role ?? c.poste ?? null,
      });
    }
  }

  return result;
}
