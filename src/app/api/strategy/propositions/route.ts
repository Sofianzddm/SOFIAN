import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { randomUUID } from "crypto";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy, getOrCreateVillaProject } from "@/app/api/strategy/_utils";

/**
 * Propositions de partenariat partageables d'un projet strategy.
 *  GET  ?projetSlug=… → liste des propositions du projet
 *  POST { projetSlug, nomMarque, … }   → crée une proposition (lien public)
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const projetSlug = (request.nextUrl.searchParams.get("projetSlug") || "villa-cannes").trim();

    const proposals = await prisma.partnershipProposal.findMany({
      where: { projetSlug },
      orderBy: { createdAt: "desc" },
    });

    // Agrégat des sessions de consultation (temps passé, nb d'ouvertures, dernière visite).
    const ids = proposals.map((p) => p.id);
    const stats = ids.length
      ? await prisma.partnershipProposalView.groupBy({
          by: ["proposalId"],
          where: { proposalId: { in: ids } },
          _sum: { durationSec: true },
          _max: { durationSec: true, lastSeenAt: true },
          _count: { _all: true },
        })
      : [];
    const statById = new Map(stats.map((s) => [s.proposalId, s]));

    return NextResponse.json({
      proposals: proposals.map((p) => {
        const s = statById.get(p.id);
        const sessions = s?._count?._all ?? 0;
        const totalTimeSec = s?._sum?.durationSec ?? 0;
        return {
          ...p,
          publicUrl: `/proposition/${p.publicToken}`,
          insights: {
            sessions,
            totalTimeSec,
            avgTimeSec: sessions > 0 ? Math.round(totalTimeSec / sessions) : 0,
            maxTimeSec: s?._max?.durationSec ?? 0,
            lastSeenAt: s?._max?.lastSeenAt ?? p.lastViewedAt ?? null,
          },
        };
      }),
    });
  } catch (error) {
    console.error("GET /api/strategy/propositions:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      projetSlug?: string;
      nomMarque?: string;
      marqueId?: string | null;
      title?: string;
    };

    const projetSlug = (body.projetSlug || "villa-cannes").trim() || "villa-cannes";
    const nomMarque = (body.nomMarque || "").trim();
    if (!nomMarque) {
      return NextResponse.json({ error: "Nom de la marque requis." }, { status: 400 });
    }

    const projet = await getOrCreateVillaProject(projetSlug);

    const proposal = await prisma.partnershipProposal.create({
      data: {
        projetId: projet.id,
        projetSlug,
        publicToken: randomUUID(),
        nomMarque,
        marqueId: (body.marqueId || "").trim() || null,
        title: (body.title || "").trim() || `${projet.nom} × ${nomMarque}`,
        subtitle: projet.nom,
        casting: [] as Prisma.InputJsonValue,
        budgetLines: [] as Prisma.InputJsonValue,
        budgetGroups: [] as Prisma.InputJsonValue,
        deliverables: [] as Prisma.InputJsonValue,
        photos: [] as Prisma.InputJsonValue,
        createdById: session.user.id,
      },
    });

    return NextResponse.json(
      { proposal: { ...proposal, publicUrl: `/proposition/${proposal.publicToken}` } },
      { status: 201 }
    );
  } catch (error) {
    console.error("POST /api/strategy/propositions:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
