import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessStrategy,
  getOrCreateVillaProject,
  sanitizeOpportuniteForRole,
} from "@/app/api/strategy/_utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projetSlug = (searchParams.get("projetSlug") || "villa-cannes").trim();

    const opportunites = await prisma.opportuniteMarque.findMany({
      where: {
        projet: {
          slug: projetSlug,
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({
      opportunites: opportunites.map((o) => sanitizeOpportuniteForRole(role, o)),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/opportunites:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des opportunites" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }

    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      projetSlug?: string;
      nomMarque?: string;
      secteur?: string;
      angleNote?: string;
      budgetEstime?: number;
      typeActivation?: string;
      talents?: unknown;
      ownerId?: string | null;
    };

    const nomMarque = (body.nomMarque || "").trim();
    if (!nomMarque) {
      return NextResponse.json({ error: "nomMarque est requis" }, { status: 400 });
    }

    const projetSlug = (body.projetSlug || "villa-cannes").trim();
    const projet = await getOrCreateVillaProject(projetSlug);

    const opportunite = await prisma.opportuniteMarque.create({
      data: {
        projetId: projet.id,
        nomMarque,
        secteur: body.secteur?.trim() || null,
        angleNote: body.angleNote?.trim() || null,
        budgetEstime: typeof body.budgetEstime === "number" ? body.budgetEstime : null,
        typeActivation: body.typeActivation?.trim() || null,
        talents: Array.isArray(body.talents) ? body.talents : [],
        ownerId: body.ownerId ?? null,
        createdById: session.user.id,
        statut: "A_QUALIFIER",
      },
    });

    return NextResponse.json(
      { opportunite: sanitizeOpportuniteForRole(role, opportunite) },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/strategy/opportunites:", error);
    return NextResponse.json(
      { error: "Erreur lors de la creation de l'opportunite" },
      { status: 500 }
    );
  }
}
