import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

type CastingListConfigRow = {
  id: string;
  hubspotListId: string;
  listName: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
};

function isAdmin(role: string | undefined): boolean {
  return role === "ADMIN";
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Accès réservé à l’admin." }, { status: 403 });
    }

    let rows: CastingListConfigRow[] = [];
    try {
      rows = (await prisma.$queryRaw`
        SELECT "id", "hubspotListId", "listName", "isActive", "createdAt", "updatedAt"
        FROM "CastingListConfig"
        ORDER BY "listName" ASC
      `) as CastingListConfigRow[];
    } catch (e: unknown) {
      // Table pas encore créée (Neon SQL Editor) → retourner vide au lieu d'un 500
      const code =
        typeof e === "object" && e !== null
          ? (e as { code?: unknown }).code
          : undefined;
      const metaCode =
        typeof e === "object" && e !== null
          ? ((e as { meta?: unknown }).meta as { code?: unknown } | undefined)?.code
          : undefined;
      if (code === "P2010" && metaCode === "42P01") {
        rows = [];
      } else {
        throw e;
      }
    }

    return NextResponse.json({
      configs: Array.isArray(rows) ? rows : [],
    });
  } catch (e) {
    console.error("GET /api/settings/casting-lists:", e);
    return NextResponse.json(
      { error: "Erreur lors du chargement des paramètres." },
      { status: 500 }
    );
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!isAdmin(session.user.role)) {
      return NextResponse.json({ error: "Accès réservé à l’admin." }, { status: 403 });
    }

    const body = (await request.json().catch(() => null)) as
      | { hubspotListId?: unknown; listName?: unknown; isActive?: unknown }
      | null;

    const hubspotListId =
      body && typeof body.hubspotListId === "string" ? body.hubspotListId.trim() : "";
    const listName = body && typeof body.listName === "string" ? body.listName.trim() : "";
    const isActive = body && typeof body.isActive === "boolean" ? body.isActive : null;

    if (!hubspotListId || !listName || isActive === null) {
      return NextResponse.json(
        { error: "hubspotListId, listName et isActive sont requis." },
        { status: 400 }
      );
    }

    await prisma.$executeRaw`
      INSERT INTO "CastingListConfig" ("hubspotListId", "listName", "isActive", "createdAt", "updatedAt")
      VALUES (${hubspotListId}, ${listName}, ${isActive}, NOW(), NOW())
      ON CONFLICT ("hubspotListId")
      DO UPDATE SET
        "listName" = EXCLUDED."listName",
        "isActive" = EXCLUDED."isActive",
        "updatedAt" = NOW()
    `;

    return NextResponse.json({ success: true });
  } catch (e) {
    console.error("PATCH /api/settings/casting-lists:", e);
    return NextResponse.json(
      { error: "Erreur lors de la sauvegarde." },
      { status: 500 }
    );
  }
}

