import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { syncOpportuniteContactsJson } from "@/lib/cannes-partenaires/commit-contacts";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Valide emails → table cannes_contacts uniquement (pas marque_contacts).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      opportuniteId?: string;
      marqueId?: string;
      contacts?: Array<{
        id?: string;
        email?: string;
        notFound?: boolean;
      }>;
    };

    let opportuniteId = String(body.opportuniteId || "").trim();
    const marqueId = String(body.marqueId || "").trim();
    const rows = Array.isArray(body.contacts) ? body.contacts : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Contacts requis" }, { status: 400 });
    }

    if (!opportuniteId && marqueId) {
      const opp = await prisma.opportuniteMarque.findFirst({
        where: { marqueId, projet: { slug: CANNES_PARTENAIRES_SLUG } },
        select: { id: true },
        orderBy: { updatedAt: "desc" },
      });
      opportuniteId = opp?.id || "";
    }
    if (!opportuniteId) {
      return NextResponse.json({ error: "opportuniteId requis" }, { status: 400 });
    }

    const opp = await prisma.opportuniteMarque.findFirst({
      where: { id: opportuniteId, projet: { slug: CANNES_PARTENAIRES_SLUG } },
      select: { id: true },
    });
    if (!opp) {
      return NextResponse.json({ error: "Opportunité introuvable" }, { status: 404 });
    }

    let saved = 0;
    let notFoundCount = 0;

    for (const row of rows) {
      const id = String(row.id || "").trim();
      if (!id) {
        return NextResponse.json({ error: "Contact invalide" }, { status: 400 });
      }

      const contact = await prisma.cannesPartenairesContact.findFirst({
        where: { id, opportuniteId },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json(
          { error: "Contact Cannes introuvable" },
          { status: 404 }
        );
      }

      if (row.notFound) {
        await prisma.cannesPartenairesContact.update({
          where: { id },
          data: {
            emailLookupStatus: "NOT_FOUND",
            emailSuggested: null,
            email: null,
          },
        });
        notFoundCount += 1;
        continue;
      }

      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { error: `Email invalide (${email || "vide"})` },
          { status: 400 }
        );
      }

      await prisma.cannesPartenairesContact.update({
        where: { id },
        data: {
          email,
          emailLookupStatus: "FOUND",
          emailSuggested: null,
          emailLookupQueuedAt: null,
        },
      });
      saved += 1;
    }

    await syncOpportuniteContactsJson(opportuniteId);

    return NextResponse.json({
      ok: true,
      saved,
      notFound: notFoundCount,
      enrolled: 0,
      fichePath: `/cannes-partenaires/crm/${opportuniteId}`,
      cannesOpportunite: { opportuniteId },
    });
  } catch (e) {
    console.error("[cannes] enrich-ready:", e);
    return NextResponse.json({ error: "Erreur enregistrement" }, { status: 500 });
  }
}
