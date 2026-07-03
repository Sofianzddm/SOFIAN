// DELETE /api/talents/[id]/contrats/[contratId] — Supprimer un contrat en brouillon (+ PDF S3)
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { deleteFromS3 } from "@/lib/s3";
import { CONTRAT_TALENT_ROLES } from "@/lib/talent-contrats";

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; contratId: string }> }
) {
  try {
    const { id, contratId } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { role: string };
    if (!CONTRAT_TALENT_ROLES.includes(user.role)) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const contrat = await prisma.talentContrat.findUnique({
      where: { id: contratId },
    });
    if (!contrat || contrat.talentId !== id) {
      return NextResponse.json({ error: "Contrat non trouvé" }, { status: 404 });
    }
    if (contrat.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Seul un contrat en brouillon peut être supprimé" },
        { status: 400 }
      );
    }

    await prisma.talentContrat.delete({ where: { id: contratId } });
    await deleteFromS3(contrat.fichierUrl);

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur suppression contrat talent:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression du contrat" },
      { status: 500 }
    );
  }
}
