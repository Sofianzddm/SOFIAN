// DELETE /api/signatures/[id] — Supprimer un brouillon
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { SIGNATURE_DOCUMENT_ROLES } from "@/lib/signature-documents";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const user = session.user as { role: string };
    if (!SIGNATURE_DOCUMENT_ROLES.includes(user.role as (typeof SIGNATURE_DOCUMENT_ROLES)[number])) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const document = await prisma.signatureDocument.findUnique({
      where: { id },
    });
    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }
    if (document.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Seuls les brouillons peuvent être supprimés" },
        { status: 400 }
      );
    }

    await prisma.signatureDocument.delete({ where: { id } });
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/signatures/[id]:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression" },
      { status: 500 }
    );
  }
}
