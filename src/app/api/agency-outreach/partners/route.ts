import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET  → liste des agences partenaires + leurs contacts (pour le sélecteur
 *        d'ajout au cycle de prospection). Indique les contacts déjà suivis.
 * POST → crée un contact (AgencyContact) rattaché à une agence.
 *
 * Module isolé des marques : ne touche que partners / agency_contacts.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
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

    const partners = await prisma.partner.findMany({
      where: { isActive: true },
      orderBy: { name: "asc" },
      select: {
        id: true,
        name: true,
        slug: true,
        contactName: true,
        contactEmail: true,
        agencyContacts: {
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
          },
        },
      },
    });

    // Emails déjà dans le cycle → pour griser les contacts déjà suivis.
    const targets = await prisma.agencyOutreachTarget.findMany({
      select: { email: true },
    });
    const trackedEmails = targets.map((t) => t.email.toLowerCase());

    return NextResponse.json({ partners, trackedEmails });
  } catch (error) {
    console.error("GET /api/agency-outreach/partners:", error);
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

    const body = (await request.json().catch(() => ({}))) as {
      partnerId?: string;
      prenom?: string;
      nom?: string;
      email?: string;
      poste?: string;
      language?: string;
      principal?: boolean;
    };

    const partnerId = (body.partnerId || "").trim();
    const prenom = (body.prenom || "").trim();
    const nom = (body.nom || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const poste = (body.poste || "").trim();
    const language = body.language === "en" ? "en" : "fr";

    if (!partnerId) {
      return NextResponse.json({ error: "L'agence est obligatoire." }, { status: 400 });
    }
    if (!prenom) {
      return NextResponse.json({ error: "Le prénom est obligatoire." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    const partner = await prisma.partner.findUnique({
      where: { id: partnerId },
      select: { id: true },
    });
    if (!partner) {
      return NextResponse.json({ error: "Agence introuvable." }, { status: 404 });
    }

    const contact = await prisma.agencyContact.upsert({
      where: { partnerId_email: { partnerId, email } },
      update: {
        prenom,
        nom: nom || null,
        poste: poste || null,
        language,
        ...(body.principal === true ? { principal: true } : {}),
      },
      create: {
        partnerId,
        prenom,
        nom: nom || null,
        email,
        poste: poste || null,
        language,
        principal: body.principal === true,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("POST /api/agency-outreach/partners:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
