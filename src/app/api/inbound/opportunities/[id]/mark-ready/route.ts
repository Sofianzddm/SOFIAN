import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

const ALLOWED_ROLES = ["CASTING_MANAGER", "HEAD_OF_SALES", "ADMIN"] as const;

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(req);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Acces refuse" }, { status: 403 });
    }

    const { id } = await params;
    await prisma.inboundOpportunity.update({
      where: { id },
      data: {
        status: "READY",
        markedReadyAt: new Date(),
        markedReadyById: session.user.id,
      },
    });

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("POST /api/inbound/opportunities/[id]/mark-ready error:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
