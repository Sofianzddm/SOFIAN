import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { generateAndSavePitch } from "@/lib/presskit-pitch";

/**
 * POST /api/presskit/generate-all-pitches
 * Génère les pitches pour tous les talents du press kit d'une marque (en parallèle)
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
    const { brandId } = body;

    if (!brandId) {
      return NextResponse.json(
        { message: "brandId requis" },
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

    const pressKitTalents = await prisma.pressKitTalent.findMany({
      where: { brandId },
      orderBy: { order: "asc" },
      select: { talentId: true },
    });

    if (pressKitTalents.length === 0) {
      return NextResponse.json({
        success: true,
        pitches: [],
        message: "Aucun talent dans ce press kit",
      });
    }

    const results = await Promise.allSettled(
      pressKitTalents.map((pkt) =>
        generateAndSavePitch(brandId, pkt.talentId, apiKey)
      )
    );

    const pitches = results.map((r) =>
      r.status === "fulfilled" ? r.value : ""
    );

    return NextResponse.json({
      success: true,
      pitches,
    });
  } catch (error) {
    console.error("❌ Erreur generate-all-pitches:", error);
    return NextResponse.json(
      { message: "Erreur lors de la génération des pitches" },
      { status: 500 }
    );
  }
}

