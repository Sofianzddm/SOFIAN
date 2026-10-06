import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canWritePrestataireCrm } from "@/lib/prestataire-crm-access";
import {
  isValidPrestataireCategorie,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";

const MAX_ROWS = 500;

type BulkRow = {
  hotel?: string;
  ville?: string;
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

function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function personKey(prenom: string | null, nom: string | null): string {
  return `${(prenom || "").toLowerCase().trim()}|${(nom || "").toLowerCase().trim()}`;
}

/**
 * POST → import bulk hôtels/prestas depuis CSV.
 * Groupe les lignes par nom d’hôtel → 1 fiche (créée ou fusionnée) + contacts.
 * Body: { categorie, rows: BulkRow[], file? }
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      categorie?: string;
      rows?: BulkRow[];
      file?: { name?: string; type?: string; base64?: string };
    };

    const catRaw = String(body.categorie || "").trim().toUpperCase();
    if (!isValidPrestataireCategorie(catRaw)) {
      return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
    }
    const categorie: PrestataireCategorie = catRaw;

    const rows = Array.isArray(body.rows) ? body.rows.slice(0, MAX_ROWS) : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucune ligne à importer." }, { status: 400 });
    }

    type Group = {
      hotelNom: string;
      ville: string | null;
      contacts: BulkRow[];
    };
    const groups = new Map<string, Group>();

    for (const raw of rows) {
      const hotelNom = clean(raw.hotel);
      if (!hotelNom) continue;
      const key = normKey(hotelNom);
      const existing = groups.get(key);
      const ville = clean(raw.ville) || clean(raw.localisation);
      if (existing) {
        if (!existing.ville && ville) existing.ville = ville;
        existing.contacts.push(raw);
      } else {
        groups.set(key, {
          hotelNom,
          ville,
          contacts: [raw],
        });
      }
    }

    if (groups.size === 0) {
      return NextResponse.json(
            {
              error:
                "Aucune colonne établissement trouvée (Hôtel, Traiteur, Fleuriste, Établissement…). Ajoute-la dans le CSV.",
            },
        { status: 400 }
      );
    }

    const existingHotels = await prisma.prestataire.findMany({
      where: { categorie },
      select: {
        id: true,
        nom: true,
        ville: true,
        contacts: { select: { email: true, prenom: true, nom: true } },
      },
    });
    const byNorm = new Map(
      existingHotels.map((h) => [normKey(h.nom), h] as const)
    );

    let hotelsCreated = 0;
    let hotelsMerged = 0;
    let contactsCreated = 0;
    let contactsSkipped = 0;
    const resultHotels: Array<{ id: string; nom: string; created: boolean }> =
      [];

    let fileBuf: Buffer | null = null;
    let fileMeta: { name: string; type: string } | null = null;
    if (body.file?.base64 && body.file.name) {
      try {
        const buf = Buffer.from(body.file.base64, "base64");
        if (buf.length > 0 && buf.length <= 12 * 1024 * 1024) {
          fileBuf = buf;
          fileMeta = {
            name: String(body.file.name).slice(0, 240),
            type: String(body.file.type || "application/octet-stream").slice(
              0,
              120
            ),
          };
        }
      } catch {
        /* ignore */
      }
    }

    for (const group of groups.values()) {
      const key = normKey(group.hotelNom);
      let hotel = byNorm.get(key);
      let created = false;

      if (!hotel) {
        const createdRow = await prisma.prestataire.create({
          data: {
            nom: group.hotelNom,
            categorie,
            ville: group.ville,
          },
          select: {
            id: true,
            nom: true,
            ville: true,
            contacts: { select: { email: true, prenom: true, nom: true } },
          },
        });
        hotel = createdRow;
        byNorm.set(key, hotel);
        hotelsCreated += 1;
        created = true;
      } else {
        hotelsMerged += 1;
        if (group.ville && !hotel.ville) {
          await prisma.prestataire.update({
            where: { id: hotel.id },
            data: { ville: group.ville },
          });
          hotel = { ...hotel, ville: group.ville };
          byNorm.set(key, hotel);
        }
      }

      const emails = new Set(
        hotel.contacts
          .map((c) => (c.email || "").toLowerCase().trim())
          .filter(Boolean)
      );
      const names = new Set(
        hotel.contacts
          .map((c) => personKey(c.prenom, c.nom))
          .filter((k) => k !== "|")
      );

      for (const raw of group.contacts) {
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

        // Ligne = seulement le nom d’hôtel sans contact → skip contact
        if (!prenom && !nom && !email && !role && !linkedinUrl && !telephone) {
          continue;
        }

        if (email && emails.has(email)) {
          contactsSkipped += 1;
          continue;
        }
        const pk = personKey(prenom, nom);
        if (!email && pk !== "|" && names.has(pk)) {
          contactsSkipped += 1;
          continue;
        }

        await prisma.prestataireContact.create({
          data: {
            prestataireId: hotel.id,
            prenom,
            nom,
            email,
            telephone,
            role,
            localisation,
            linkedinUrl,
            notes,
            source,
            principal: emails.size === 0 && names.size === 0,
          },
        });
        if (email) emails.add(email);
        if (pk !== "|") names.add(pk);
        hotel.contacts.push({
          email,
          prenom,
          nom,
        });
        contactsCreated += 1;
      }

      if (fileBuf && fileMeta && created) {
        await prisma.prestataireCartoFile.create({
          data: {
            prestataireId: hotel.id,
            fileName: fileMeta.name,
            mimeType: fileMeta.type,
            size: fileBuf.length,
            data: new Uint8Array(fileBuf),
            kind: "CARTO",
            uploadedById: session.user.id,
          },
        });
        // Un seul exemplaire du fichier source (sur la 1re fiche créée).
        fileBuf = null;
      }

      resultHotels.push({ id: hotel.id, nom: hotel.nom, created });
    }

    // Si aucune fiche créée (tout fusionné), attache le fichier à la 1re fusionnée.
    if (fileBuf && fileMeta && resultHotels[0]) {
      await prisma.prestataireCartoFile.create({
        data: {
          prestataireId: resultHotels[0].id,
          fileName: fileMeta.name,
          mimeType: fileMeta.type,
          size: fileBuf.length,
          data: new Uint8Array(fileBuf),
          kind: "CARTO",
          uploadedById: session.user.id,
        },
      });
    }

    return NextResponse.json({
      ok: true,
      hotelsCreated,
      hotelsMerged,
      contactsCreated,
      contactsSkipped,
      hotels: resultHotels,
    });
  } catch (error) {
    console.error("POST /api/prestataires/import-bulk:", error);
    return NextResponse.json({ error: "Erreur import bulk" }, { status: 500 });
  }
}
