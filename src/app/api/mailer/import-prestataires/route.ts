import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireMailerAccess } from "@/lib/requireMailerAccess";
import { splitFullName } from "@/lib/parse-carto";
import {
  PRESTATAIRE_CATEGORIES,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";

/**
 * POST → import prestataires depuis le rédacteur de mails.
 * CRM Prestataires UNIQUEMENT (jamais Marque).
 * 1 nom de boîte = 1 fiche Prestataire (même catégorie), N contacts.
 * Type + ville choisis côté UI (appliqués à tout le lot).
 */

const RowInput = z.object({
  email: z.string().trim().email(),
  name: z.string().trim().max(200).optional().nullable(),
  hotel: z.string().trim().min(1).max(300),
});

const Input = z.object({
  categorie: z.enum(PRESTATAIRE_CATEGORIES),
  ville: z.string().trim().min(1).max(120),
  rows: z.array(RowInput).min(1),
});

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

export async function POST(request: NextRequest) {
  const session = await requireMailerAccess(request);
  if (!session) {
    return NextResponse.json({ error: "Accès non autorisé." }, { status: 403 });
  }

  const json = await request.json().catch(() => null);
  const parsed = Input.safeParse(json);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error:
          parsed.error.issues[0]?.message ||
          "Données invalides. Type, ville, email et nom de boîte sont requis.",
      },
      { status: 400 }
    );
  }

  const categorie = parsed.data.categorie as PrestataireCategorie;
  const ville = parsed.data.ville.trim();

  type Group = {
    hotelNom: string;
    contacts: { email: string; prenom: string; nom: string }[];
  };
  const groups = new Map<string, Group>();

  for (const row of parsed.data.rows) {
    const hotelNom = row.hotel.trim();
    if (!hotelNom) continue;
    const key = normKey(hotelNom);
    const split = splitFullName(row.name || "");
    const contact = {
      email: row.email.toLowerCase(),
      prenom: split.prenom,
      nom: split.nom || split.prenom || row.email.split("@")[0] || "Contact",
    };
    const existing = groups.get(key);
    if (existing) {
      if (!existing.contacts.some((c) => c.email === contact.email)) {
        existing.contacts.push(contact);
      }
    } else {
      groups.set(key, { hotelNom, contacts: [contact] });
    }
  }

  if (groups.size === 0) {
    return NextResponse.json(
      { error: "Aucun nom de boîte / établissement trouvé dans les lignes." },
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

  let created = 0;
  let merged = 0;
  let contactsCreated = 0;

  for (const group of groups.values()) {
    const key = normKey(group.hotelNom);
    let hotel = byNorm.get(key);

    if (!hotel) {
      const row = await prisma.prestataire.create({
        data: {
          nom: group.hotelNom,
          categorie,
          ville,
        },
        select: {
          id: true,
          nom: true,
          ville: true,
          contacts: { select: { email: true, prenom: true, nom: true } },
        },
      });
      hotel = row;
      byNorm.set(key, hotel);
      created += 1;
    } else {
      merged += 1;
      if (ville && hotel.ville !== ville) {
        await prisma.prestataire.update({
          where: { id: hotel.id },
          data: { ville },
        });
        hotel = { ...hotel, ville };
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

    for (const c of group.contacts) {
      const email = c.email.toLowerCase().trim();
      const pk = personKey(c.prenom || null, c.nom || null);
      if (email && emails.has(email)) continue;
      if (!email && pk !== "|" && names.has(pk)) continue;

      await prisma.prestataireContact.create({
        data: {
          prestataireId: hotel.id,
          prenom: c.prenom || null,
          nom: c.nom || null,
          email,
          principal: emails.size === 0 && names.size === 0,
          source: "CARTO",
        },
      });
      if (email) emails.add(email);
      if (pk !== "|") names.add(pk);
      contactsCreated += 1;
      hotel = {
        ...hotel,
        contacts: [
          ...hotel.contacts,
          { email, prenom: c.prenom || null, nom: c.nom || null },
        ],
      };
      byNorm.set(key, hotel);
    }
  }

  return NextResponse.json({
    ok: true,
    categorie,
    ville,
    hotels: groups.size,
    created,
    merged,
    contactsCreated,
  });
}
