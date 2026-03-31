import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canAccessStrategy,
  getOrCreateVillaProject,
  sanitizeOpportuniteForRole,
} from "@/app/api/strategy/_utils";

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const projetSlug = (searchParams.get("projetSlug") || "villa-cannes").trim();
    const projet = await getOrCreateVillaProject(projetSlug);

    const participants = await prisma.participantVilla.findMany({
      where: { projetId: projet.id, statut: "CONFIRME" },
      include: {
        talent: {
          select: { id: true, prenom: true, nom: true, niches: true, photo: true },
        },
      },
      orderBy: { createdAt: "asc" },
    });

    const signed = await prisma.opportuniteMarque.findMany({
      where: { projetId: projet.id, statut: "SIGNEE", dateActivation: { not: null } },
      orderBy: { dateActivation: "asc" },
    });

    return NextResponse.json({
      projet,
      participants,
      opportunitesSignees: signed.map((o) => sanitizeOpportuniteForRole(role, o)),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/planning:", error);
    return NextResponse.json({ error: "Erreur lors du chargement du planning" }, { status: 500 });
  }
}
