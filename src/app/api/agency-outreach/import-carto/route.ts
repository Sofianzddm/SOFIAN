import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreatePartnerByName } from "@/lib/agency-partner";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";

/**
 * POST → importe une liste de contacts d'agence (fichier Excel / tableau collé)
 * et les rattache à une agence partenaire.
 *  - email valide → entre directement dans le cycle « À contacter »
 *  - sans email → file /enrichissement (QUEUED)
 *
 * Module isolé des marques : n'écrit que sur partners / agency_contacts /
 * agency_outreach_targets.
 *
 * Body : {
 *   partnerId?: string,
 *   partnerName?: string,
 *   language: "fr" | "en",
 *   market?: "FR" | "BENELUX",
 *   rows: [{ prenom?, nom?, poste?, email?, language?, linkedinUrl? }]
 * }
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

const MAX_ROWS = 200;

type ImportRow = {
  prenom?: string;
  nom?: string;
  poste?: string;
  email?: string;
  language?: string;
  linkedinUrl?: string;
};

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const personKey = (prenom: string | null, nom: string | null) =>
  `${(prenom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}|${(nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}`;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      partnerId?: string;
      partnerName?: string;
      rows?: ImportRow[];
      language?: string;
      market?: string;
    };

    const market = (body.market || "").toUpperCase() === "BENELUX" ? "BENELUX" : "FR";

    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun contact à importer." }, { status: 400 });
    }

    if (body.language !== "fr" && body.language !== "en") {
      return NextResponse.json(
        { error: "Langue des contacts requise (français ou anglais)." },
        { status: 400 }
      );
    }
    const language: "fr" | "en" = body.language;

    const partnerId = (body.partnerId || "").trim();
    const partnerName = (body.partnerName || "").trim();
    if (!partnerId && !partnerName) {
      return NextResponse.json({ error: "Agence requise." }, { status: 400 });
    }

    let partner: { id: string; name: string; slug: string } | null = null;
    if (partnerId) {
      partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, slug: true },
      });
      if (!partner) {
        return NextResponse.json({ error: "Agence introuvable." }, { status: 404 });
      }
    } else {
      partner = await findOrCreatePartnerByName(partnerName, session.user.id);
    }

    // Aligne le marché de l'agence sur celui de l'import (prospection).
    await prisma.partner.update({
      where: { id: partner.id },
      data: { market },
    });

    const existing = await prisma.agencyContact.findMany({
      where: { partnerId: partner.id },
      select: { email: true, prenom: true, nom: true },
    });
    const existingEmails = new Set(
      existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean)
    );
    const existingPeople = new Set(
      existing
        .filter((c) => !c.email)
        .map((c) => personKey(c.prenom, c.nom))
    );

    let created = 0;
    let skipped = 0;
    let addedToCycle = 0;
    let queued = 0;

    for (const row of rows) {
      const prenom = clean(row.prenom);
      const nom = clean(row.nom);
      const rawEmail = clean(row.email)?.toLowerCase() || null;
      const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;

      if (!prenom && !nom) {
        skipped += 1;
        continue;
      }

      if (email && existingEmails.has(email)) {
        skipped += 1;
        continue;
      }
      if (!email) {
        const key = personKey(prenom, nom);
        if (existingPeople.has(key)) {
          skipped += 1;
          continue;
        }
      }

      const rowLanguage: "fr" | "en" =
        row.language === "en" ? "en" : row.language === "fr" ? "fr" : language;

      const contact = await prisma.agencyContact.create({
        data: {
          partnerId: partner.id,
          prenom: prenom || nom || "Contact",
          nom: prenom ? nom : null,
          email,
          poste: clean(row.poste),
          linkedinUrl: clean(row.linkedinUrl),
          language: rowLanguage,
          createdById: session.user.id,
          ...(email
            ? { emailLookupStatus: "FOUND" as const }
            : {
                emailLookupStatus: "QUEUED" as const,
                emailLookupQueuedAt: new Date(),
              }),
        },
      });
      created += 1;

      if (email) {
        existingEmails.add(email);

        const alreadyInCycle = await prisma.agencyOutreachTarget.findUnique({
          where: { email },
          select: { id: true },
        });
        const conflict = alreadyInCycle
          ? null
          : await findCrossPipelineConflict(email, "agency");
        if (!alreadyInCycle && !conflict) {
          await prisma.agencyOutreachTarget.create({
            data: {
              partnerId: partner.id,
              agencyContactId: contact.id,
              firstname: prenom || nom || "Contact",
              lastname: prenom ? nom : null,
              email,
              company: partner.name,
              partnerSlug: partner.slug,
              language: rowLanguage,
              market,
              createdById: session.user.id,
            },
          });
          addedToCycle += 1;
        }
      } else {
        existingPeople.add(personKey(prenom, nom));
        queued += 1;
      }
    }

    return NextResponse.json({
      partnerId: partner.id,
      company: partner.name,
      created,
      skipped,
      addedToCycle,
      queued,
    });
  } catch (error) {
    console.error("POST /api/agency-outreach/import-carto:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
