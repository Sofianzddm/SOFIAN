import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET → contacts importés depuis une cartographie (fichier Claude/Excel)
 * pas encore entrés dans le cycle outreach. Il suffit de noter leur email
 * dans /outreach pour les faire passer dans « À contacter ».
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const contacts = await prisma.marqueContact.findMany({
      where: {
        source: "CARTO",
        outreachTargets: { none: {} },
      },
      orderBy: [{ priorite: "asc" }, { createdAt: "asc" }],
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        poste: true,
        perimetre: true,
        localisation: true,
        priorite: true,
        linkedinUrl: true,
        marqueId: true,
        marque: { select: { nom: true } },
      },
    });

    return NextResponse.json({
      contacts: contacts.map((c) => ({
        id: c.id,
        prenom: c.prenom,
        nom: c.nom,
        email: c.email,
        poste: c.poste,
        perimetre: c.perimetre,
        localisation: c.localisation,
        priorite: c.priorite,
        linkedinUrl: c.linkedinUrl,
        marqueId: c.marqueId,
        company: c.marque.nom,
      })),
    });
  } catch (error) {
    console.error("GET /api/outreach/pending-contacts:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
