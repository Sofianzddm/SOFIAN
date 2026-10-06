import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { resolveAwaitingEnrichissementForMarque } from "@/lib/resolve-awaiting-enrichissement";

/**
 * POST — débloque manuellement toutes les demandes d'enrichissement d'une marque.
 * Body: { marqueId: string, force?: boolean }
 */
const ALLOWED = ["ADMIN", "CASTING_MANAGER", "HEAD_OF", "HEAD_OF_SALES"] as const;

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED.includes((session.user.role || "") as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      marqueId?: string;
      force?: boolean;
    };
    const marqueId = String(body.marqueId || "").trim();
    if (!marqueId) {
      return NextResponse.json({ error: "marqueId requis." }, { status: 400 });
    }

    const result = await resolveAwaitingEnrichissementForMarque({
      marqueId,
      actorId: session.user.id,
      force: Boolean(body.force),
    });

    if (result.resolvedCount === 0 && !body.force) {
      return NextResponse.json(
        {
          error:
            result.emailableCount < 2
              ? `Il faut au moins 2 emails utilisables sur la fiche (actuellement ${result.emailableCount}).`
              : "Aucune demande en attente pour cette marque.",
          emailableCount: result.emailableCount,
        },
        { status: 400 }
      );
    }

    return NextResponse.json({
      ok: true,
      ...result,
      message:
        result.resolvedCount > 0
          ? `${result.resolvedCount} demande(s) débloquée(s) — ${result.sourceLabel}.`
          : "Rien à débloquer.",
    });
  } catch (error) {
    console.error("POST /api/enrichissement/awaiting-marques/resolve:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
