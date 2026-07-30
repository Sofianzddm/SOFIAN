import { NextRequest, NextResponse } from "next/server";
import prisma from "@/lib/prisma";

const STATUTS_VALIDES = ["REFUSE", "SOUS_CONDITIONS", "OPTION", "CONFIRME"] as const;
type StatutConfirm = (typeof STATUTS_VALIDES)[number];

/** GET : l'offre affichée au talent (public, sans login). */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const conf = await prisma.talentConfirmation.findUnique({
      where: { token },
    });
    if (!conf) {
      return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    }

    // Suivi « vu » : on marque l'ouverture sauf en prévisualisation par l'équipe.
    const preview = request.nextUrl.searchParams.get("preview") === "1";
    if (!preview) {
      prisma.talentConfirmation
        .update({
          where: { id: conf.id },
          data: {
            openedAt: conf.openedAt ?? new Date(),
            openCount: { increment: 1 },
          },
        })
        .catch(() => {});
    }

    const talent = await prisma.talent.findUnique({
      where: { id: conf.talentId },
      select: { prenom: true, photo: true },
    });

    return NextResponse.json({
      talent: { prenom: talent?.prenom || "", photo: talent?.photo || null },
      marque: conf.marque,
      budgetNet: Number(conf.budgetNet),
      livrables: conf.livrables,
      dateTournage: conf.dateTournage,
      datePublication: conf.datePublication,
      villeDepart: conf.villeDepart,
      deplacement: conf.deplacement,
      droits: conf.droits,
      optionUntil: conf.optionUntil,
      checklist: conf.checklist,
      statut: conf.statut,
      decidedAt: conf.decidedAt,
      note: conf.note,
    });
  } catch (error) {
    console.error("Erreur GET confirmation publique:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

/** POST : la décision du talent. Notifie le créateur de la demande. */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await params;
    const conf = await prisma.talentConfirmation.findUnique({
      where: { token },
    });
    if (!conf) {
      return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      statut?: string;
      note?: string | null;
    };
    const statut = String(body.statut || "").toUpperCase() as StatutConfirm;
    if (!STATUTS_VALIDES.includes(statut)) {
      return NextResponse.json({ error: "Décision invalide" }, { status: 400 });
    }
    const note = statut === "SOUS_CONDITIONS" ? body.note?.trim() || null : null;

    const LABELS: Record<StatutConfirm, string> = {
      REFUSE: "❌ Refusé",
      SOUS_CONDITIONS: "🟡 Intéressé sous conditions",
      OPTION: "🔵 Option (date bloquée, non confirmée)",
      CONFIRME: "✅ Confirmé",
    };

    const decidedAt = new Date();

    // Preuve horodatée : on fige les termes exacts acceptés au moment du OUI.
    const checklist = (conf.checklist as Record<string, { value?: string }> | null) || null;
    const priseEnCharge = ["vhr_transport", "vhr_hebergement", "vhr_repas", "plus_un"]
      .filter((k) => checklist?.[k]?.value === "OUI");
    const confirmedSnapshot =
      statut === "CONFIRME"
        ? {
            confirmedAt: decidedAt.toISOString(),
            marque: conf.marque,
            budgetNet: Number(conf.budgetNet),
            budgetBrut: Number(conf.budgetBrut),
            commissionPercent: Number(conf.commissionPercent),
            livrables: conf.livrables,
            dateTournage: conf.dateTournage ? conf.dateTournage.toISOString() : null,
            datePublication: conf.datePublication ? conf.datePublication.toISOString() : null,
            villeDepart: conf.villeDepart,
            deplacement: conf.deplacement,
            droits: conf.droits,
            priseEnCharge,
          }
        : undefined;

    await prisma.$transaction(async (tx) => {
      await tx.talentConfirmation.update({
        where: { id: conf.id },
        data: { statut, note, decidedAt, confirmedSnapshot },
      });
      await tx.notification.create({
        data: {
          userId: conf.createdById,
          type: "GENERAL",
          titre: `Décision talent : ${LABELS[statut]}`,
          message:
            `Réponse à la confirmation « ${conf.marque} » : ${LABELS[statut]}` +
            (note ? ` — « ${note} »` : ""),
          lien: `/confirmations/${conf.id}`,
          talentId: conf.talentId,
        },
      });
    });

    return NextResponse.json({ ok: true, statut });
  } catch (error) {
    console.error("Erreur POST confirmation publique:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
