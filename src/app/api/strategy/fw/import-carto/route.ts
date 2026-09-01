import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireFwAccess } from "../_auth";
import {
  contactHasFwEmail,
  FW_PROJET_SLUG,
  fwClientInclude,
  refreshFwClientStatut,
  serializeFwClient,
} from "@/lib/fw-prospection";
import { isFwVille } from "@/lib/fw-villes";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";

const MAX_ROWS = 250;

type CartoRow = {
  prenom?: string;
  nom?: string;
  poste?: string;
  perimetre?: string;
  localisation?: string;
  linkedinUrl?: string;
  email?: string;
  note?: string;
  marquesGerees?: string;
  marche?: string;
};

const clean = (v: unknown): string | null => {
  const s = typeof v === "string" ? v.trim() : "";
  return s || null;
};

function personKey(input: {
  prenom: string | null;
  nom: string | null;
  email: string;
  linkedinUrl: string | null;
}): string | null {
  if (input.email) return `e:${input.email}`;
  const li = (input.linkedinUrl || "").trim().toLowerCase().replace(/\/+$/, "");
  if (li) return `li:${li}`;
  const prenom = (input.prenom || "").toLowerCase();
  const nom = (input.nom || "").toLowerCase();
  if (prenom || nom) return `n:${prenom}|${nom}`;
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const auth = await requireFwAccess(request);
    if (!auth.ok) return auth.error;
    if (!auth.isAdmin) {
      return NextResponse.json(
        { error: "Seuls les ADMIN peuvent importer une cartographie FW." },
        { status: 403 }
      );
    }

    await getOrCreateVillaProject(FW_PROJET_SLUG);

    const body = (await request.json().catch(() => ({}))) as {
      clientId?: string;
      nom?: string;
      ville?: string;
      rows?: CartoRow[];
      file?: { name?: string; type?: string; base64?: string };
    };

    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucun contact à importer." }, { status: 400 });
    }

    let client = body.clientId
      ? await prisma.fwClient.findUnique({
          where: { id: body.clientId },
          include: { contacts: true },
        })
      : null;

    if (!client) {
      const nom = (body.nom || "").trim();
      if (!nom) {
        return NextResponse.json(
          { error: "Choisis une maison ou indique son nom." },
          { status: 400 }
        );
      }
      const existing = await prisma.fwClient.findFirst({
        where: { nom: { equals: nom, mode: "insensitive" } },
        include: { contacts: true },
      });
      if (existing) {
        client = existing;
      } else {
        const ville = (body.ville || "PARIS").trim().toUpperCase().replace(/ /g, "_");
        if (!isFwVille(ville)) {
          return NextResponse.json({ error: "Ville de Fashion Week inconnue." }, { status: 400 });
        }
        client = await prisma.fwClient.create({
          data: {
            nom,
            ville,
            createdById: auth.userId,
          },
          include: { contacts: true },
        });
      }
    }

    const existingKeys = new Set(
      client.contacts
        .map((c) =>
          personKey({
            prenom: c.firstName,
            nom: c.lastName,
            email: (c.email || "").trim().toLowerCase(),
            linkedinUrl: c.linkedinUrl,
          })
        )
        .filter((k): k is string => Boolean(k))
    );

    let created = 0;
    let skipped = 0;
    let withEmail = 0;
    let queued = 0;

    for (const raw of rows) {
      const emailRaw = String(raw.email || "").trim().toLowerCase();
      const email = contactHasFwEmail(emailRaw) ? emailRaw : "";
      const firstName = clean(raw.prenom);
      const lastName = clean(raw.nom);
      const linkedinUrl = clean(raw.linkedinUrl);
      if (!email && !firstName && !lastName && !linkedinUrl) {
        skipped += 1;
        continue;
      }
      const key = personKey({
        prenom: firstName,
        nom: lastName,
        email,
        linkedinUrl,
      });
      if (!key || existingKeys.has(key)) {
        skipped += 1;
        continue;
      }
      existingKeys.add(key);

      const status = email ? "FOUND" : "QUEUED";
      try {
        await prisma.fwContact.create({
          data: {
            clientId: client.id,
            email: email || null,
            firstName,
            lastName,
            role: clean(raw.poste),
            perimetre: clean(raw.perimetre),
            localisation: clean(raw.localisation),
            linkedinUrl,
            note: clean(raw.note),
            marquesGerees: clean(raw.marquesGerees),
            marche: clean(raw.marche),
            emailLookupStatus: status,
            emailLookupQueuedAt: email ? null : new Date(),
            addedById: auth.userId,
          },
        });
      } catch (e) {
        const code = (e as { code?: string }).code;
        if (code === "P2002") {
          skipped += 1;
          continue;
        }
        throw e;
      }
      created += 1;
      if (email) withEmail += 1;
      else queued += 1;
    }

    await refreshFwClientStatut(client.id);

    if (body.file?.base64 && body.file.name) {
      try {
        const data = Buffer.from(body.file.base64, "base64");
        if (data.length > 0 && data.length <= 10 * 1024 * 1024) {
          await prisma.fwCartoFile.create({
            data: {
              clientId: client.id,
              fileName: body.file.name,
              mimeType: body.file.type || "application/octet-stream",
              size: data.length,
              data,
              uploadedById: auth.userId,
            },
          });
        }
      } catch (e) {
        console.warn("FW carto file store:", e);
      }
    }

    const updated = await prisma.fwClient.findUnique({
      where: { id: client.id },
      include: fwClientInclude,
    });

    return NextResponse.json({
      company: updated?.nom || client.nom,
      clientId: client.id,
      created,
      skipped,
      withEmail,
      queued,
      client: updated ? serializeFwClient(updated, auth.role, true) : null,
    });
  } catch (error) {
    console.error("POST /api/strategy/fw/import-carto:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
