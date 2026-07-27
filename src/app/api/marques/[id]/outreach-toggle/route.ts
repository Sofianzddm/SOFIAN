import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  enrollInfluenceContacts,
  queueMarqueEnrichissement,
} from "@/lib/envoyer-marque-outreach";

/**
 * POST → bascule une marque en / hors Outreach depuis la fiche marque.
 *
 * body: { enabled: boolean }
 *  - enabled=true  (« Mettre en Outreach ») : lève l'exclusion des contacts,
 *    enrôle les contacts influence avec email dans « À contacter » et met les
 *    contacts sans email en file d'enrichissement.
 *  - enabled=false (« Retirer de l'Outreach ») : sort les contacts du cycle
 *    (suppression des OutreachTarget) et les marque `outreachExcluded` pour
 *    qu'ils ne réapparaissent ni en outreach ni en file d'enrichissement. Les
 *    contacts restent sur la fiche (CRM / pipeline talent).
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as { enabled?: boolean };
    const enabled = body.enabled === true;

    const marque = await prisma.marque.findUnique({
      where: { id },
      select: { id: true, nom: true },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
    }

    if (enabled) {
      // Mettre en Outreach : lève l'exclusion, enrôle (email) + met en file (sans email).
      await prisma.marqueContact.updateMany({
        where: { marqueId: marque.id, outreachExcluded: true },
        data: { outreachExcluded: false },
      });

      const enrolled = await enrollInfluenceContacts({
        marqueId: marque.id,
        company: marque.nom,
        createdById: session.user.id,
      });

      const queue = await queueMarqueEnrichissement({ marqueId: marque.id });
      const queued = queue.ok ? queue.queued : 0;

      const parts: string[] = [];
      if (enrolled > 0) parts.push(`${enrolled} dans « À contacter »`);
      if (queued > 0) parts.push(`${queued} à enrichir`);
      const message =
        parts.length > 0
          ? `${marque.nom} remis en Outreach — ${parts.join(" · ")}.`
          : `${marque.nom} remis en Outreach.`;

      return NextResponse.json({ ok: true, enabled: true, enrolled, queued, message });
    }

    // Retirer de l'Outreach : sort du cycle + exclut les contacts importés.
    const [removedTargets, excluded] = await prisma.$transaction([
      prisma.outreachTarget.deleteMany({ where: { marqueId: marque.id } }),
      prisma.marqueContact.updateMany({
        where: { marqueId: marque.id, source: { in: ["CARTO", "AO"] } },
        data: { outreachExcluded: true, emailLookupStatus: null, emailLookupQueuedAt: null },
      }),
    ]);

    return NextResponse.json({
      ok: true,
      enabled: false,
      removedTargets: removedTargets.count,
      excludedContacts: excluded.count,
      message: `${marque.nom} retiré de l'Outreach — contacts conservés sur la fiche.`,
    });
  } catch (error) {
    console.error("POST /api/marques/[id]/outreach-toggle:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
