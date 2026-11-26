import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  detectEmailPattern,
  domainFromWebsite,
  suggestEmailsForContact,
} from "@/lib/email-pattern";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { CANNES_CONTACT_SOURCE } from "@/lib/cannes-partenaires/contacts";

/**
 * Contacts à enrichir — table cannes_contacts uniquement.
 * Query : opportuniteId (préféré) ou marqueId (résout l’opportunité Cannes).
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

    const opportuniteIdParam = String(
      request.nextUrl.searchParams.get("opportuniteId") || ""
    ).trim();
    const marqueId = String(
      request.nextUrl.searchParams.get("marqueId") || ""
    ).trim();

    let opportuniteId = opportuniteIdParam;
    let company = "";
    let siteWeb: string | null = null;

    if (opportuniteId) {
      const opp = await prisma.opportuniteMarque.findFirst({
        where: {
          id: opportuniteId,
          projet: { slug: CANNES_PARTENAIRES_SLUG },
        },
        select: {
          id: true,
          nomMarque: true,
          marque: { select: { siteWeb: true } },
        },
      });
      if (!opp) {
        return NextResponse.json({ error: "Opportunité introuvable" }, { status: 404 });
      }
      company = opp.nomMarque;
      siteWeb = opp.marque?.siteWeb || null;
    } else if (marqueId) {
      const opp = await prisma.opportuniteMarque.findFirst({
        where: {
          marqueId,
          projet: { slug: CANNES_PARTENAIRES_SLUG },
        },
        select: {
          id: true,
          nomMarque: true,
          marque: { select: { siteWeb: true } },
        },
        orderBy: { updatedAt: "desc" },
      });
      if (!opp) {
        return NextResponse.json({
          contacts: [],
          company: "",
          opportuniteId: null,
        });
      }
      opportuniteId = opp.id;
      company = opp.nomMarque;
      siteWeb = opp.marque?.siteWeb || null;

      // Migration one-shot : MarqueContact CANNES_CARTO → cannes_contacts
      await migrateLegacyCannesContacts(marqueId, opportuniteId);
    } else {
      return NextResponse.json(
        { error: "opportuniteId ou marqueId requis" },
        { status: 400 }
      );
    }

    const rows = await prisma.cannesPartenairesContact.findMany({
      where: {
        opportuniteId,
        AND: [
          {
            OR: [
              { emailLookupStatus: null },
              { emailLookupStatus: { not: "NOT_FOUND" } },
            ],
          },
          { OR: [{ email: null }, { email: "" }] },
        ],
      },
      orderBy: [{ priorite: "asc" }, { nom: "asc" }],
    });

    const known = await prisma.cannesPartenairesContact.findMany({
      where: { opportuniteId, email: { not: null } },
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
    const fallbackDomain = domainFromWebsite(siteWeb);
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
      marqueId: marqueId || null,
      opportuniteId,
      company,
      market: "FR" as const,
      source: "CARTO" as const,
      pattern: patternObj,
      suggestions: suggestEmailsForContact({
        prenom: c.prenom,
        nom: c.nom,
        pattern,
        fallbackDomain: pattern?.domain || fallbackDomain,
      }),
    }));

    return NextResponse.json({ contacts, company, opportuniteId });
  } catch (e) {
    console.error("[cannes] enrich-contacts:", e);
    return NextResponse.json({ error: "Erreur chargement" }, { status: 500 });
  }
}

async function migrateLegacyCannesContacts(
  marqueId: string,
  opportuniteId: string
) {
  const legacy = await prisma.marqueContact.findMany({
    where: { marqueId, source: CANNES_CONTACT_SOURCE },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      perimetre: true,
      localisation: true,
      priorite: true,
      linkedinUrl: true,
      language: true,
      emailLookupStatus: true,
      emailSuggested: true,
    },
  });
  if (legacy.length === 0) return;

  const existing = await prisma.cannesPartenairesContact.findMany({
    where: { opportuniteId },
    select: { prenom: true, nom: true, linkedinUrl: true },
  });
  const keys = new Set(
    existing.map(
      (c) =>
        `${(c.prenom || "").toLowerCase()}|${(c.nom || "").toLowerCase()}|${(c.linkedinUrl || "").toLowerCase()}`
    )
  );

  for (const c of legacy) {
    const key = `${(c.prenom || "").toLowerCase()}|${(c.nom || "").toLowerCase()}|${(c.linkedinUrl || "").toLowerCase()}`;
    if (keys.has(key)) continue;
    await prisma.cannesPartenairesContact.create({
      data: {
        opportuniteId,
        prenom: c.prenom,
        nom: c.nom,
        email: c.email,
        poste: c.poste,
        perimetre: c.perimetre,
        localisation: c.localisation,
        priorite: c.priorite,
        linkedinUrl: c.linkedinUrl,
        language: c.language === "en" ? "en" : "fr",
        emailLookupStatus: c.emailLookupStatus,
        emailSuggested: c.emailSuggested,
      },
    });
    keys.add(key);
  }
}
