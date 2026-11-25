import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  getOrCreateVillaProject,
  sanitizeOpportuniteForRole,
} from "@/app/api/strategy/_utils";
import { linkMarqueFromBrandName } from "@/lib/marque-resolver";
import {
  CANNES_OPP_STATUTS,
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user.role || "") as string;
    if (!canAccessCannesPartenaires(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const contactedOnly = searchParams.get("contacted") === "1";

    const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);

    const opportunites = await prisma.opportuniteMarque.findMany({
      where: {
        projetId: projet.id,
        ...(contactedOnly
          ? {
              statut: {
                in: ["CONTACTEE", "EN_NEGO", "SIGNEE", "PERDUE"],
              },
            }
          : {}),
      },
      orderBy: [{ lastEmailSentAt: "desc" }, { updatedAt: "desc" }],
      include: {
        marque: { select: { id: true, nom: true } },
      },
    });

    return NextResponse.json({
      projet: {
        id: projet.id,
        slug: projet.slug,
        nom: projet.nom,
        senderEmail: projet.senderEmail,
      },
      opportunites: opportunites.map((o) => sanitizeOpportuniteForRole(role, o)),
    });
  } catch (error) {
    console.error("GET /api/cannes-partenaires/opportunites:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des opportunités" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = (session.user.role || "") as string;
    if (!canAccessCannesPartenaires(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      nomMarque?: string;
      marqueId?: string;
      secteur?: string;
      angleNote?: string;
      statut?: string;
    };

    const statut = CANNES_OPP_STATUTS.includes(
      (body.statut || "") as (typeof CANNES_OPP_STATUTS)[number]
    )
      ? (body.statut as string)
      : "A_QUALIFIER";

    const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);

    let nomMarque = (body.nomMarque || "").trim();
    let marqueId: string | null = null;
    let contactsOpportunite: Array<{
      firstName: string;
      lastName: string;
      email: string;
      role: string;
    }> = [];
    let secteur = body.secteur?.trim() || null;

    if (body.marqueId) {
      const marque = await prisma.marque.findUnique({
        where: { id: body.marqueId },
        select: {
          id: true,
          nom: true,
          secteur: true,
          contacts: {
            select: { prenom: true, nom: true, email: true, poste: true },
          },
        },
      });
      if (!marque) {
        return NextResponse.json({ error: "Marque introuvable" }, { status: 404 });
      }
      const deja = await prisma.opportuniteMarque.findFirst({
        where: { projetId: projet.id, marqueId: marque.id },
        select: { id: true },
      });
      if (deja) {
        return NextResponse.json(
          { error: `${marque.nom} est déjà dans Cannes Partenaires.` },
          { status: 409 }
        );
      }
      marqueId = marque.id;
      nomMarque = nomMarque || marque.nom;
      secteur = secteur || marque.secteur;
      contactsOpportunite = marque.contacts
        .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((c.email || "").trim()))
        .map((c) => ({
          firstName: (c.prenom || "").trim(),
          lastName: (c.nom || "").trim(),
          email: (c.email as string).trim().toLowerCase(),
          role: (c.poste || "").trim(),
        }));
    } else {
      if (!nomMarque) {
        return NextResponse.json({ error: "nomMarque est requis" }, { status: 400 });
      }
      const linked = await linkMarqueFromBrandName({
        brandName: nomMarque,
        source: "OPPORTUNITE_MARQUE",
        createDefaults: { secteur },
      });
      marqueId = linked?.marqueId ?? null;
    }

    const opportunite = await prisma.opportuniteMarque.create({
      data: {
        projetId: projet.id,
        nomMarque,
        marqueId,
        secteur,
        angleNote: body.angleNote?.trim() || null,
        typeActivation: "CANNES_PARTENARIAT",
        createdById: session.user.id,
        statut:
          statut === "A_QUALIFIER" && contactsOpportunite.length > 0
            ? "IDENTIFIEE"
            : statut,
        contacts: contactsOpportunite,
        contactQualifie: contactsOpportunite.length > 0,
        talents: [],
      },
    });

    return NextResponse.json(
      {
        opportunite: sanitizeOpportuniteForRole(role, opportunite),
        contactsCopies: contactsOpportunite.length,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/cannes-partenaires/opportunites:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création de l'opportunité" },
      { status: 500 }
    );
  }
}
