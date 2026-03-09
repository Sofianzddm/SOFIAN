import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * POST /api/talents/tarifs/marquer-tous-revus
 * Met à jour la date updatedAt de tous les enregistrements TalentTarifs à maintenant.
 * Remet à zéro le suivi "30 jours" : les talents avec tarifs ne seront plus en "à revoir".
 * Réservé à HEAD_OF_INFLUENCE et ADMIN.
 */
export async function POST() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role;
    if (role !== "ADMIN" && role !== "HEAD_OF_INFLUENCE") {
      return NextResponse.json(
        { error: "Seuls les admin et Head of Influence peuvent effectuer cette action" },
        { status: 403 }
      );
    }

    // Mettre à jour updatedAt de tous les talent_tarifs (remet le suivi 30j à zéro)
    const result = await prisma.$executeRaw(
      Prisma.sql`UPDATE talent_tarifs SET "updatedAt" = NOW()`
    );

    return NextResponse.json({
      ok: true,
      message: "Tous les tarifs ont été marqués comme revus. Le suivi 30 jours est remis à zéro.",
      count: typeof result === "number" ? result : undefined,
    });
  } catch (error) {
    console.error("marquer-tous-revus:", error);
    return NextResponse.json(
      { error: "Erreur lors du marquage des tarifs" },
      { status: 500 }
    );
  }
}
