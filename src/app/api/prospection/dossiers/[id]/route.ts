import { NextRequest, NextResponse } from "next/server";
import { getAppSession, resolveProspectionActor } from "@/lib/getAppSession";
import {
  deleteDossierProspectionById,
  findDossierProspectionById,
} from "@/lib/prospectionDossiersDb";

export const dynamic = "force-dynamic";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;

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

    const dossier = await findDossierProspectionById(id);

    if (!dossier) {
      return NextResponse.json({ error: "Dossier introuvable" }, { status: 404 });
    }

    await deleteDossierProspectionById(id);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur DELETE /api/prospection/dossiers/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du dossier" },
      { status: 500 }
    );
  }
}
