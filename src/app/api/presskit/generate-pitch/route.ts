import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateAndSavePitch } from "@/lib/presskit-pitch";

/**
 * POST /api/presskit/generate-pitch
 * Génère une phrase de pitch IA pour un talent d'une marque et la sauvegarde dans PressKitTalent.pitch
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ message: "Non autorisé" }, { status: 401 });
    }

    const user = session.user as { role?: string };
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_SALES", "HEAD_OF_INFLUENCE"].includes(user.role || "")) {
      return NextResponse.json(
        { message: "Accès réservé" },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { brandId, talentId } = body;

    if (!brandId || !talentId) {
      return NextResponse.json(
        { message: "brandId et talentId requis" },
        { status: 400 }
      );
    }

    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { message: "OPENAI_API_KEY non configurée" },
        { status: 500 }
      );
    }

    const pitch = await generateAndSavePitch(brandId, talentId, apiKey);
    return NextResponse.json({ pitch });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erreur inconnue";
    if (message.includes("introuvable")) {
      return NextResponse.json({ message }, { status: 404 });
    }
    console.error("❌ Erreur generate-pitch:", error);
    return NextResponse.json(
      { message: "Erreur lors de la génération du pitch" },
      { status: 500 }
    );
  }
}
