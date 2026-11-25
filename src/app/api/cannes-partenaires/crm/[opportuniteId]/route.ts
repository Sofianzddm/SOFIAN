import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CANNES_OPP_STATUTS,
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { cannesContactWhere } from "@/lib/cannes-partenaires/contacts";

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ opportuniteId: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!canAccessCannesPartenaires(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }
    const hideEmails = role === "STRATEGY_PLANNER";

    const { opportuniteId } = await params;
    const opp = await prisma.opportuniteMarque.findFirst({
      where: {
        id: opportuniteId,
        projet: { slug: CANNES_PARTENAIRES_SLUG },
      },
      select: {
        id: true,
        nomMarque: true,
        marqueId: true,
        statut: true,
        secteur: true,
        angleNote: true,
        typeActivation: true,
        contactQualifie: true,
        lastEmailSentAt: true,
        lastEmailFrom: true,
        emailSubject: true,
        emailRepliedAt: true,
        relanceSentAt: true,
        emailOpenCount: true,
        updatedAt: true,
        createdAt: true,
        marque: {
          select: {
            id: true,
            nom: true,
            secteur: true,
            siteWeb: true,
            ville: true,
            contacts: {
              where: cannesContactWhere,
              orderBy: [{ priorite: "asc" }, { nom: "asc" }],
              select: {
                id: true,
                prenom: true,
                nom: true,
                email: true,
                poste: true,
                priorite: true,
                perimetre: true,
                localisation: true,
                linkedinUrl: true,
                emailLookupStatus: true,
              },
            },
          },
        },
      },
    });

    if (!opp) {
      return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
    }

    const contacts = (opp.marque?.contacts || []).map((c) => ({
      ...c,
      email: hideEmails && c.email ? "[masqué]" : c.email,
    }));

    return NextResponse.json({
      opportunite: {
        id: opp.id,
        nomMarque: opp.nomMarque,
        marqueId: opp.marqueId,
        statut: opp.statut,
        secteur: opp.secteur || opp.marque?.secteur || null,
        angleNote: opp.angleNote,
        typeActivation: opp.typeActivation,
        siteWeb: opp.marque?.siteWeb || null,
        ville: opp.marque?.ville || null,
        contactQualifie: opp.contactQualifie,
        lastEmailSentAt: opp.lastEmailSentAt,
        lastEmailFrom: opp.lastEmailFrom,
        emailSubject: opp.emailSubject,
        emailRepliedAt: opp.emailRepliedAt,
        relanceSentAt: opp.relanceSentAt,
        emailOpenCount: opp.emailOpenCount,
        updatedAt: opp.updatedAt,
        createdAt: opp.createdAt,
        contactsCount: contacts.length,
        emailsCount: contacts.filter((c) => c.email && c.email !== "[masqué]")
          .length,
        contacts,
      },
    });
  } catch (e) {
    console.error("GET /api/cannes-partenaires/crm/[id]:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ opportuniteId: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { opportuniteId } = await params;
    const existing = await prisma.opportuniteMarque.findFirst({
      where: {
        id: opportuniteId,
        projet: { slug: CANNES_PARTENAIRES_SLUG },
      },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Fiche introuvable" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      statut?: string;
      angleNote?: string | null;
    };

    const statut =
      body.statut &&
      CANNES_OPP_STATUTS.includes(
        body.statut as (typeof CANNES_OPP_STATUTS)[number]
      )
        ? body.statut
        : undefined;

    const updated = await prisma.opportuniteMarque.update({
      where: { id: opportuniteId },
      data: {
        statut,
        angleNote:
          body.angleNote === null
            ? null
            : body.angleNote?.trim() || undefined,
      },
    });

    return NextResponse.json({ opportunite: updated });
  } catch (e) {
    console.error("PATCH /api/cannes-partenaires/crm/[id]:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
