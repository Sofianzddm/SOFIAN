import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";

function computeNet(brut: number, commissionPercent: number) {
  return Math.round(brut * (1 - commissionPercent / 100));
}

/** GET : détail d'une demande de confirmation. */
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;
    const conf = await prisma.talentConfirmation.findUnique({ where: { id } });
    if (!conf) {
      return NextResponse.json({ error: "Non trouvée" }, { status: 404 });
    }
    const talent = await prisma.talent.findUnique({
      where: { id: conf.talentId },
      select: { id: true, prenom: true, nom: true, photo: true },
    });
    return NextResponse.json({
      ...conf,
      budgetBrut: Number(conf.budgetBrut),
      commissionPercent: Number(conf.commissionPercent),
      budgetNet: Number(conf.budgetNet),
      talent,
    });
  } catch (error) {
    console.error("Erreur GET confirmation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** PATCH : mettre à jour l'offre (recalcule le net, rafraîchit sentAt). */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }
    const { id } = await params;
    const existing = await prisma.talentConfirmation.findUnique({ where: { id } });
    if (!existing) {
      return NextResponse.json({ error: "Non trouvée" }, { status: 404 });
    }

    const body = await request.json();
    const budgetBrut =
      body.budgetBrut != null && body.budgetBrut !== ""
        ? Number(body.budgetBrut)
        : Number(existing.budgetBrut);
    const commissionPercent =
      body.commissionPercent != null && body.commissionPercent !== ""
        ? Number(body.commissionPercent)
        : Number(existing.commissionPercent);

    const updated = await prisma.talentConfirmation.update({
      where: { id },
      data: {
        marque: body.marque?.trim() || existing.marque,
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
        checklist: body.checklist ?? existing.checklist ?? undefined,
        sentAt: new Date(),
      },
    });

    return NextResponse.json({ id: updated.id });
  } catch (error) {
    console.error("Erreur PATCH confirmation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
