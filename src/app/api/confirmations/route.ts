import { NextRequest, NextResponse } from "next/server";
import { randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function computeNet(brut: number, commissionPercent: number) {
  return Math.round(brut * (1 - commissionPercent / 100));
}

/** GET : liste des demandes de confirmation. */
export async function GET() {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const confs = await prisma.talentConfirmation.findMany({
      orderBy: { createdAt: "desc" },
    });

    const talentIds = [...new Set(confs.map((c) => c.talentId))];
    const talents = await prisma.talent.findMany({
      where: { id: { in: talentIds } },
      select: { id: true, prenom: true, nom: true, photo: true },
    });
    const talentMap = new Map(talents.map((t) => [t.id, t]));

    return NextResponse.json(
      confs.map((c) => ({
        id: c.id,
        marque: c.marque,
        budgetNet: Number(c.budgetNet),
        statut: c.statut,
        decidedAt: c.decidedAt,
        sentAt: c.sentAt,
        createdAt: c.createdAt,
        talent: talentMap.get(c.talentId) || null,
      }))
    );
  } catch (error) {
    console.error("Erreur GET confirmations:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST : créer une demande + générer le lien. */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const body = await request.json();
    const talentId = String(body.talentId || "").trim();
    const marque = String(body.marque || "").trim();
    if (!talentId || !marque) {
      return NextResponse.json(
        { error: "Talent et marque obligatoires" },
        { status: 400 }
      );
    }

    const budgetBrut = Number(body.budgetBrut) || 0;
    const commissionPercent =
      body.commissionPercent != null && body.commissionPercent !== ""
        ? Number(body.commissionPercent)
        : 20;

    const conf = await prisma.talentConfirmation.create({
      data: {
        token: randomBytes(24).toString("hex"),
        talentId,
        createdById: session.user.id,
        marque,
        budgetBrut,
        commissionPercent,
        budgetNet: computeNet(budgetBrut, commissionPercent),
        livrables: body.livrables?.trim() || null,
        dateTournage: body.dateTournage ? new Date(body.dateTournage) : null,
        datePublication: body.datePublication ? new Date(body.datePublication) : null,
        villeDepart: body.villeDepart?.trim() || null,
        deplacement: body.deplacement?.trim() || null,
        droits: body.droits?.trim() || null,
        optionUntil: body.optionUntil ? new Date(body.optionUntil) : null,
        checklist: body.checklist ?? undefined,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ id: conf.id }, { status: 201 });
  } catch (error) {
    console.error("Erreur POST confirmations:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
