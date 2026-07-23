import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  detectEmailPattern,
  domainFromWebsite,
  suggestEmailsForContact,
} from "@/lib/email-pattern";

/**
 * GET → enrichissement : contacts carto FR + BENELUX en attente d'email (QUEUED).
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

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
      market: "FR" | "BENELUX";
      source: "CARTO" | "AO" | null;
      pattern: {
        kind: string;
        domain: string;
        matches: number;
        label: string;
      } | null;
      suggestions: ReturnType<typeof suggestEmailsForContact>;
    };

    const enriched: Enriched[] = [];

    // —— FR ——
    const frContacts = await prisma.marqueContact.findMany({
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
        marqueId: true,
        marque: { select: { nom: true, siteWeb: true } },
      },
    });

    const byMarque = new Map<string, typeof frContacts>();
    for (const c of frContacts) {
      const list = byMarque.get(c.marqueId) || [];
      list.push(c);
      byMarque.set(c.marqueId, list);
    }

    for (const [marqueId, list] of byMarque) {
      const siteWeb = list[0]?.marque.siteWeb || null;
      const known = await prisma.marqueContact.findMany({
        where: { marqueId, email: { not: null } },
        select: { email: true, prenom: true, nom: true },
        take: 50,
      });
      const pattern = detectEmailPattern(
        known.filter((k): k is typeof k & { email: string } => Boolean(k.email))
      );
      const fallbackDomain = pattern?.domain || domainFromWebsite(siteWeb);

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
          emailSuggested: c.emailSuggested,
          emailLookupQueuedAt: c.emailLookupQueuedAt,
          marqueId: c.marqueId,
          company: c.marque.nom,
          market: "FR",
          source: (c.source as "CARTO" | "AO" | null) ?? null,
          pattern: pattern
            ? {
                kind: pattern.kind,
                domain: pattern.domain,
                matches: pattern.matches,
                label: `${pattern.kind}@${pattern.domain}`,
              }
            : null,
          suggestions,
        });
      }
    }

    // —— BENELUX ——
    const beContacts = await prisma.beneluxContact.findMany({
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
        company: { select: { nom: true, siteWeb: true } },
      },
    });

    const byCompany = new Map<string, typeof beContacts>();
    for (const c of beContacts) {
      const list = byCompany.get(c.companyId) || [];
      list.push(c);
      byCompany.set(c.companyId, list);
    }

    for (const [companyId, list] of byCompany) {
      const siteWeb = list[0]?.company.siteWeb || null;
      const known = await prisma.beneluxContact.findMany({
        where: { companyId, email: { not: null } },
        select: { email: true, prenom: true, nom: true },
        take: 50,
      });
      const pattern = detectEmailPattern(
        known.filter((k): k is typeof k & { email: string } => Boolean(k.email))
      );
      const fallbackDomain = pattern?.domain || domainFromWebsite(siteWeb);

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
          emailSuggested: c.emailSuggested,
          emailLookupQueuedAt: c.emailLookupQueuedAt,
          marqueId: c.companyId,
          company: c.company.nom,
          market: "BENELUX",
          source: (c.source as "CARTO" | "AO" | null) ?? null,
          pattern: pattern
            ? {
                kind: pattern.kind,
                domain: pattern.domain,
                matches: pattern.matches,
                label: `${pattern.kind}@${pattern.domain}`,
              }
            : null,
          suggestions,
        });
      }
    }

    enriched.sort((a, b) => {
      const ta = a.emailLookupQueuedAt ? new Date(a.emailLookupQueuedAt).getTime() : 0;
      const tb = b.emailLookupQueuedAt ? new Date(b.emailLookupQueuedAt).getTime() : 0;
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
