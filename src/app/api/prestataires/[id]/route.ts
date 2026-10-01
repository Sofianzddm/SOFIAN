import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessPrestataireCrm,
  canWritePrestataireCrm,
} from "@/lib/prestataire-crm-access";
import { isValidPrestataireCategorie } from "@/lib/projets-outreach";

type RouteContext = { params: Promise<{ id: string }> };

async function load(id: string) {
  return prisma.prestataire.findUnique({
    where: { id },
    include: {
      contacts: { orderBy: [{ principal: "desc" }, { createdAt: "asc" }] },
      cartoFiles: {
        orderBy: { createdAt: "desc" },
        select: {
          id: true,
          fileName: true,
          mimeType: true,
          size: true,
          kind: true,
          createdAt: true,
        },
      },
      campaignLinks: {
        orderBy: { updatedAt: "desc" },
        take: 20,
        include: {
          campaign: {
            select: {
              id: true,
              title: true,
              status: true,
              talent: { select: { prenom: true, nom: true } },
            },
          },
        },
      },
    },
  });
}

function serialize(p: NonNullable<Awaited<ReturnType<typeof load>>>) {
  return {
    id: p.id,
    nom: p.nom,
    categorie: p.categorie,
    siteWeb: p.siteWeb,
    email: p.email,
    telephone: p.telephone,
    instagram: p.instagram,
    adresse: p.adresse,
    ville: p.ville,
    notes: p.notes,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt,
    contacts: p.contacts,
    cartoFiles: p.cartoFiles,
    projets: p.campaignLinks.map((l) => ({
      linkId: l.id,
      statut: l.statut,
      campaignId: l.campaign.id,
      campaignTitle: l.campaign.title,
      campaignStatus: l.campaign.status,
      talentName: `${l.campaign.talent.prenom} ${l.campaign.talent.nom}`.trim(),
    })),
  };
}

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessPrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const row = await load(String(id || "").trim());
    if (!row) return NextResponse.json({ error: "Introuvable." }, { status: 404 });
    return NextResponse.json({ prestataire: serialize(row) });
  } catch (error) {
    console.error("GET /api/prestataires/[id]:", error);
    return NextResponse.json({ error: "Erreur chargement" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canWritePrestataireCrm(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await context.params;
    const prestataireId = String(id || "").trim();
    const existing = await prisma.prestataire.findUnique({ where: { id: prestataireId } });
    if (!existing) return NextResponse.json({ error: "Introuvable." }, { status: 404 });

    const body = (await request.json()) as Record<string, unknown>;
    const data: Record<string, unknown> = {};
    if (body.nom !== undefined) {
      const nom = String(body.nom || "").trim();
      if (!nom) return NextResponse.json({ error: "Nom requis." }, { status: 400 });
      data.nom = nom;
    }
    if (body.categorie !== undefined) {
      const cat = String(body.categorie || "").trim().toUpperCase();
      if (!isValidPrestataireCategorie(cat)) {
        return NextResponse.json({ error: "Catégorie invalide." }, { status: 400 });
      }
      data.categorie = cat;
    }
    for (const key of [
      "siteWeb",
      "email",
      "telephone",
      "instagram",
      "adresse",
      "ville",
      "notes",
    ] as const) {
      if (body[key] !== undefined) {
        data[key] = String(body[key] || "").trim() || null;
      }
    }

    if (Object.keys(data).length === 0) {
      return NextResponse.json({ error: "Aucune modification." }, { status: 400 });
    }

    await prisma.prestataire.update({ where: { id: prestataireId }, data });
    const row = await load(prestataireId);
    return NextResponse.json({ prestataire: row ? serialize(row) : null });
  } catch (error) {
    console.error("PATCH /api/prestataires/[id]:", error);
    return NextResponse.json({ error: "Erreur mise à jour" }, { status: 500 });
  }
}
