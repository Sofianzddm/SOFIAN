import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { cannesContactWhere } from "@/lib/cannes-partenaires/contacts";
import { projetOppMailContacts } from "@/lib/projet-prospection";

/**
 * Contacts email pour le composer Cannes (ADMIN + STRATEGY_PLANNER).
 * Nécessaire car GET opportunités masque les emails au STRATEGY_PLANNER.
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const opp = await prisma.opportuniteMarque.findFirst({
      where: { id, projet: { slug: CANNES_PARTENAIRES_SLUG } },
      select: {
        id: true,
        nomMarque: true,
        marqueId: true,
        contacts: true,
        statut: true,
      },
    });
    if (!opp) {
      return NextResponse.json({ error: "Opportunité introuvable" }, { status: 404 });
    }

    let contacts = projetOppMailContacts(opp.contacts);

    // Complète depuis la fiche marque (contacts carto Cannes) si l'opp est vide
    if (contacts.length === 0 && opp.marqueId) {
      const crm = await prisma.marqueContact.findMany({
        where: {
          marqueId: opp.marqueId,
          ...cannesContactWhere,
          email: { not: null },
        },
        select: { id: true, prenom: true, nom: true, email: true, poste: true },
      });
      contacts = crm
        .filter((c) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test((c.email || "").trim()))
        .map((c) => ({
          firstName: (c.prenom || "").trim(),
          lastName: (c.nom || "").trim(),
          email: (c.email as string).trim().toLowerCase(),
          role: (c.poste || "").trim(),
        }));
    }

    return NextResponse.json({
      opportuniteId: opp.id,
      nomMarque: opp.nomMarque,
      marqueId: opp.marqueId,
      statut: opp.statut,
      contacts,
    });
  } catch (e) {
    console.error("[cannes] mail-contacts:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
