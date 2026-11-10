import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  detectEmailPattern,
  domainFromWebsite,
  suggestEmailsForContact,
} from "@/lib/email-pattern";
import {
  dismissBeneluxEnrichissementDuplicatesBatch,
  dismissMarqueEnrichissementDuplicatesBatch,
} from "@/lib/contact-person-key";
import type { KnownEmailRow } from "@/lib/cross-market-enroll";

/**
 * GET → enrichissement : contacts carto FR + BENELUX (+ Agences si ADMIN)
 * en attente d'email (QUEUED).
 *
 * Perf : lectures batchées (plus de N+1 séquentiel par marque), purge des
 * doublons en batch parallèle borné, motifs / sibling calculés en mémoire.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

type Enriched = {
  id: string;
  prenom: string | null;
  nom: string;
  poste: string | null;
  perimetre: string | null;
  localisation: string | null;
  priorite: string | null;
  linkedinUrl: string | null;
  language: string;
  emailSuggested: string | null;
  emailLookupQueuedAt: Date | string | null;
  marqueId: string;
  company: string;
  market: "FR" | "BENELUX" | "AGENCY" | "FW";
  source: "CARTO" | "AO" | null;
  siblingCompany?: boolean;
  patternCrossMarket?: boolean;
  pattern: {
    kind: string;
    domain: string;
    matches: number;
    label: string;
  } | null;
  suggestions: ReturnType<typeof suggestEmailsForContact>;
};

function mergeKnownRows(rows: KnownEmailRow[]): KnownEmailRow[] {
  const byEmail = new Map<string, KnownEmailRow>();
  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email || byEmail.has(email)) continue;
    byEmail.set(email, {
      email,
      prenom: row.prenom,
      nom: row.nom,
    });
  }
  return Array.from(byEmail.values());
}

function takeKnownByParent(
  rows: Array<{ parentId: string; email: string | null; prenom: string | null; nom: string | null }>,
  limit = 50
): Map<string, KnownEmailRow[]> {
  const map = new Map<string, KnownEmailRow[]>();
  for (const row of rows) {
    const email = (row.email || "").trim().toLowerCase();
    if (!email) continue;
    const list = map.get(row.parentId) || [];
    if (list.length >= limit) continue;
    if (list.some((r) => r.email === email)) continue;
    list.push({ email, prenom: row.prenom, nom: row.nom });
    map.set(row.parentId, list);
  }
  return map;
}

function patternPayload(
  pattern: ReturnType<typeof detectEmailPattern>
): Enriched["pattern"] {
  if (!pattern) return null;
  return {
    kind: pattern.kind,
    domain: pattern.domain,
    matches: pattern.matches,
    label: `${pattern.kind}@${pattern.domain}`,
  };
}

const NAME_OR_CHUNK = 40;

async function findByInsensitiveNames<T extends { id: string; nom: string }>(
  names: string[],
  finder: (
    chunk: string[]
  ) => Promise<T[]>
): Promise<T[]> {
  if (names.length === 0) return [];
  const out: T[] = [];
  for (let i = 0; i < names.length; i += NAME_OR_CHUNK) {
    const chunk = names.slice(i, i + NAME_OR_CHUNK);
    out.push(...(await finder(chunk)));
  }
  return out;
}

/** Résout les sociétés BE liées aux marques FR (linkedMarqueId puis homonyme). */
async function resolveBeCompanyIdsForMarques(
  marqueIds: string[],
  companyNameByMarque: Map<string, string>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (marqueIds.length === 0) return result;

  const linked = await prisma.beneluxCompany.findMany({
    where: { linkedMarqueId: { in: marqueIds } },
    select: { id: true, linkedMarqueId: true },
  });
  for (const row of linked) {
    if (row.linkedMarqueId) result.set(row.linkedMarqueId, row.id);
  }

  const missing = marqueIds.filter((id) => !result.has(id));
  if (missing.length === 0) return result;

  const names = Array.from(
    new Set(
      missing
        .map((id) => (companyNameByMarque.get(id) || "").trim())
        .filter(Boolean)
    )
  );
  if (names.length === 0) return result;

  const byName = await findByInsensitiveNames(names, (chunk) =>
    prisma.beneluxCompany.findMany({
      where: {
        OR: chunk.map((nom) => ({
          nom: { equals: nom, mode: "insensitive" as const },
        })),
      },
      select: { id: true, nom: true },
    })
  );
  const idByNorm = new Map(
    byName.map((b) => [b.nom.trim().toLowerCase(), b.id])
  );
  for (const marqueId of missing) {
    const nom = (companyNameByMarque.get(marqueId) || "").trim().toLowerCase();
    const beId = idByNorm.get(nom);
    if (beId) result.set(marqueId, beId);
  }
  return result;
}

/** Résout les marques FR liées aux entreprises BE. */
async function resolveMarqueIdsForBeneluxCompanies(
  companyIds: string[],
  companyNameById: Map<string, string>,
  linkedMarqueByCompany: Map<string, string | null>
): Promise<Map<string, string>> {
  const result = new Map<string, string>();
  if (companyIds.length === 0) return result;

  for (const companyId of companyIds) {
    const linked = linkedMarqueByCompany.get(companyId);
    if (linked) result.set(companyId, linked);
  }

  const missing = companyIds.filter((id) => !result.has(id));
  if (missing.length === 0) return result;

  const names = Array.from(
    new Set(
      missing
        .map((id) => (companyNameById.get(id) || "").trim())
        .filter(Boolean)
    )
  );
  if (names.length === 0) return result;

  const byName = await findByInsensitiveNames(names, (chunk) =>
    prisma.marque.findMany({
      where: {
        OR: chunk.map((nom) => ({
          nom: { equals: nom, mode: "insensitive" as const },
        })),
      },
      select: { id: true, nom: true },
    })
  );
  const idByNorm = new Map(
    byName.map((m) => [m.nom.trim().toLowerCase(), m.id])
  );
  for (const companyId of missing) {
    const nom = (companyNameById.get(companyId) || "").trim().toLowerCase();
    const marqueId = idByNorm.get(nom);
    if (marqueId) result.set(companyId, marqueId);
  }
  return result;
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }
    const isAdmin = role === "ADMIN";

    const enriched: Enriched[] = [];

    // —— FR : 1 lecture QUEUED, purge batch, motifs / sibling batch ——
    const frContactsRaw = await prisma.marqueContact.findMany({
      where: {
        emailLookupStatus: "QUEUED",
        outreachExcluded: false,
        diffusionOptOut: false,
        source: { in: ["CARTO", "AO"] },
      },
      orderBy: [{ emailLookupQueuedAt: "asc" }, { priorite: "asc" }],
      select: {
        id: true,
        prenom: true,
        nom: true,
        poste: true,
        perimetre: true,
        localisation: true,
        priorite: true,
        linkedinUrl: true,
        language: true,
        source: true,
        emailSuggested: true,
        emailLookupQueuedAt: true,
        marqueId: true,
        marque: { select: { nom: true, siteWeb: true } },
      },
    });

    const frMarqueIds = Array.from(new Set(frContactsRaw.map((c) => c.marqueId)));
    const frDismissed =
      frMarqueIds.length > 0
        ? await dismissMarqueEnrichissementDuplicatesBatch(frMarqueIds)
        : new Set<string>();
    const frContacts = frContactsRaw.filter((c) => !frDismissed.has(c.id));

    const frByMarque = new Map<string, typeof frContacts>();
    const frCompanyName = new Map<string, string>();
    const frSiteWeb = new Map<string, string | null>();
    for (const c of frContacts) {
      const list = frByMarque.get(c.marqueId) || [];
      list.push(c);
      frByMarque.set(c.marqueId, list);
      frCompanyName.set(c.marqueId, c.marque.nom);
      frSiteWeb.set(c.marqueId, c.marque.siteWeb);
    }

    const activeFrMarqueIds = Array.from(frByMarque.keys());
    const beIdByMarqueId = await resolveBeCompanyIdsForMarques(
      activeFrMarqueIds,
      frCompanyName
    );

    const [frKnownRows, beKnownForFr] = await Promise.all([
      activeFrMarqueIds.length > 0
        ? prisma.marqueContact.findMany({
            where: { marqueId: { in: activeFrMarqueIds }, email: { not: null } },
            select: {
              marqueId: true,
              email: true,
              prenom: true,
              nom: true,
            },
          })
        : Promise.resolve([]),
      (() => {
        const beIds = Array.from(new Set(beIdByMarqueId.values()));
        if (beIds.length === 0) return Promise.resolve([]);
        return prisma.beneluxContact.findMany({
          where: { companyId: { in: beIds }, email: { not: null } },
          select: {
            companyId: true,
            email: true,
            prenom: true,
            nom: true,
          },
        });
      })(),
    ]);

    const frKnownByMarque = takeKnownByParent(
      frKnownRows.map((r) => ({
        parentId: r.marqueId,
        email: r.email,
        prenom: r.prenom,
        nom: r.nom,
      }))
    );
    const beKnownByCompany = takeKnownByParent(
      beKnownForFr.map((r) => ({
        parentId: r.companyId,
        email: r.email,
        prenom: r.prenom,
        nom: r.nom,
      }))
    );

    for (const [marqueId, list] of frByMarque) {
      const beId = beIdByMarqueId.get(marqueId);
      const known = mergeKnownRows([
        ...(frKnownByMarque.get(marqueId) || []),
        ...(beId ? beKnownByCompany.get(beId) || [] : []),
      ]);
      const pattern = detectEmailPattern(known);
      const fallbackDomain =
        pattern?.domain || domainFromWebsite(frSiteWeb.get(marqueId) || null);
      const crossMarket = Boolean(beId);
      const siblingCompany = crossMarket;
      const patternObj = patternPayload(pattern);

      for (const c of list) {
        const suggestions = suggestEmailsForContact({
          prenom: c.prenom,
          nom: c.nom,
          pattern,
          fallbackDomain,
        });
        enriched.push({
          id: c.id,
          prenom: c.prenom,
          nom: c.nom,
          poste: c.poste,
          perimetre: c.perimetre,
          localisation: c.localisation,
          priorite: c.priorite,
          linkedinUrl: c.linkedinUrl,
          language: c.language,
          emailSuggested: c.emailSuggested || suggestions[0]?.email || null,
          emailLookupQueuedAt: c.emailLookupQueuedAt,
          marqueId: c.marqueId,
          company: c.marque.nom,
          market: "FR",
          source: (c.source as "CARTO" | "AO" | null) ?? null,
          siblingCompany,
          patternCrossMarket: crossMarket,
          pattern: patternObj,
          suggestions,
        });
      }
    }

    // —— BENELUX ——
    const beContactsRaw = await prisma.beneluxContact.findMany({
      where: {
        emailLookupStatus: "QUEUED",
        outreachExcluded: false,
        source: { in: ["CARTO", "AO"] },
      },
      orderBy: [{ emailLookupQueuedAt: "asc" }, { priorite: "asc" }],
      select: {
        id: true,
        prenom: true,
        nom: true,
        poste: true,
        perimetre: true,
        localisation: true,
        priorite: true,
        linkedinUrl: true,
        language: true,
        source: true,
        emailSuggested: true,
        emailLookupQueuedAt: true,
        companyId: true,
        company: {
          select: { nom: true, siteWeb: true, linkedMarqueId: true },
        },
      },
    });

    const beCompanyIdsQueued = Array.from(
      new Set(beContactsRaw.map((c) => c.companyId))
    );
    const beDismissed =
      beCompanyIdsQueued.length > 0
        ? await dismissBeneluxEnrichissementDuplicatesBatch(beCompanyIdsQueued)
        : new Set<string>();
    const beContacts = beContactsRaw.filter((c) => !beDismissed.has(c.id));

    const beByCompany = new Map<string, typeof beContacts>();
    const beCompanyName = new Map<string, string>();
    const beSiteWeb = new Map<string, string | null>();
    const beLinkedMarque = new Map<string, string | null>();
    for (const c of beContacts) {
      const list = beByCompany.get(c.companyId) || [];
      list.push(c);
      beByCompany.set(c.companyId, list);
      beCompanyName.set(c.companyId, c.company.nom);
      beSiteWeb.set(c.companyId, c.company.siteWeb);
      beLinkedMarque.set(c.companyId, c.company.linkedMarqueId);
    }

    const activeBeCompanyIds = Array.from(beByCompany.keys());
    const marqueIdByBeCompany = await resolveMarqueIdsForBeneluxCompanies(
      activeBeCompanyIds,
      beCompanyName,
      beLinkedMarque
    );

    const [beKnownRows, frKnownForBe] = await Promise.all([
      activeBeCompanyIds.length > 0
        ? prisma.beneluxContact.findMany({
            where: {
              companyId: { in: activeBeCompanyIds },
              email: { not: null },
            },
            select: {
              companyId: true,
              email: true,
              prenom: true,
              nom: true,
            },
          })
        : Promise.resolve([]),
      (() => {
        const frIds = Array.from(new Set(marqueIdByBeCompany.values()));
        if (frIds.length === 0) return Promise.resolve([]);
        return prisma.marqueContact.findMany({
          where: { marqueId: { in: frIds }, email: { not: null } },
          select: {
            marqueId: true,
            email: true,
            prenom: true,
            nom: true,
          },
        });
      })(),
    ]);

    const beKnownLocal = takeKnownByParent(
      beKnownRows.map((r) => ({
        parentId: r.companyId,
        email: r.email,
        prenom: r.prenom,
        nom: r.nom,
      }))
    );
    const frKnownByMarqueForBe = takeKnownByParent(
      frKnownForBe.map((r) => ({
        parentId: r.marqueId,
        email: r.email,
        prenom: r.prenom,
        nom: r.nom,
      }))
    );

    for (const [companyId, list] of beByCompany) {
      const frId = marqueIdByBeCompany.get(companyId);
      const known = mergeKnownRows([
        ...(beKnownLocal.get(companyId) || []),
        ...(frId ? frKnownByMarqueForBe.get(frId) || [] : []),
      ]);
      const pattern = detectEmailPattern(known);
      const fallbackDomain =
        pattern?.domain || domainFromWebsite(beSiteWeb.get(companyId) || null);
      const crossMarket = Boolean(frId);
      const patternObj = patternPayload(pattern);

      for (const c of list) {
        const suggestions = suggestEmailsForContact({
          prenom: c.prenom,
          nom: c.nom,
          pattern,
          fallbackDomain,
        });
        enriched.push({
          id: c.id,
          prenom: c.prenom,
          nom: c.nom || "",
          poste: c.poste,
          perimetre: c.perimetre,
          localisation: c.localisation,
          priorite: c.priorite,
          linkedinUrl: c.linkedinUrl,
          language: c.language,
          emailSuggested: c.emailSuggested || suggestions[0]?.email || null,
          emailLookupQueuedAt: c.emailLookupQueuedAt,
          marqueId: c.companyId,
          company: c.company.nom,
          market: "BENELUX",
          source: (c.source as "CARTO" | "AO" | null) ?? null,
          siblingCompany: crossMarket,
          patternCrossMarket: crossMarket,
          pattern: patternObj,
          suggestions,
        });
      }
    }

    // —— AGENCES (ADMIN seulement) ——
    if (isAdmin) {
      const agencyContacts = await prisma.agencyContact.findMany({
        where: {
          emailLookupStatus: "QUEUED",
          excluded: false,
        },
        orderBy: [{ emailLookupQueuedAt: "asc" }],
        select: {
          id: true,
          prenom: true,
          nom: true,
          poste: true,
          language: true,
          linkedinUrl: true,
          emailSuggested: true,
          emailLookupQueuedAt: true,
          partnerId: true,
          partner: { select: { name: true } },
        },
      });

      const byPartner = new Map<string, typeof agencyContacts>();
      for (const c of agencyContacts) {
        const list = byPartner.get(c.partnerId) || [];
        list.push(c);
        byPartner.set(c.partnerId, list);
      }

      const partnerIds = Array.from(byPartner.keys());
      const agencyKnownRows =
        partnerIds.length > 0
          ? await prisma.agencyContact.findMany({
              where: { partnerId: { in: partnerIds }, email: { not: null } },
              select: {
                partnerId: true,
                email: true,
                prenom: true,
                nom: true,
              },
            })
          : [];
      const agencyKnownByPartner = takeKnownByParent(
        agencyKnownRows.map((r) => ({
          parentId: r.partnerId,
          email: r.email,
          prenom: r.prenom,
          nom: r.nom,
        }))
      );

      for (const [partnerId, list] of byPartner) {
        const known = agencyKnownByPartner.get(partnerId) || [];
        const pattern = detectEmailPattern(known);
        const fallbackDomain = pattern?.domain || null;
        const patternObj = patternPayload(pattern);

        for (const c of list) {
          const suggestions = suggestEmailsForContact({
            prenom: c.prenom,
            nom: c.nom,
            pattern,
            fallbackDomain,
          });
          enriched.push({
            id: c.id,
            prenom: c.prenom,
            nom: c.nom || "",
            poste: c.poste,
            perimetre: null,
            localisation: null,
            priorite: null,
            linkedinUrl: c.linkedinUrl,
            language: c.language,
            emailSuggested: c.emailSuggested,
            emailLookupQueuedAt: c.emailLookupQueuedAt,
            marqueId: c.partnerId,
            company: c.partner.name,
            market: "AGENCY",
            source: "CARTO",
            pattern: patternObj,
            suggestions,
          });
        }
      }
    }

    // —— FASHION WEEK (ADMIN seulement) ——
    if (isAdmin) {
      const fwContacts = await prisma.fwContact.findMany({
        where: {
          OR: [
            { emailLookupStatus: "QUEUED" },
            {
              AND: [
                { emailLookupStatus: { not: "NOT_FOUND" } },
                { OR: [{ email: null }, { email: "" }] },
              ],
            },
          ],
        },
        orderBy: [{ emailLookupQueuedAt: "asc" }, { createdAt: "asc" }],
        select: {
          id: true,
          firstName: true,
          lastName: true,
          role: true,
          perimetre: true,
          localisation: true,
          linkedinUrl: true,
          emailLookupQueuedAt: true,
          clientId: true,
          client: { select: { nom: true, language: true } },
        },
      });

      const byClient = new Map<string, typeof fwContacts>();
      for (const c of fwContacts) {
        const list = byClient.get(c.clientId) || [];
        list.push(c);
        byClient.set(c.clientId, list);
      }

      const clientIds = Array.from(byClient.keys());
      const fwKnownRows =
        clientIds.length > 0
          ? await prisma.fwContact.findMany({
              where: { clientId: { in: clientIds }, email: { not: "" } },
              select: {
                clientId: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            })
          : [];
      const fwKnownByClient = takeKnownByParent(
        fwKnownRows.map((r) => ({
          parentId: r.clientId,
          email: r.email,
          prenom: r.firstName,
          nom: r.lastName || "",
        }))
      );

      for (const [clientId, list] of byClient) {
        const known = fwKnownByClient.get(clientId) || [];
        const pattern = detectEmailPattern(known);
        const patternObj = patternPayload(pattern);

        for (const c of list) {
          const suggestions = suggestEmailsForContact({
            prenom: c.firstName,
            nom: c.lastName || "",
            pattern,
            fallbackDomain: pattern?.domain || null,
          });
          enriched.push({
            id: c.id,
            prenom: c.firstName,
            nom: c.lastName || "",
            poste: c.role,
            perimetre: c.perimetre,
            localisation: c.localisation,
            priorite: null,
            linkedinUrl: c.linkedinUrl,
            language: c.client.language === "en" ? "en" : "fr",
            emailSuggested: null,
            emailLookupQueuedAt: c.emailLookupQueuedAt,
            marqueId: clientId,
            company: c.client.nom,
            market: "FW",
            source: "CARTO",
            pattern: patternObj,
            suggestions,
          });
        }
      }
    }

    enriched.sort((a, b) => {
      const ta = a.emailLookupQueuedAt
        ? new Date(a.emailLookupQueuedAt).getTime()
        : 0;
      const tb = b.emailLookupQueuedAt
        ? new Date(b.emailLookupQueuedAt).getTime()
        : 0;
      return ta - tb;
    });

    return NextResponse.json({
      contacts: enriched,
      count: enriched.length,
    });
  } catch (error) {
    console.error("GET /api/outreach/email-lookup:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
