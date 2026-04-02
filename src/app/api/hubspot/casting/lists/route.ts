import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { getLists } from "@/lib/hubspot";
import { prisma } from "@/lib/prisma";

const ALLOWED_ROLES = ["CASTING_MANAGER", "ADMIN"] as const;

function isAllowed(role: string | undefined): boolean {
  return role !== undefined && (ALLOWED_ROLES as readonly string[]).includes(role);
}

type CastingListConfigRow = {
  hubspotListId: string;
  listName: string;
  isActive: boolean;
};

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role;
    if (!isAllowed(role)) {
      return NextResponse.json(
        { error: "Accès réservé aux rôles Casting ou Administrateur." },
        { status: 403 }
      );
    }

    const lists = await getLists();

    // ADMIN : pas de filtre
    if (role === "ADMIN") {
      return NextResponse.json({ lists });
    }

    // CASTING_MANAGER : uniquement whitelist active
    let configs: CastingListConfigRow[] = [];
    try {
      configs = (await prisma.$queryRaw`
        SELECT "hubspotListId", "listName", "isActive"
        FROM "CastingListConfig"
        WHERE "isActive" = true
      `) as CastingListConfigRow[];
    } catch (e: unknown) {
      // Table pas encore créée → aucun accès (liste vide) plutôt qu'un 500
      const code =
        typeof e === "object" && e !== null
          ? (e as { code?: unknown }).code
          : undefined;
      const metaCode =
        typeof e === "object" && e !== null
          ? ((e as { meta?: unknown }).meta as { code?: unknown } | undefined)?.code
          : undefined;
      if (code === "P2010" && metaCode === "42P01") {
        configs = [];
      } else {
        throw e;
      }
    }

    const allow = new Set(
      (Array.isArray(configs) ? configs : [])
        .map((c) => (typeof c.hubspotListId === "string" ? c.hubspotListId.trim() : ""))
        .filter(Boolean)
    );

    const filtered = lists.filter((l) => allow.has(String(l.id)));
    return NextResponse.json({ lists: filtered });
  } catch (e) {
    console.error("GET /api/hubspot/casting/lists:", e);
    return NextResponse.json(
      { error: "Erreur lors de la récupération des listes HubSpot." },
      { status: 500 }
    );
  }
}

