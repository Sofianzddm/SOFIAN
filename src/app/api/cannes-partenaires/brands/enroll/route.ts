import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";
import { linkMarqueFromBrandName } from "@/lib/marque-resolver";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";

/**
 * Ajoute des marques issues de l'analyse Chat au pipeline Cannes
 * (OpportuniteMarque A_QUALIFIER) — sans créer de contacts CRM outreach.
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
      brands?: Array<{
        nom?: string;
        secteur?: string | null;
        priorite?: string | null;
        whyContact?: string | null;
        suggestedAngle?: string | null;
      }>;
    };

    const rows = Array.isArray(body.brands) ? body.brands : [];
    if (rows.length === 0) {
      return NextResponse.json({ error: "Aucune marque sélectionnée" }, { status: 400 });
    }

    const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);
    let created = 0;
    let skipped = 0;
    const opportuniteIds: string[] = [];

    for (const row of rows) {
      const nomMarque = String(row.nom || "").trim();
      if (!nomMarque) continue;

      const existing = await prisma.opportuniteMarque.findFirst({
        where: {
          projetId: projet.id,
          nomMarque: { equals: nomMarque, mode: "insensitive" },
        },
        select: { id: true },
      });
      if (existing) {
        skipped += 1;
        opportuniteIds.push(existing.id);
        continue;
      }

      let marqueId: string | null = null;
      try {
        const linked = await linkMarqueFromBrandName({
          brandName: nomMarque,
          source: "OPPORTUNITE_MARQUE",
        });
        marqueId = linked?.marqueId || null;
      } catch {
        marqueId = null;
      }

      const angleParts = [
        row.suggestedAngle?.trim() || null,
        row.whyContact?.trim() || null,
        row.priorite ? `Priorité ${row.priorite}` : null,
      ].filter(Boolean);

      const createdOpp = await prisma.opportuniteMarque.create({
        data: {
          projetId: projet.id,
          nomMarque,
          marqueId,
          secteur: row.secteur?.trim() || null,
          angleNote:
            angleParts.join(" · ") ||
            "Idée marques — analyse Chat Cannes Partenaires",
          typeActivation: "CANNES_PARTENARIAT",
          createdById: session.user.id,
          statut: "A_QUALIFIER",
          contacts: [],
          contactQualifie: false,
          talents: [],
        },
        select: { id: true },
      });
      created += 1;
      opportuniteIds.push(createdOpp.id);
    }

    return NextResponse.json({
      ok: true,
      created,
      skipped,
      opportuniteIds,
      pipelinePath: "/cannes-partenaires?tab=board",
    });
  } catch (e) {
    console.error("[cannes-partenaires/brands] enroll:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Erreur enroll" },
      { status: 500 }
    );
  }
}
