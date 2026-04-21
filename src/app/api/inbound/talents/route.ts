import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { verifyInboundAuth } from "@/lib/inbound-auth";

export async function GET(req: NextRequest) {
  try {
    if (!verifyInboundAuth(req)) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const talents = await prisma.talent.findMany({
      where: {
        isArchived: false,
      },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
      },
      orderBy: [{ prenom: "asc" }, { nom: "asc" }],
    });

    return NextResponse.json({
      talents: talents.map((t) => ({
        id: t.id,
        email: t.email,
        prenom: t.prenom,
        nom: t.nom,
      })),
    });
  } catch (error) {
    console.error("GET /api/inbound/talents error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
