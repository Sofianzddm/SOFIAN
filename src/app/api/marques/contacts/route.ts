import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  loadBrandContactsFrAndBe,
  resolveMarqueIdsForBrand,
  type CrmBrandContact,
} from "@/lib/crm-brand-contacts";
import {
  isForbiddenCastingRecipient,
  loadCastingRecipientBlocklist,
} from "@/lib/casting-recipient-guard";
import prisma from "@/lib/prisma";
import { findAllMarqueIdsByName, findMarqueByName } from "@/lib/marque-resolver";
import {
  loadFuzzyCandidatesCached,
  rankFuzzyCandidates,
} from "@/lib/marque-fuzzy-search";

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
  /** FR, Benelux, ou BOTH (même email sur les 2 fiches / FR+BE). */
  market?: "FR" | "BENELUX" | "BOTH";
};

/**
 * Résout une marque à partir d'un nom saisi.
 * 1. Essai exact (slug/alias) via `findMarqueByName`.
 * 2. Repli flou tolérant aux fautes / suffixes.
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

/** YSL Beauty / Yves Saint Laurent sont éclatés en plusieurs fiches CRM. */
async function expandRelatedMarqueIds(
  brand: string,
  marqueIds: string[]
): Promise<string[]> {
  if (!/\bysl\b|yves\s*saint\s*laurent|saint\s*laurent\s*beaut/i.test(brand)) {
    return marqueIds;
  }
  const related = await prisma.marque.findMany({
    where: {
      OR: [
        { nom: { contains: "YSL", mode: "insensitive" } },
        { nom: { contains: "Saint Laurent", mode: "insensitive" } },
      ],
      AND: [
        { NOT: { nom: { contains: "L'Oréal Luxe (Samy", mode: "insensitive" } } },
        { NOT: { nom: { contains: "Rocher", mode: "insensitive" } } },
      ],
    },
    select: { id: true, nom: true },
  });
  return Array.from(
    new Set([
      ...marqueIds,
      ...related
        .filter((m) => !/rocher/i.test(m.nom))
        .filter((m) => /ysl|saint\s*laurent/i.test(m.nom))
        .map((m) => m.id),
    ])
  );
}

async function searchAppContactsFrOnly(brand: string): Promise<{
  contacts: SearchedContact[];
  marqueId: string | null;
}> {
  let marqueIds = await findAllMarqueIdsByName(brand);
  if (marqueIds.length === 0) {
    const fallback = await resolveMarqueId(brand);
    if (fallback) marqueIds = [fallback];
  }
  marqueIds = await expandRelatedMarqueIds(brand, marqueIds);
  if (marqueIds.length === 0) {
    return { contacts: [], marqueId: null };
  }

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
      language: (String(c.language || "").toLowerCase() === "en" ? "en" : "fr") as
        | "fr"
        | "en",
      market: "FR" as const,
    }))
    .filter(
      (c) =>
        !isForbiddenCastingRecipient(
          { email: c.email, firstname: c.firstname, lastname: c.lastname },
          blocklist,
          { brand }
        )
    );

  return { contacts, marqueId: primary };
}

function mapMerged(c: CrmBrandContact): SearchedContact {
  return {
    id: c.id,
    firstname: c.firstname,
    lastname: c.lastname,
    email: c.email,
    role: c.role,
    companyName: c.companyName,
    source: "app",
    language: c.language,
    market: c.market,
  };
}

// GET - Recherche les contacts d'une marque dans le CRM interne uniquement.
// HubSpot n'est plus interrogé (imports / listes HubSpot désactivés pour le casting).
// ?includeBenelux=1 → ajoute les contacts Benelux liés / homonymes (drapeau market).
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

    const includeBenelux =
      request.nextUrl.searchParams.get("includeBenelux") === "1" ||
      request.nextUrl.searchParams.get("includeBenelux") === "true";

    if (includeBenelux) {
      const marqueIds = await resolveMarqueIdsForBrand(brand);
      const merged = await loadBrandContactsFrAndBe({
        marqueIds,
        brandNames: [brand],
        // Garder aussi sans email pour complétion manuelle (comportement historique FR).
        requireEmail: false,
      });
      const blocklist = await loadCastingRecipientBlocklist();
      const byKey = new Map<string, SearchedContact>();
      for (const raw of merged) {
        const c = mapMerged(raw);
        if (
          isForbiddenCastingRecipient(
            { email: c.email, firstname: c.firstname, lastname: c.lastname },
            blocklist,
            { brand }
          )
        ) {
          continue;
        }
        const email = c.email.trim().toLowerCase();
        const key = email || `id:${c.id}`;
        if (byKey.has(key)) continue;
        byKey.set(key, c);
      }
      return NextResponse.json({
        contacts: Array.from(byKey.values()),
        marqueId: marqueIds[0] ?? null,
      });
    }

    const app = await searchAppContactsFrOnly(brand);

    const blocklist = await loadCastingRecipientBlocklist();
    const byKey = new Map<string, SearchedContact>();
    for (const c of app.contacts) {
      const email = c.email.trim().toLowerCase();
      if (
        isForbiddenCastingRecipient(
          { email, firstname: c.firstname, lastname: c.lastname },
          blocklist,
          { brand }
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
