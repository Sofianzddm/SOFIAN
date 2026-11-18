import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { MARQUE_PORTFOLIO_ROLES } from "@/lib/marque-portfolio";

/**
 * GET — Leyna (HoS) + Joey (BD) pour l’attribution de portefeuille.
 * Visible par tous les rôles CRM (lecture + écriture).
 */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = session.user.role as string | undefined;
    const allowed = [
      "ADMIN",
      "HEAD_OF",
      "HEAD_OF_SALES",
      "HEAD_OF_INFLUENCE",
      "BUSINESS_DEVELOPER",
      "TM",
      "CM",
      "STRATEGY_PLANNER",
      "CASTING_MANAGER",
    ];
    if (!role || !allowed.includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const owners = await prisma.user.findMany({
      where: {
        actif: true,
        role: { in: [...MARQUE_PORTFOLIO_ROLES] },
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        role: true,
      },
      orderBy: [{ role: "asc" }, { prenom: "asc" }],
    });

    return NextResponse.json({ owners });
  } catch (error) {
    console.error("GET portfolio-owners:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
