import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreateBeneluxCompany } from "@/lib/benelux-company";

/**
 * GET → annuaire BENELUX (entreprises prospects).
 *   - sans `q` : liste complète (façon CRM léger) avec contacts + compteurs.
 *   - avec `q` (>= 2 car.) : autocomplete (8 résultats).
 *
 * POST → création rapide (inbound / QuickMarqueModal).
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER", "HEAD_OF_SALES"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const q = (request.nextUrl.searchParams.get("q") || "").trim();

    if (q.length >= 2) {
      const companies = await prisma.beneluxCompany.findMany({
        where: { nom: { contains: q, mode: "insensitive" } },
        orderBy: { nom: "asc" },
        take: 8,
        select: {
          id: true,
          nom: true,
          secteur: true,
          ville: true,
          linkedMarqueId: true,
        },
      });
      return NextResponse.json({ companies });
    }

    const companies = await prisma.beneluxCompany.findMany({
      orderBy: { nom: "asc" },
      select: {
        id: true,
        nom: true,
        secteur: true,
        siteWeb: true,
        ville: true,
        notes: true,
        createdAt: true,
        linkedMarqueId: true,
        linkedMarque: { select: { id: true, nom: true } },
        contacts: {
          where: { excluded: false },
          orderBy: [{ principal: "desc" }, { prenom: "asc" }],
          select: { id: true, prenom: true, nom: true, email: true, principal: true },
        },
        _count: { select: { contacts: true, outreachTargets: true } },
      },
    });

    return NextResponse.json({ companies });
  } catch (error) {
    console.error("GET /api/benelux-outreach/companies:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const nom = String(body.nom || "").trim();
    if (!nom) {
      return NextResponse.json({ error: "Nom de l'entreprise requis" }, { status: 400 });
    }

    const company = await findOrCreateBeneluxCompany(nom, session.user.id);
    const secteur = String(body.secteur || "").trim();
    const siteWeb = String(body.siteWeb || "").trim();
    const linkedMarqueId = String(body.linkedMarqueId || "").trim() || null;
    if (secteur || siteWeb || linkedMarqueId) {
      await prisma.beneluxCompany.update({
        where: { id: company.id },
        data: {
          ...(secteur ? { secteur } : {}),
          ...(siteWeb ? { siteWeb } : {}),
          ...(linkedMarqueId ? { linkedMarqueId } : {}),
        },
      });
    }

    return NextResponse.json({
      id: company.id,
      nom: company.nom,
      slug: company.slug,
      market: "BENELUX",
      linkedMarqueId: linkedMarqueId || null,
    });
  } catch (error) {
    console.error("POST /api/benelux-outreach/companies:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
