import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { findAllMarqueIdsByName, findMarqueByName } from "@/lib/marque-resolver";
import {
  loadFuzzyCandidatesCached,
  rankFuzzyCandidates,
} from "@/lib/marque-fuzzy-search";
import {
  isForbiddenCastingRecipient,
  loadCastingRecipientBlocklist,
} from "@/lib/casting-recipient-guard";

type SearchedContact = {
  id: string;
  firstname: string;
  lastname: string;
  email: string;
  role: string;
  companyName: string;
  /** Toujours "app" : la recherche HubSpot a été retirée. */
  source: "app";
  /** Langue fiche contact CRM : "fr" | "en" */
  language?: "fr" | "en";
};

/**
 * Résout une marque à partir d'un nom saisi.
 * 1. Essai exact (slug/alias) via `findMarqueByName`.
 * 2. Repli flou tolérant aux fautes / suffixes : "Grazia" → "Grazia France",
 *    "grazai" → "Grazia", etc. Évite le "ça ne remonte pas" quand le nom stocké
 *    diffère légèrement de ce qui est tapé.
 */
async function resolveMarqueId(brand: string): Promise<string | null> {
  const exact = await findMarqueByName(brand);
  if (exact) return exact.marqueId;

  const candidates = await loadFuzzyCandidatesCached("marques:all", async () => {
    const rows = await prisma.marque.findMany({
      select: { id: true, nom: true, aliases: { select: { label: true } } },
    });
    return rows.map((r) => ({
      id: r.id,
      labels: [r.nom, ...r.aliases.map((a) => a.label)],
    }));
  });

  const ranked = rankFuzzyCandidates(brand, candidates, { threshold: 0.6, limit: 1 });
  return ranked[0]?.id ?? null;
}

// Recherche les contacts d'une marque dans le CRM interne (table `marques`).
async function searchAppContacts(brand: string): Promise<{
  contacts: SearchedContact[];
  marqueId: string | null;
}> {
  // Toutes les fiches au même nom (doublons inclus), pas seulement le 1er slug.
  let marqueIds = await findAllMarqueIdsByName(brand);
  if (marqueIds.length === 0) {
    const fallback = await resolveMarqueId(brand);
    if (fallback) marqueIds = [fallback];
  }
  if (marqueIds.length === 0) {
    return { contacts: [], marqueId: null };
  }

  // On renvoie aussi les contacts sans email (importés via carto) : ils doivent
  // « remonter » pour que l'utilisateur puisse les compléter manuellement.
  // En revanche on exclut les contacts « Achats / Appel d'offre » (source "AO"),
  // qui n'ont pas leur place dans le pipeline de prospection talent.
  const rows = await prisma.marqueContact.findMany({
    where: {
      marqueId: { in: marqueIds },
      outreachExcluded: false,
      diffusionOptOut: false,
      OR: [{ source: { not: "AO" } }, { source: null }],
    },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      principal: true,
      language: true,
      marque: { select: { nom: true } },
    },
    orderBy: [{ principal: "desc" }, { nom: "asc" }],
  });

  // Prefère la fiche au slug canonique (ou la 1re) comme marqueId « principal ».
  const primary =
    (await findMarqueByName(brand))?.marqueId ?? marqueIds[0] ?? null;

  const blocklist = await loadCastingRecipientBlocklist();
  const contacts: SearchedContact[] = rows
    .map((c) => ({
      id: c.id,
      firstname: (c.prenom || "").trim(),
      lastname: (c.nom || "").trim(),
      email: (c.email || "").trim(),
      role: (c.poste || "").trim(),
      companyName: c.marque?.nom || brand,
      source: "app" as const,
      language: (String(c.language || "").toLowerCase() === "en" ? "en" : "fr") as "fr" | "en",
    }))
    .filter(
      (c) =>
        !isForbiddenCastingRecipient(
          { email: c.email, firstname: c.firstname, lastname: c.lastname },
          blocklist
        )
    );

  return { contacts, marqueId: primary };
}

// GET - Recherche les contacts d'une marque dans le CRM interne uniquement.
// HubSpot n'est plus interrogé (imports / listes HubSpot désactivés pour le casting).
export async function GET(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const brand = (request.nextUrl.searchParams.get("brand") || "").trim();
    if (brand.length < 2) {
      return NextResponse.json(
        { error: "Paramètre brand requis (min 2 caractères)." },
        { status: 400 }
      );
    }

    const app = await searchAppContacts(brand);

    const blocklist = await loadCastingRecipientBlocklist();
    const byKey = new Map<string, SearchedContact>();
    for (const c of app.contacts) {
      const email = c.email.trim().toLowerCase();
      if (
        isForbiddenCastingRecipient(
          { email, firstname: c.firstname, lastname: c.lastname },
          blocklist
        )
      ) {
        continue;
      }
      const key = email || `id:${c.id}`;
      if (byKey.has(key)) continue;
      byKey.set(key, c);
    }

    return NextResponse.json({
      contacts: Array.from(byKey.values()),
      marqueId: app.marqueId,
    });
  } catch (error) {
    console.error("GET /api/marques/contacts:", error);
    return NextResponse.json(
      { error: "Erreur lors de la recherche des contacts de la marque." },
      { status: 500 }
    );
  }
}
