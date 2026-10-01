import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canWritePrestataireCrm } from "@/lib/prestataire-crm-access";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_ROWS = 200;

type CartoRow = {
  prenom?: string;
  nom?: string;
  poste?: string;
  role?: string;
  email?: string;
  telephone?: string;
  localisation?: string;
  linkedinUrl?: string;
  note?: string;
  source?: string;
};

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

function personKey(prenom: string | null, nom: string | null): string {
  return `${(prenom || "").toLowerCase().trim()}|${(nom || "").toLowerCase().trim()}`;
}

/**
 * POST → importe une cartographie (CSV/Excel) sur la fiche prestataire.
 * Body: { rows: CartoRow[], file?: { name, type, base64 } }
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const prestataireId = String(id || "").trim();
    const prestataire = await prisma.prestataire.findUnique({
      where: { id: prestataireId },
      select: { id: true, nom: true },
    });
    if (!prestataire) {
      return NextResponse.json({ error: "Prestataire introuvable." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      rows?: CartoRow[];
      file?: { name?: string; type?: string; base64?: string };
    };

    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun contact à importer." }, { status: 400 });
    }

    const existing = await prisma.prestataireContact.findMany({
      where: { prestataireId },
      select: { email: true, prenom: true, nom: true },
    });
    const emails = new Set(
      existing
        .map((c) => (c.email || "").toLowerCase().trim())
        .filter(Boolean)
    );
    const names = new Set(
      existing.map((c) => personKey(c.prenom, c.nom)).filter((k) => k !== "|")
    );

    let created = 0;
    let skipped = 0;

    for (const raw of rows) {
      const prenom = clean(raw.prenom);
      const nom = clean(raw.nom);
      const emailRaw = clean(raw.email);
      const email =
        emailRaw && isValidEmail(emailRaw) ? emailRaw.toLowerCase() : null;
      const role = clean(raw.role) || clean(raw.poste);
      const telephone = clean(raw.telephone);
      const localisation = clean(raw.localisation);
      const linkedinUrl = clean(raw.linkedinUrl);
      const notes = clean(raw.note);
      const source =
        String(raw.source || "CARTO").toUpperCase() === "AO" ? "AO" : "CARTO";

      if (!prenom && !nom && !email) {
        skipped += 1;
        continue;
      }

      if (email && emails.has(email)) {
        skipped += 1;
        continue;
      }
      const key = personKey(prenom, nom);
      if (!email && key !== "|" && names.has(key)) {
        skipped += 1;
        continue;
      }

      await prisma.prestataireContact.create({
        data: {
          prestataireId,
          prenom,
          nom,
          email,
          telephone,
          role,
          localisation,
          linkedinUrl,
          notes,
          source,
          principal: created === 0 && existing.length === 0,
        },
      });
      if (email) emails.add(email);
      if (key !== "|") names.add(key);
      created += 1;
    }

    let fileSaved = false;
    if (body.file?.base64 && body.file.name) {
      try {
        const buf = Buffer.from(body.file.base64, "base64");
        if (buf.length > 0 && buf.length <= 12 * 1024 * 1024) {
          await prisma.prestataireCartoFile.create({
            data: {
              prestataireId,
              fileName: String(body.file.name).slice(0, 240),
              mimeType: String(body.file.type || "application/octet-stream").slice(
                0,
                120
              ),
              size: buf.length,
              data: buf,
              kind: "CARTO",
              uploadedById: session.user.id,
            },
          });
          fileSaved = true;
        }
      } catch (e) {
        console.error("prestataire carto file save:", e);
      }
    }

    return NextResponse.json({
      ok: true,
      prestataireId,
      company: prestataire.nom,
      created,
      skipped,
      fileSaved,
    });
  } catch (error) {
    console.error("POST /api/prestataires/[id]/import-carto:", error);
    return NextResponse.json({ error: "Erreur import carto" }, { status: 500 });
  }
}
