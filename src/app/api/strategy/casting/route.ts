import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy, getOrCreateVillaProject } from "@/app/api/strategy/_utils";

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
        talent: {
          include: {
            stats: {
              select: { igFollowers: true, igEngagement: true },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    const opportunites = await prisma.opportuniteMarque.findMany({
      where: { projetId: projet.id },
      select: { nomMarque: true, talents: true },
    });

    const matchesByTalent = new Map<string, string[]>();
    for (const opp of opportunites) {
      const ids = Array.isArray(opp.talents) ? (opp.talents as string[]) : [];
      for (const id of ids) {
        const curr = matchesByTalent.get(id) ?? [];
        curr.push(opp.nomMarque);
        matchesByTalent.set(id, curr);
      }
    }

    return NextResponse.json({
      projet,
      participants: participants.map((p) => ({
        ...p,
        talent: {
          id: p.talent.id,
          prenom: p.talent.prenom,
          nom: p.talent.nom,
          avatar: p.talent.photo,
          niche: p.talent.niches?.[0] || null,
          handle: p.talent.instagram || null,
          abonnes: p.talent.stats?.igFollowers ?? null,
          engagement: p.talent.stats?.igEngagement ?? null,
        },
        marquesMatchees: matchesByTalent.get(p.talentId) ?? [],
      })),
    });
  } catch (error) {
    console.error("Erreur GET /api/strategy/casting:", error);
    return NextResponse.json({ error: "Erreur lors du chargement du casting" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    const role = (session.user.role || "") as string;
    if (!canAccessStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json()) as {
      projetId?: string;
      projetSlug?: string;
      talentId?: string;
      statut?: string;
      dateArrivee?: string | null;
      dateDepart?: string | null;
    };

    const talentId = (body.talentId || "").trim();
    if (!talentId) {
      return NextResponse.json({ error: "talentId requis" }, { status: 400 });
    }

    let projetId = (body.projetId || "").trim();
    if (!projetId) {
      const projet = await getOrCreateVillaProject((body.projetSlug || "villa-cannes").trim());
      projetId = projet.id;
    }

    const participant = await prisma.participantVilla.create({
      data: {
        projetId,
        talentId,
        statut: body.statut?.trim() || "PRESSENTI",
        dateArrivee: body.dateArrivee ? new Date(body.dateArrivee) : null,
        dateDepart: body.dateDepart ? new Date(body.dateDepart) : null,
      },
    });

    return NextResponse.json({ participant }, { status: 201 });
  } catch (error) {
    console.error("Erreur POST /api/strategy/casting:", error);
    return NextResponse.json({ error: "Erreur lors de la creation du participant" }, { status: 500 });
  }
}
