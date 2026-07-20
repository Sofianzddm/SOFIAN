import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreateMarque } from "@/lib/marque-resolver";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";

/**
 * POST → importe une cartographie de contacts (fichier Claude / Excel collé)
 * et la rattache à la fiche marque. Les contacts sont créés SANS email :
 * il suffit ensuite de noter l'email dans /outreach pour les faire entrer
 * dans le cycle de contact. La carto reste visible sur la fiche marque.
 *
 * Body : {
 *   marqueId?: string,          // marque PAR DÉFAUT existante sélectionnée
 *   company?: string,           // sinon résolution/création par nom
 *   language: "fr" | "en",      // OBLIGATOIRE : langue des contacts importés
 *   rows: [{ prenom?, nom, poste?, perimetre?, localisation?, priorite?, linkedinUrl?, email?, marque? }]
 * }
 *
 * Chaque ligne peut porter sa propre `marque` (colonne « Marque » du fichier) :
 * le contact est alors rattaché à cette marque (résolue/créée sans doublon),
 * sinon à la marque par défaut. Un même fichier peut donc répartir ses contacts
 * sur plusieurs marques (ex. Unilever → Dove, Axe…).
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
  /** Marque/sous-marque propre au contact ; vide → marque par défaut de l'import. */
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
      marqueId?: string;
      company?: string;
      rows?: CartoRow[];
      language?: string;
      /** Fichier original (Excel/CSV) conservé tel quel sur la fiche marque */
      file?: { name?: string; type?: string; base64?: string };
    };

    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun contact à importer." }, { status: 400 });
    }

    // Langue obligatoire : on note dès l'import si les contacts parlent
    // français ou anglais (mails + relances auto adaptés).
    if (body.language !== "fr" && body.language !== "en") {
      return NextResponse.json(
        { error: "Langue du client requise (français ou anglais)." },
        { status: 400 }
      );
    }
    const language: "fr" | "en" = body.language;

    // Résolution de la marque (existante ou créée sans doublon)
    let marqueId: string;
    let company: string;
    if (body.marqueId) {
      const marque = await prisma.marque.findUnique({
        where: { id: body.marqueId },
        select: { id: true, nom: true },
      });
      if (!marque) {
        return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
      }
      marqueId = marque.id;
      company = marque.nom;
    } else {
      company = String(body.company || "").trim();
      if (!company) {
        return NextResponse.json({ error: "Marque requise." }, { status: 400 });
      }
      const resolved = await findOrCreateMarque({ name: company, source: "MANUAL" });
      marqueId = resolved.marqueId;
    }

    // Contexte de déduplication par marque : chaque marque (par défaut ou
    // sous-marque d'une colonne « Marque ») a ses propres contacts déjà connus.
    // Un même fichier peut ainsi répartir ses contacts sur plusieurs marques
    // (ex. carto Unilever → Dove, Axe, Ben & Jerry's).
    type BrandCtx = {
      marqueId: string;
      company: string;
      emails: Set<string>;
      names: Set<string>;
    };
    const brandCache = new Map<string, BrandCtx>();

    const loadBrandCtx = async (id: string, nom: string): Promise<BrandCtx> => {
      const cached = brandCache.get(id);
      if (cached) return cached;
      // Réimporter une carto = réintégrer la marque à l'outreach : on lève une
      // éventuelle exclusion posée par un précédent « Retirer de l'outreach ».
      await prisma.marqueContact.updateMany({
        where: { marqueId: id, outreachExcluded: true },
        data: { outreachExcluded: false },
      });
      const existing = await prisma.marqueContact.findMany({
        where: { marqueId: id },
        select: { prenom: true, nom: true, email: true },
      });
      const ctx: BrandCtx = {
        marqueId: id,
        company: nom,
        emails: new Set(
          existing.map((c) => (c.email || "").toLowerCase()).filter(Boolean)
        ),
        names: new Set(
          existing.map((c) => `${(c.prenom || "").toLowerCase()}|${c.nom.toLowerCase()}`)
        ),
      };
      brandCache.set(id, ctx);
      return ctx;
    };

    // Marque par défaut (fallback pour les lignes sans marque propre).
    const defaultCtx = await loadBrandCtx(marqueId, company);

    const resolveRowCtx = async (rawMarque: string | null): Promise<BrandCtx> => {
      if (!rawMarque) return defaultCtx;
      const resolved = await findOrCreateMarque({ name: rawMarque, source: "IMPORT" });
      if (resolved.marqueId === marqueId) return defaultCtx;
      const cached = brandCache.get(resolved.marqueId);
      if (cached) return cached;
      const m = await prisma.marque.findUnique({
        where: { id: resolved.marqueId },
        select: { nom: true },
      });
      return loadBrandCtx(resolved.marqueId, m?.nom || rawMarque);
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

      // Marque de ce contact (colonne « Marque ») ou marque par défaut.
      const ctx = await resolveRowCtx(clean(row.marque));

      const nameKey = `${(prenom || "").toLowerCase()}|${(nom || prenom || "").toLowerCase()}`;
      if ((email && ctx.emails.has(email)) || ctx.names.has(nameKey)) {
        skipped += 1;
        continue;
      }

      // Langue propre à ce contact (override) sinon langue globale de l'import.
      const rowLanguage: "fr" | "en" = row.language === "en" ? "en" : row.language === "fr" ? "fr" : language;

      const contact = await prisma.marqueContact.create({
        data: {
          marqueId: ctx.marqueId,
          prenom,
          nom: nom || prenom || "Contact",
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

      // Email présent dans le fichier → le contact entre directement dans
      // le cycle « À contacter » (sinon il reste en attente d'email).
      if (email) {
        const alreadyInCycle = await prisma.outreachTarget.findUnique({
          where: { email },
          select: { id: true },
        });
        // Anti double-prospection : email déjà suivi dans un autre pipeline
        // (agences, Benelux) → contact créé sur la fiche mais pas dans le cycle.
        const conflict = alreadyInCycle
          ? null
          : await findCrossPipelineConflict(email, "client");
        if (!alreadyInCycle && !conflict) {
          await prisma.outreachTarget.create({
            data: {
              marqueId: ctx.marqueId,
              marqueContactId: contact.id,
              firstname: prenom || nom || "Contact",
              lastname: prenom ? nom : null,
              email,
              company: ctx.company,
              language: rowLanguage,
              createdById: session.user.id,
            },
          });
          addedToCycle += 1;
        }
      }
    }

    // Conserve le fichier original sur la fiche marque (consultable/téléchargeable)
    let fileStored = false;
    if (body.file?.base64 && body.file.name) {
      try {
        const data = Buffer.from(body.file.base64, "base64");
        if (data.length > 0 && data.length <= 10 * 1024 * 1024) {
          await prisma.marqueCartoFile.create({
            data: {
              marqueId,
              fileName: body.file.name,
              mimeType: body.file.type || "application/octet-stream",
              size: data.length,
              data,
              uploadedById: session.user.id,
            },
          });
          fileStored = true;
        }
      } catch (error) {
        console.warn("[import-carto] stockage du fichier original échoué:", error);
      }
    }

    return NextResponse.json({ marqueId, company, created, skipped, addedToCycle, fileStored });
  } catch (error) {
    console.error("POST /api/outreach/import-carto:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
