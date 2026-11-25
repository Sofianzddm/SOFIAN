import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { writeMarqueContactEmail } from "@/lib/marque-contact-email";
import { canAccessCannesPartenaires } from "@/lib/cannes-partenaires/constants";
import { enrollMarqueInCannesPartenaires } from "@/lib/cannes-partenaires/enroll";

const isValidEmail = (value: string) =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());

/**
 * Valide emails Cannes → CRM fiche (outreachExcluded conservé) + sync
 * OpportuniteMarque cannes-partenaires. JAMAIS d'enrôlement outreach FR.
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
      marqueId?: string;
      contacts?: Array<{
        id?: string;
        email?: string;
        notFound?: boolean;
      }>;
    };

    const marqueId = String(body.marqueId || "").trim();
    const rows = Array.isArray(body.contacts) ? body.contacts : [];
    if (!marqueId || rows.length === 0) {
      return NextResponse.json({ error: "Contacts requis" }, { status: 400 });
    }

    let saved = 0;
    let notFoundCount = 0;

    for (const row of rows) {
      const id = String(row.id || "").trim();
      if (!id) {
        return NextResponse.json({ error: "Contact invalide" }, { status: 400 });
      }

      const contact = await prisma.marqueContact.findFirst({
        where: { id, marqueId, outreachExcluded: true },
        select: { id: true },
      });
      if (!contact) {
        return NextResponse.json(
          { error: "Contact Cannes introuvable (isolation)" },
          { status: 404 }
        );
      }

      if (row.notFound) {
        await prisma.marqueContact.update({
          where: { id },
          data: {
            emailLookupStatus: "NOT_FOUND",
            emailSuggested: null,
            outreachExcluded: true,
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

      await writeMarqueContactEmail(id, marqueId, email, {
        keepOutreachExcluded: true,
      });
      saved += 1;
    }

    const enroll = await enrollMarqueInCannesPartenaires({
      marqueId,
      createdById: session.user.id,
      angleNote: "Enrichissement Cannes Partenaires",
    });

    return NextResponse.json({
      ok: true,
      saved,
      notFound: notFoundCount,
      enrolled: 0, // jamais outreach
      cannesOpportunite: enroll,
    });
  } catch (e) {
    console.error("[cannes] enrich-ready:", e);
    return NextResponse.json({ error: "Erreur enregistrement" }, { status: 500 });
  }
}
