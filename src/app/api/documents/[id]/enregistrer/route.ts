import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> | { id: string } }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const params = await Promise.resolve(context.params);
    const { id } = params;

    const document = await prisma.document.findUnique({ where: { id } });
    if (!document) {
      return NextResponse.json({ error: "Document non trouvé" }, { status: 404 });
    }
    if (document.statut !== "BROUILLON") {
      return NextResponse.json(
        { error: "Seul un document brouillon peut être enregistré" },
        { status: 400 }
      );
    }

    const user = session.user as { id: string };
    await prisma.document.update({
      where: { id },
      data: { statut: "VALIDE", dateValidation: new Date() },
    });
    await prisma.documentEvent.create({
      data: {
        documentId: id,
        type: "REGISTERED",
        description: "Enregistrement",
        userId: user.id,
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Erreur enregistrement document:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'enregistrement" },
      { status: 500 }
    );
  }
}
