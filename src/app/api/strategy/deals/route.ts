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
      where: { projetId: projet.id },
      include: {
        talent: { select: { id: true, prenom: true, nom: true, photo: true } },
      },
    });
    const talentMap = new Map(
      participants.map((p) => [
        p.talentId,
        {
          id: p.talentId,
          name: `${p.talent.prenom} ${p.talent.nom}`,
          photo: p.talent.photo,
        },
      ])
    );

    const deals = await prisma.opportuniteMarque.findMany({
      where: { projetId: projet.id, statut: "SIGNEE" },
      orderBy: { updatedAt: "desc" },
    });

    return NextResponse.json({
      deals: deals.map((d) => {
        const safe = sanitizeOpportuniteForRole(role, d);
        const talentIds = Array.isArray(d.talents) ? (d.talents as string[]) : [];
        return {
          ...safe,
          talentsLabel: talentIds.map((id) => talentMap.get(id)?.name || id),
          talentsMeta: talentIds.map((id) => {
            const t = talentMap.get(id);
            return t || { id, name: id, photo: null };
          }),
        };
      }),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/deals:", error);
    return NextResponse.json({ error: "Erreur lors du chargement des deals" }, { status: 500 });
  }
}
