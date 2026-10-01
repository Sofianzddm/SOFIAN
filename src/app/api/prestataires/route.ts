import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessPrestataireCrm,
  canWritePrestataireCrm,
} from "@/lib/prestataire-crm-access";
import {
  isValidPrestataireCategorie,
  type PrestataireCategorie,
} from "@/lib/projets-outreach";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessPrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const q = String(request.nextUrl.searchParams.get("q") || "").trim();
    const cat = String(request.nextUrl.searchParams.get("categorie") || "")
      .trim()
      .toUpperCase();
    const ville = String(request.nextUrl.searchParams.get("ville") || "").trim();
    const summary = request.nextUrl.searchParams.get("summary") === "1";

    if (summary) {
      const [byCat, total, villesDistinct] = await Promise.all([
        prisma.prestataire.groupBy({
          by: ["categorie"],
          _count: { _all: true },
        }),
        prisma.prestataire.count(),
        prisma.prestataire.findMany({
          where: { ville: { not: null } },
          select: { ville: true },
          distinct: ["ville"],
        }),
      ]);
      return NextResponse.json({
        total,
        villesCount: villesDistinct.filter((v) => v.ville?.trim()).length,
        byCategorie: Object.fromEntries(
          byCat.map((r) => [r.categorie, r._count._all])
        ),
      });
    }

    const where: Record<string, unknown> = {};
    if (q) {
      where.OR = [
        { nom: { contains: q, mode: "insensitive" } },
        { ville: { contains: q, mode: "insensitive" } },
        { email: { contains: q, mode: "insensitive" } },
      ];
    }
    if (isValidPrestataireCategorie(cat)) where.categorie = cat;
    if (ville) where.ville = { equals: ville, mode: "insensitive" };

    const villesWhere: Record<string, unknown> = {
      ville: { not: null },
    };
    if (isValidPrestataireCategorie(cat)) villesWhere.categorie = cat;

    const [rows, villesRaw] = await Promise.all([
      prisma.prestataire.findMany({
        where,
        orderBy: [{ ville: "asc" }, { nom: "asc" }],
        take: 200,
        include: {
          _count: { select: { contacts: true, campaignLinks: true } },
        },
      }),
      prisma.prestataire.findMany({
        where: villesWhere,
        select: { ville: true },
        distinct: ["ville"],
        orderBy: { ville: "asc" },
      }),
    ]);

    return NextResponse.json({
      villes: villesRaw
        .map((v) => v.ville)
        .filter((v): v is string => Boolean(v && v.trim())),
      prestataires: rows.map((p) => ({
        id: p.id,
        nom: p.nom,
        categorie: p.categorie,
        ville: p.ville,
        email: p.email,
        telephone: p.telephone,
        contactCount: p._count.contacts,
        projetCount: p._count.campaignLinks,
        updatedAt: p.updatedAt,
      })),
    });
  } catch (error) {
    console.error("GET /api/prestataires:", error);
    return NextResponse.json({ error: "Erreur chargement" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as Record<string, unknown>;
    const nom = String(body.nom || "").trim();
    if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });

    const catRaw = String(body.categorie || "AUTRE").trim().toUpperCase();
    const categorie: PrestataireCategorie = isValidPrestataireCategorie(catRaw)
      ? catRaw
      : "AUTRE";

    const created = await prisma.prestataire.create({
      data: {
        nom,
        categorie,
        siteWeb: String(body.siteWeb || "").trim() || null,
        email: String(body.email || "").trim() || null,
        telephone: String(body.telephone || "").trim() || null,
        instagram: String(body.instagram || "").trim() || null,
        adresse: String(body.adresse || "").trim() || null,
        ville: String(body.ville || "").trim() || null,
        notes: String(body.notes || "").trim() || null,
      },
    });

    return NextResponse.json({ prestataire: created }, { status: 201 });
  } catch (error) {
    console.error("POST /api/prestataires:", error);
    return NextResponse.json({ error: "Erreur création" }, { status: 500 });
  }
}
