import { NextRequest, NextResponse } from "next/server";
import { getAppSession, resolveProspectionActor } from "@/lib/getAppSession";
import {
  createDossierProspection,
  listDossiersProspection,
} from "@/lib/prospectionDossiersDb";

export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const actor = await resolveProspectionActor(session);
    const globalView =
      actor.role === "ADMIN" || actor.role === "HEAD_OF_INFLUENCE";

    if (!globalView) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const dossiers = await listDossiersProspection(globalView, actor.userId);

    return NextResponse.json({
      dossiers: dossiers.map((d) => ({
        id: d.id,
        nom: d.nom,
        fichierCount: d.fichierCount,
        userId: d.userId,
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/prospection/dossiers:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des dossiers" },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const actor = await resolveProspectionActor(session);
    if (actor.role !== "ADMIN" && actor.role !== "HEAD_OF_INFLUENCE") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json();
    const nom = typeof body.nom === "string" ? body.nom.trim() : "";
    if (!nom) {
      return NextResponse.json({ error: "Nom du dossier requis" }, { status: 400 });
    }

    const dossier = await createDossierProspection(nom, actor.userId);

    return NextResponse.json(
      {
        id: dossier.id,
        nom: dossier.nom,
        fichierCount: 0,
        userId: dossier.userId,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error("Erreur POST /api/prospection/dossiers:", error);
    return NextResponse.json(
      { error: "Erreur lors de la création du dossier" },
      { status: 500 }
    );
  }
}
