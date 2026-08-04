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
 * Preview (`preview: true`) : classifie les lignes sans écrire — notamment les
 * contacts déjà connus ailleurs mais absents de la fiche agence cible, pour
 * proposer un rattachement batch.
 *
 * Body : {
 *   partnerId?: string,
 *   partnerName?: string,
 *   language: "fr" | "en",
 *   market?: "FR" | "BENELUX",
 *   rows: [{ prenom?, nom?, poste?, email?, language?, linkedinUrl? }],
 *   preview?: boolean,
 *   linkEmails?: string[],   // emails à rattacher à la fiche (commit)
 *   enrollEmails?: string[], // déjà sur la fiche → ajouter au cycle (commit)
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

type NormalizedRow = {
  prenom: string | null;
  nom: string | null;
  poste: string | null;
  email: string | null;
  linkedinUrl: string | null;
  language: "fr" | "en";
};

type LinkCandidate = {
  email: string;
  prenom: string;
  nom: string | null;
  poste: string | null;
  linkedinUrl: string | null;
  language: "fr" | "en";
  /** Où le contact a été trouvé. */
  sourceLabel: string;
  /** Déjà présent sur la fiche cible. */
  alreadyOnFiche: boolean;
  /** Déjà dans le cycle prospection agences. */
  alreadyInCycle: boolean;
};

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

const personKey = (prenom: string | null, nom: string | null) =>
  `${(prenom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}|${(nom || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim()}`;

function normalizeRows(
  rows: ImportRow[],
  defaultLanguage: "fr" | "en"
): NormalizedRow[] {
  const out: NormalizedRow[] = [];
  for (const row of rows) {
    const prenom = clean(row.prenom);
    const nom = clean(row.nom);
    if (!prenom && !nom) continue;
    const rawEmail = clean(row.email)?.toLowerCase() || null;
    const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
    const rowLanguage: "fr" | "en" =
      row.language === "en" ? "en" : row.language === "fr" ? "fr" : defaultLanguage;
    out.push({
      prenom,
      nom,
      poste: clean(row.poste),
      email,
      linkedinUrl: clean(row.linkedinUrl),
      language: rowLanguage,
    });
  }
  return out;
}

async function resolvePartner(opts: {
  partnerId: string;
  partnerName: string;
  userId: string;
  createIfMissing: boolean;
}): Promise<{ id: string; name: string; slug: string } | null> {
  if (opts.partnerId) {
    return prisma.partner.findUnique({
      where: { id: opts.partnerId },
      select: { id: true, name: true, slug: true },
    });
  }
  if (!opts.partnerName) return null;
  if (opts.createIfMissing) {
    return findOrCreatePartnerByName(opts.partnerName, opts.userId);
  }
  const existing = await prisma.partner.findFirst({
    where: { name: { equals: opts.partnerName, mode: "insensitive" } },
    select: { id: true, name: true, slug: true },
  });
  if (existing) return existing;
  // Soft resolve by slug without creating (preview for a brand-new agency).
  return null;
}

async function buildLinkCandidates(
  partnerId: string | null,
  rows: NormalizedRow[]
): Promise<{
  linkCandidates: LinkCandidate[];
  enrollCandidates: LinkCandidate[];
  toCreate: NormalizedRow[];
  alreadyOnFicheSkipped: number;
}> {
  const emails = Array.from(
    new Set(rows.map((r) => r.email).filter((e): e is string => !!e))
  );

  const [onFiche, elsewhereAgency, marqueContacts, cycleTargets] = await Promise.all([
    partnerId
      ? prisma.agencyContact.findMany({
          where: { partnerId },
          select: {
            email: true,
            prenom: true,
            nom: true,
            poste: true,
            linkedinUrl: true,
            language: true,
          },
        })
      : Promise.resolve([]),
    emails.length
      ? prisma.agencyContact.findMany({
          where: {
            OR: emails.map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            })),
            ...(partnerId ? { partnerId: { not: partnerId } } : {}),
          },
          select: {
            email: true,
            prenom: true,
            nom: true,
            poste: true,
            linkedinUrl: true,
            language: true,
            partner: { select: { name: true } },
          },
        })
      : Promise.resolve([]),
    emails.length
      ? prisma.marqueContact.findMany({
          where: {
            OR: emails.map((email) => ({
              email: { equals: email, mode: "insensitive" as const },
            })),
          },
          select: {
            email: true,
            prenom: true,
            nom: true,
            poste: true,
            linkedinUrl: true,
            language: true,
            marque: { select: { nom: true } },
          },
        })
      : Promise.resolve([]),
    emails.length
      ? prisma.agencyOutreachTarget.findMany({
          where: { email: { in: emails } },
          select: { email: true },
        })
      : Promise.resolve([]),
  ]);

  const onFicheEmails = new Set(
    onFiche.map((c) => (c.email || "").toLowerCase()).filter(Boolean)
  );
  const onFichePeople = new Set(
    onFiche.filter((c) => !c.email).map((c) => personKey(c.prenom, c.nom))
  );
  const inCycle = new Set(cycleTargets.map((t) => t.email.toLowerCase()));

  const elsewhereByEmail = new Map<string, (typeof elsewhereAgency)[number]>();
  for (const c of elsewhereAgency) {
    const e = (c.email || "").toLowerCase();
    if (e && !elsewhereByEmail.has(e)) elsewhereByEmail.set(e, c);
  }
  const marqueByEmail = new Map<string, (typeof marqueContacts)[number]>();
  for (const c of marqueContacts) {
    const e = (c.email || "").toLowerCase();
    if (e && !marqueByEmail.has(e)) marqueByEmail.set(e, c);
  }

  const linkCandidates: LinkCandidate[] = [];
  const enrollCandidates: LinkCandidate[] = [];
  const toCreate: NormalizedRow[] = [];
  let alreadyOnFicheSkipped = 0;
  const seenLink = new Set<string>();
  const seenEnroll = new Set<string>();
  const seenCreateEmail = new Set<string>();
  const seenCreatePerson = new Set<string>();

  for (const row of rows) {
    if (row.email && onFicheEmails.has(row.email)) {
      if (inCycle.has(row.email)) {
        alreadyOnFicheSkipped += 1;
        continue;
      }
      if (!seenEnroll.has(row.email)) {
        seenEnroll.add(row.email);
        const existing = onFiche.find(
          (c) => (c.email || "").toLowerCase() === row.email
        );
        enrollCandidates.push({
          email: row.email,
          prenom: existing?.prenom || row.prenom || row.nom || "Contact",
          nom: existing?.nom ?? row.nom,
          poste: existing?.poste ?? row.poste,
          linkedinUrl: existing?.linkedinUrl ?? row.linkedinUrl,
          language:
            existing?.language === "en" || existing?.language === "fr"
              ? existing.language
              : row.language,
          sourceLabel: "Déjà sur cette fiche",
          alreadyOnFiche: true,
          alreadyInCycle: false,
        });
      }
      continue;
    }

    if (!row.email) {
      const key = personKey(row.prenom, row.nom);
      if (onFichePeople.has(key) || seenCreatePerson.has(key)) {
        alreadyOnFicheSkipped += 1;
        continue;
      }
      seenCreatePerson.add(key);
      toCreate.push(row);
      continue;
    }

    if (seenLink.has(row.email) || seenCreateEmail.has(row.email)) continue;

    const elsewhere = elsewhereByEmail.get(row.email);
    const marque = marqueByEmail.get(row.email);
    if (elsewhere || marque) {
      seenLink.add(row.email);
      const from = elsewhere || marque!;
      const sourceLabel = elsewhere
        ? `Agence « ${elsewhere.partner.name} »`
        : `Marque « ${marque!.marque.nom} »`;
      linkCandidates.push({
        email: row.email,
        prenom:
          clean(from.prenom) ||
          row.prenom ||
          row.nom ||
          "Contact",
        nom: clean(from.nom) ?? row.nom,
        poste: clean(from.poste) ?? row.poste,
        linkedinUrl:
          ("linkedinUrl" in from ? clean(from.linkedinUrl) : null) ?? row.linkedinUrl,
        language:
          from.language === "en" || from.language === "fr"
            ? from.language
            : row.language,
        sourceLabel,
        alreadyOnFiche: false,
        alreadyInCycle: inCycle.has(row.email),
      });
      continue;
    }

    seenCreateEmail.add(row.email);
    toCreate.push(row);
  }

  return { linkCandidates, enrollCandidates, toCreate, alreadyOnFicheSkipped };
}

async function enrollInCycle(opts: {
  partner: { id: string; name: string; slug: string };
  contactId: string;
  prenom: string;
  nom: string | null;
  email: string;
  language: "fr" | "en";
  market: "FR" | "BENELUX";
  userId: string;
}): Promise<boolean> {
  const alreadyInCycle = await prisma.agencyOutreachTarget.findUnique({
    where: { email: opts.email },
    select: { id: true },
  });
  if (alreadyInCycle) return false;
  const conflict = await findCrossPipelineConflict(opts.email, "agency");
  if (conflict) return false;
  await prisma.agencyOutreachTarget.create({
    data: {
      partnerId: opts.partner.id,
      agencyContactId: opts.contactId,
      firstname: opts.prenom,
      lastname: opts.nom,
      email: opts.email,
      company: opts.partner.name,
      partnerSlug: opts.partner.slug,
      language: opts.language,
      market: opts.market,
      createdById: opts.userId,
    },
  });
  return true;
}

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
      preview?: boolean;
      linkEmails?: string[];
      enrollEmails?: string[];
    };

    const market = (body.market || "").toUpperCase() === "BENELUX" ? "BENELUX" : "FR";
    const preview = body.preview === true;
    const linkEmails = new Set(
      (Array.isArray(body.linkEmails) ? body.linkEmails : [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => isValidEmail(e))
    );
    const enrollEmails = new Set(
      (Array.isArray(body.enrollEmails) ? body.enrollEmails : [])
        .map((e) => e.trim().toLowerCase())
        .filter((e) => isValidEmail(e))
    );

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

    const normalized = normalizeRows(rows, language);

    if (preview) {
      const partner = await resolvePartner({
        partnerId,
        partnerName,
        userId: session.user.id,
        createIfMissing: false,
      });
      const classified = await buildLinkCandidates(partner?.id ?? null, normalized);
      return NextResponse.json({
        preview: true,
        partnerId: partner?.id ?? null,
        company: partner?.name ?? partnerName,
        toCreate: classified.toCreate.length,
        alreadyOnFicheSkipped: classified.alreadyOnFicheSkipped,
        linkCandidates: classified.linkCandidates,
        enrollCandidates: classified.enrollCandidates,
      });
    }

    const partner = await resolvePartner({
      partnerId,
      partnerName,
      userId: session.user.id,
      createIfMissing: true,
    });
    if (!partner) {
      return NextResponse.json({ error: "Agence introuvable." }, { status: 404 });
    }

    await prisma.partner.update({
      where: { id: partner.id },
      data: { market },
    });

    const classified = await buildLinkCandidates(partner.id, normalized);

    let created = 0;
    let skipped = classified.alreadyOnFicheSkipped;
    let addedToCycle = 0;
    let queued = 0;
    let linked = 0;

    // 1) Rattacher les contacts déjà connus (cochez dans l'UI).
    const linkByEmail = new Map(
      classified.linkCandidates.map((c) => [c.email, c] as const)
    );
    for (const email of linkEmails) {
      const candidate = linkByEmail.get(email);
      if (!candidate) continue;

      const contact = await prisma.agencyContact.upsert({
        where: { partnerId_email: { partnerId: partner.id, email } },
        update: {
          prenom: candidate.prenom,
          nom: candidate.nom,
          poste: candidate.poste,
          linkedinUrl: candidate.linkedinUrl,
          language: candidate.language,
          emailLookupStatus: "FOUND",
          excluded: false,
        },
        create: {
          partnerId: partner.id,
          prenom: candidate.prenom,
          nom: candidate.nom,
          email,
          poste: candidate.poste,
          linkedinUrl: candidate.linkedinUrl,
          language: candidate.language,
          emailLookupStatus: "FOUND",
          createdById: session.user.id,
        },
      });
      linked += 1;

      if (!candidate.alreadyInCycle) {
        const enrolled = await enrollInCycle({
          partner,
          contactId: contact.id,
          prenom: candidate.prenom,
          nom: candidate.nom,
          email,
          language: candidate.language,
          market,
          userId: session.user.id,
        });
        if (enrolled) addedToCycle += 1;
      }
    }

    // 2) Déjà sur la fiche → ajouter au cycle si demandé.
    const enrollByEmail = new Map(
      classified.enrollCandidates.map((c) => [c.email, c] as const)
    );
    for (const email of enrollEmails) {
      const candidate = enrollByEmail.get(email);
      if (!candidate) continue;
      const contact = await prisma.agencyContact.findFirst({
        where: { partnerId: partner.id, email: { equals: email, mode: "insensitive" } },
        select: { id: true, prenom: true, nom: true, language: true },
      });
      if (!contact) continue;
      const enrolled = await enrollInCycle({
        partner,
        contactId: contact.id,
        prenom: contact.prenom,
        nom: contact.nom,
        email,
        language:
          contact.language === "en" || contact.language === "fr"
            ? contact.language
            : candidate.language,
        market,
        userId: session.user.id,
      });
      if (enrolled) addedToCycle += 1;
      else skipped += 1;
    }

    // 3) Créer les nouveaux contacts.
    const existingEmails = new Set(
      (
        await prisma.agencyContact.findMany({
          where: { partnerId: partner.id, email: { not: null } },
          select: { email: true },
        })
      )
        .map((c) => (c.email || "").toLowerCase())
        .filter(Boolean)
    );
    const existingPeople = new Set(
      (
        await prisma.agencyContact.findMany({
          where: { partnerId: partner.id, email: null },
          select: { prenom: true, nom: true },
        })
      ).map((c) => personKey(c.prenom, c.nom))
    );

    for (const row of classified.toCreate) {
      if (row.email && existingEmails.has(row.email)) {
        skipped += 1;
        continue;
      }
      if (!row.email) {
        const key = personKey(row.prenom, row.nom);
        if (existingPeople.has(key)) {
          skipped += 1;
          continue;
        }
      }

      const contact = await prisma.agencyContact.create({
        data: {
          partnerId: partner.id,
          prenom: row.prenom || row.nom || "Contact",
          nom: row.prenom ? row.nom : null,
          email: row.email,
          poste: row.poste,
          linkedinUrl: row.linkedinUrl,
          language: row.language,
          createdById: session.user.id,
          ...(row.email
            ? { emailLookupStatus: "FOUND" as const }
            : {
                emailLookupStatus: "QUEUED" as const,
                emailLookupQueuedAt: new Date(),
              }),
        },
      });
      created += 1;

      if (row.email) {
        existingEmails.add(row.email);
        const enrolled = await enrollInCycle({
          partner,
          contactId: contact.id,
          prenom: row.prenom || row.nom || "Contact",
          nom: row.prenom ? row.nom : null,
          email: row.email,
          language: row.language,
          market,
          userId: session.user.id,
        });
        if (enrolled) addedToCycle += 1;
      } else {
        existingPeople.add(personKey(row.prenom, row.nom));
        queued += 1;
      }
    }

    // Lignes « link » non cochées → comptées comme ignorées.
    for (const c of classified.linkCandidates) {
      if (!linkEmails.has(c.email)) skipped += 1;
    }
    for (const c of classified.enrollCandidates) {
      if (!enrollEmails.has(c.email)) skipped += 1;
    }

    return NextResponse.json({
      partnerId: partner.id,
      company: partner.name,
      created,
      skipped,
      addedToCycle,
      queued,
      linked,
    });
  } catch (error) {
    console.error("POST /api/agency-outreach/import-carto:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
