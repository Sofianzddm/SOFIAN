import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreateBeneluxCompany } from "@/lib/benelux-company";

/**
 * POST → importe une cartographie de contacts (fichier Claude / Excel collé)
 * et la rattache à une entreprise prospect BENELUX. Les contacts avec un email
 * valide entrent directement dans le cycle « À contacter » ; sans email, ils
 * restent en attente (file « à entrer »).
 *
 * Module 100 % isolé du CRM FR : n'écrit que sur benelux_companies /
 * benelux_contacts / benelux_outreach_targets.
 *
 * Body : {
 *   companyId?: string,         // entreprise BENELUX existante
 *   company?: string,           // sinon résolution/création par nom
 *   language: "fr" | "en",      // langue des contacts importés
 *   rows: [{ prenom?, nom, poste?, perimetre?, localisation?, priorite?, linkedinUrl?, email?, language? }]
 * }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const MAX_ROWS = 100;

type CartoRow = {
  prenom?: string;
  nom?: string;
  poste?: string;
  perimetre?: string;
  localisation?: string;
  priorite?: string;
  linkedinUrl?: string;
  email?: string;
  language?: string;
  /** Entreprise/marque propre au contact ; vide → entreprise par défaut. */
  marque?: string;
};

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

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
      companyId?: string;
      // Alias envoyé par la page /outreach (échange de préfixe d'API).
      marqueId?: string;
      company?: string;
      rows?: CartoRow[];
      language?: string;
      // Ignoré côté BENELUX (pas de stockage du fichier original).
      file?: unknown;
    };

    const companyIdInput = body.companyId || body.marqueId;

    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun contact à importer." }, { status: 400 });
    }

    if (body.language !== "fr" && body.language !== "en") {
      return NextResponse.json(
        { error: "Langue du prospect requise (français ou anglais)." },
        { status: 400 }
      );
    }
    const language: "fr" | "en" = body.language;

    let companyId: string;
    let company: string;
    if (companyIdInput) {
      const existingCompany = await prisma.beneluxCompany.findUnique({
        where: { id: companyIdInput },
        select: { id: true, nom: true },
      });
      if (!existingCompany) {
        return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
      }
      companyId = existingCompany.id;
      company = existingCompany.nom;
    } else {
      company = String(body.company || "").trim();
      if (!company) {
        return NextResponse.json({ error: "Entreprise requise." }, { status: 400 });
      }
      const resolved = await findOrCreateBeneluxCompany(company, session.user.id);
      companyId = resolved.id;
      company = resolved.nom;
    }

    // Contexte de déduplication par entreprise : un même fichier peut répartir
    // ses contacts sur plusieurs entreprises (colonne « Marque »), chacune avec
    // ses propres contacts déjà connus.
    type CompanyCtx = {
      companyId: string;
      companyName: string;
      emails: Set<string>;
      names: Set<string>;
    };
    const companyCache = new Map<string, CompanyCtx>();

    const loadCompanyCtx = async (id: string, nom: string): Promise<CompanyCtx> => {
      const cached = companyCache.get(id);
      if (cached) return cached;
      await prisma.beneluxContact.updateMany({
        where: { companyId: id, outreachExcluded: true },
        data: { outreachExcluded: false },
      });
      const existing = await prisma.beneluxContact.findMany({
        where: { companyId: id },
        select: { prenom: true, nom: true, email: true },
      });
      const ctx: CompanyCtx = {
        companyId: id,
        companyName: nom,
        emails: new Set(
          existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean)
        ),
        names: new Set(
          existing.map((c) => `${(c.prenom || "").toLowerCase()}|${(c.nom || "").toLowerCase()}`)
        ),
      };
      companyCache.set(id, ctx);
      return ctx;
    };

    // Entreprise par défaut (fallback pour les lignes sans marque propre).
    const defaultCtx = await loadCompanyCtx(companyId, company);

    const resolveRowCtx = async (rawMarque: string | null): Promise<CompanyCtx> => {
      if (!rawMarque) return defaultCtx;
      const resolved = await findOrCreateBeneluxCompany(rawMarque, session.user.id);
      if (resolved.id === companyId) return defaultCtx;
      const cached = companyCache.get(resolved.id);
      if (cached) return cached;
      return loadCompanyCtx(resolved.id, resolved.nom);
    };

    let created = 0;
    let skipped = 0;
    let addedToCycle = 0;

    for (const row of rows) {
      const prenom = clean(row.prenom);
      const nom = clean(row.nom);
      const rawEmail = clean(row.email)?.toLowerCase() || null;
      const email = rawEmail && isValidEmail(rawEmail) ? rawEmail : null;
      if (!nom && !prenom) {
        skipped += 1;
        continue;
      }

      // Entreprise de ce contact (colonne « Marque ») ou entreprise par défaut.
      const ctx = await resolveRowCtx(clean(row.marque));

      const nameKey = `${(prenom || "").toLowerCase()}|${(nom || prenom || "").toLowerCase()}`;
      if ((email && ctx.emails.has(email)) || ctx.names.has(nameKey)) {
        skipped += 1;
        continue;
      }

      const rowLanguage: "fr" | "en" =
        row.language === "en" ? "en" : row.language === "fr" ? "fr" : language;

      const contact = await prisma.beneluxContact.create({
        data: {
          companyId: ctx.companyId,
          prenom: prenom || nom || "Contact",
          nom: prenom ? nom : null,
          email,
          poste: clean(row.poste),
          perimetre: clean(row.perimetre),
          localisation: clean(row.localisation),
          priorite: clean(row.priorite),
          linkedinUrl: clean(row.linkedinUrl),
          language: rowLanguage,
          source: "CARTO",
        },
      });
      ctx.names.add(nameKey);
      if (email) ctx.emails.add(email);
      created += 1;

      if (email) {
        const alreadyInCycle = await prisma.beneluxOutreachTarget.findUnique({
          where: { email },
          select: { id: true },
        });
        if (!alreadyInCycle) {
          await prisma.beneluxOutreachTarget.create({
            data: {
              companyId: ctx.companyId,
              beneluxContactId: contact.id,
              firstname: prenom || nom || "Contact",
              lastname: prenom ? nom : null,
              email,
              companyName: ctx.companyName,
              language: rowLanguage,
              createdById: session.user.id,
            },
          });
          addedToCycle += 1;
        }
      }
    }

    return NextResponse.json({ companyId, company, created, skipped, addedToCycle });
  } catch (error) {
    console.error("POST /api/benelux-outreach/import-carto:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
