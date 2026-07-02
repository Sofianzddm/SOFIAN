import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET → fiche d'une entreprise prospect BENELUX : identité, contacts
 * (avec champs carto + statut outreach de chacun) et prospects suivis.
 * Alimente la page /marques/benelux/[id].
 *
 * Module 100 % isolé du CRM FR : ne lit que les tables benelux_*.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;

    const company = await prisma.beneluxCompany.findUnique({
      where: { id },
      select: {
        id: true,
        nom: true,
        secteur: true,
        siteWeb: true,
        ville: true,
        notes: true,
        createdAt: true,
        contacts: {
          where: { excluded: false },
          orderBy: [{ principal: "desc" }, { prenom: "asc" }],
          select: {
            id: true,
            prenom: true,
            nom: true,
            email: true,
            poste: true,
            language: true,
            principal: true,
            source: true,
            perimetre: true,
            localisation: true,
            priorite: true,
            linkedinUrl: true,
            outreachExcluded: true,
            outreachTargets: {
              select: {
                id: true,
                status: true,
                cycleCount: true,
                lastSentAt: true,
                nextRecontactAt: true,
                lastRepliedAt: true,
              },
            },
          },
        },
        _count: { select: { contacts: true, outreachTargets: true } },
      },
    });

    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    return NextResponse.json({ company });
  } catch (error) {
    console.error("GET /api/benelux-outreach/companies/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
