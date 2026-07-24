import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { findMarqueByName } from "@/lib/marque-resolver";
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
  source: "app" | "hubspot";
};

type HubSpotSearchResponse = {
  results?: Array<{
    id?: string;
    properties?: Record<string, string | undefined>;
  }>;
  paging?: {
    next?: {
      after?: string;
    };
  };
};

const HUBSPOT_BASE_URL = "https://api.hubapi.com";

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
  const marqueId = await resolveMarqueId(brand);
  if (!marqueId) {
    return { contacts: [], marqueId: null };
  }

  const rows = await prisma.marqueContact.findMany({
    where: { marqueId, email: { not: null } },
    select: {
      id: true,
      prenom: true,
      nom: true,
      email: true,
      poste: true,
      principal: true,
    },
    orderBy: [{ principal: "desc" }, { nom: "asc" }],
  });

  const marque = await prisma.marque.findUnique({
    where: { id: marqueId },
    select: { nom: true },
  });

  const contacts: SearchedContact[] = rows
    .map((c) => ({
      id: c.id,
      firstname: (c.prenom || "").trim(),
      lastname: (c.nom || "").trim(),
      email: (c.email || "").trim(),
      role: (c.poste || "").trim(),
      companyName: marque?.nom || brand,
      source: "app" as const,
    }))
    .filter((c) => c.email);

  return { contacts, marqueId };
}

// Recherche les contacts d'une marque dans HubSpot (par nom de société).
async function searchHubspotContacts(brand: string): Promise<SearchedContact[]> {
  const apiKey = process.env.HUBSPOT_API_KEY;
  if (!apiKey) return [];

  const contacts: SearchedContact[] = [];
  let after: string | undefined;
  let loops = 0;
  try {
    do {
      loops += 1;
      const response = await fetch(`${HUBSPOT_BASE_URL}/crm/v3/objects/contacts/search`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          filterGroups: [
            {
              filters: [
                {
                  propertyName: "company",
                  operator: "CONTAINS_TOKEN",
                  value: brand,
                },
              ],
            },
          ],
          properties: ["firstname", "lastname", "email", "company", "jobtitle"],
          limit: 100,
          ...(after ? { after } : {}),
        }),
      });

      if (!response.ok) {
        const detail = await response.text().catch(() => "");
        console.error("searchHubspotContacts:", response.status, detail);
        break;
      }

      const data = (await response.json()) as HubSpotSearchResponse;
      const batch = Array.isArray(data.results) ? data.results : [];
      for (const item of batch) {
        const props = item.properties || {};
        const email = (props.email || "").trim();
        if (!email) continue;
        contacts.push({
          id: `hs-${String(item.id || "")}`,
          firstname: (props.firstname || "").trim(),
          lastname: (props.lastname || "").trim(),
          email,
          role: (props.jobtitle || "").trim(),
          companyName: (props.company || "").trim() || brand,
          source: "hubspot",
        });
      }

      after = data.paging?.next?.after;
    } while (after && loops < 5);
  } catch (error) {
    console.error("searchHubspotContacts:", error);
    return contacts;
  }

  return contacts;
}

// GET - Recherche les contacts d'une marque à la fois dans le CRM interne (table
// `marques`) ET dans HubSpot, puis fusionne/dédoublonne les résultats par email.
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

    const [app, hubspot] = await Promise.all([
      searchAppContacts(brand),
      searchHubspotContacts(brand),
    ]);

    // Fusion : contacts de l'app d'abord, puis HubSpot ; dédoublonnage par email.
    const byEmail = new Map<string, SearchedContact>();
    for (const c of [...app.contacts, ...hubspot]) {
      const key = c.email.trim().toLowerCase();
      if (!key || byEmail.has(key)) continue;
      byEmail.set(key, c);
    }

    return NextResponse.json({
      contacts: Array.from(byEmail.values()),
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
