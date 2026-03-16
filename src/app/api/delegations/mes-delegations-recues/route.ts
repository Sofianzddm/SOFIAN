import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { prisma } from "@/lib/prisma";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role?: string };
    if (user.role !== "TM" && user.role !== "HEAD_OF_INFLUENCE") {
      return NextResponse.json({ delegations: [] });
    }

    const delegations = await prisma.delegationTM.findMany({
      where: {
        tmRelaiId: user.id,
        actif: true,
      },
      include: {
        talent: {
          select: {
            id: true,
            prenom: true,
            nom: true,
            photo: true,
          },
        },
        tmOrigine: {
          select: {
            id: true,
            prenom: true,
            nom: true,
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return NextResponse.json({ delegations });
  } catch (error) {
    console.error("Erreur GET /api/delegations/mes-delegations-recues:", error);
    return NextResponse.json(
      { error: "Erreur lors du chargement des délégations" },
      { status: 500 }
    );
  }
}

