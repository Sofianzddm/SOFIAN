import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  detectEmailPattern,
  domainFromWebsite,
  suggestEmailsForContact,
} from "@/lib/email-pattern";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { cannesContactWhere } from "@/lib/cannes-partenaires/contacts";

/**
 * Contacts à enrichir pour Cannes Partenaires uniquement.
 * Filtre : source CANNES_CARTO (ou legacy CARTO exclu) + sans email valide.
 * N'apparaît PAS dans /enrichissement (qui exige outreachExcluded=false + QUEUED).
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const marqueId = String(
      request.nextUrl.searchParams.get("marqueId") || ""
    ).trim();
    if (!marqueId) {
      return NextResponse.json({ error: "marqueId requis" }, { status: 400 });
    }

    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true, nom: true, siteWeb: true },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
    }

    const rows = await prisma.marqueContact.findMany({
      where: {
        marqueId,
        AND: [
          cannesContactWhere,
          { emailLookupStatus: { not: "NOT_FOUND" } },
          { OR: [{ email: null }, { email: "" }] },
        ],
      },
      orderBy: [{ priorite: "asc" }, { nom: "asc" }],
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
        emailSuggested: true,
        source: true,
      },
    });

    const known = await prisma.marqueContact.findMany({
      where: {
        marqueId,
        email: { not: null },
      },
      take: 40,
      select: { email: true, prenom: true, nom: true },
    });
    const knownEmails = known
      .map((k) => ({
        email: (k.email || "").trim().toLowerCase(),
        prenom: k.prenom,
        nom: k.nom,
      }))
      .filter((k) => k.email);
    const fallbackDomain = domainFromWebsite(marque.siteWeb);
    const pattern = detectEmailPattern(knownEmails);
    const patternObj = pattern
      ? {
          kind: pattern.kind,
          domain: pattern.domain,
          matches: pattern.matches,
          label: `${pattern.kind}@${pattern.domain}`,
        }
      : null;

    const contacts = rows.map((c) => ({
      id: c.id,
      prenom: c.prenom,
      nom: c.nom,
      poste: c.poste,
      perimetre: c.perimetre,
      localisation: c.localisation,
      priorite: c.priorite,
      linkedinUrl: c.linkedinUrl,
      language: c.language || "fr",
      emailSuggested: c.emailSuggested,
      marqueId: marque.id,
      company: marque.nom,
      market: "FR" as const,
      source: (c.source === "AO" ? "AO" : "CARTO") as "CARTO" | "AO",
      pattern: patternObj,
      suggestions: suggestEmailsForContact({
        prenom: c.prenom,
        nom: c.nom,
        pattern,
        fallbackDomain: pattern?.domain || fallbackDomain,
      }),
    }));

    return NextResponse.json({ contacts, company: marque.nom });
  } catch (e) {
    console.error("[cannes] enrich-contacts:", e);
    return NextResponse.json({ error: "Erreur chargement" }, { status: 500 });
  }
}
