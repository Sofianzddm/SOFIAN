import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// POST - Marquer une négociation comme vue (HEAD_OF)
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    // Vérifier que c'est un HEAD_OF ou ADMIN
    if (!["HEAD_OF", "ADMIN"].includes(session.user.role || "")) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
    }

    const { id } = await params;

    // Mettre à jour la négociation
    await prisma.negociation.update({
      where: { id },
      data: {
        modifiedSinceReview: false,
        reviewedAt: new Date(),
      },
    });

    return NextResponse.json({ 
      success: true,
      message: "Négociation marquée comme vue" 
    });
  } catch (error) {
    console.error("Erreur POST marquer-vu:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage" },
      { status: 500 }
    );
  }
}
