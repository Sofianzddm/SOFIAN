import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateMarque } from "@/lib/marque-resolver";
import { normalizeMissionBrandKey } from "@/lib/contact-missions";

/**
 * POST /api/gifts/enrich-marque
 * Crée (ou réutilise) une fiche marque, la lie éventuellement à une demande gift,
 * et la met en file « Marques en attente d'enrichissement ».
 *
 * Body: { nom: string, talentId?: string, giftId?: string, secteur?: string, siteWeb?: string }
 */
const ALLOWED = ["TM", "CM", "ADMIN", "HEAD_OF_INFLUENCE", "HEAD_OF"] as const;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as { id: string; role?: string; name?: string | null; email?: string | null };
    if (!ALLOWED.includes((user.role || "") as (typeof ALLOWED)[number])) {
      return NextResponse.json({ error: "Accès refusé" }, { status: 403 });
    }

    const body = (await req.json().catch(() => ({}))) as {
      nom?: string;
      talentId?: string;
      giftId?: string;
      secteur?: string;
      siteWeb?: string;
    };

    const nom = String(body.nom || "").trim();
    if (!nom) {
      return NextResponse.json({ error: "Nom de marque requis" }, { status: 400 });
    }

    const talentId = String(body.talentId || "").trim() || null;
    const giftId = String(body.giftId || "").trim() || null;

    let gift: {
      id: string;
      reference: string;
      talentId: string;
      talent: { prenom: string; nom: string };
    } | null = null;

    if (giftId) {
      gift = await prisma.demandeGift.findUnique({
        where: { id: giftId },
        select: {
          id: true,
          reference: true,
          talentId: true,
          talent: { select: { prenom: true, nom: true } },
        },
      });
      if (!gift) {
        return NextResponse.json({ error: "Demande introuvable" }, { status: 404 });
      }
    }

    const resolvedTalentId = gift?.talentId || talentId;
    let talentName = gift
      ? `${gift.talent.prenom} ${gift.talent.nom}`.trim()
      : "Gift";

    if (resolvedTalentId && !gift) {
      const talent = await prisma.talent.findUnique({
        where: { id: resolvedTalentId },
        select: { prenom: true, nom: true },
      });
      if (!talent) {
        return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
      }
      talentName = `${talent.prenom} ${talent.nom}`.trim();
    }

    const resolved = await findOrCreateMarque({
      name: nom,
      source: "DEMANDE_GIFT",
      createDefaults: {
        secteur: body.secteur || null,
        siteWeb: body.siteWeb || null,
      },
    });

    const marque = await prisma.marque.findUnique({
      where: { id: resolved.marqueId },
      select: {
        id: true,
        nom: true,
        contacts: {
          where: { outreachExcluded: false, diffusionOptOut: false },
          select: { email: true, emailSuggested: true },
        },
      },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable après création" }, { status: 500 });
    }

    if (gift) {
      await prisma.$transaction([
        prisma.demandeGift.update({
          where: { id: gift.id },
          data: { marqueId: marque.id },
        }),
        prisma.demandeGiftMarque.upsert({
          where: {
            demandeGiftId_marqueId: {
              demandeGiftId: gift.id,
              marqueId: marque.id,
            },
          },
          create: {
            demandeGiftId: gift.id,
            marqueId: marque.id,
          },
          update: {},
        }),
      ]);
    }

    const giftLabel = gift?.reference ? `Gift ${gift.reference}` : "Demande Gift";
    const strategyReason = `${giftLabel} — contacts CRM à compléter`;

    // Mission déjà en file pour cette marque (évite les doublons) ?
    const existingAwaiting = await prisma.contactMission.findFirst({
      where: {
        marqueId: marque.id,
        awaitingContactsCompletion: true,
        status: { not: "CANCELLED" },
      },
      select: { id: true },
      orderBy: { contactsCompletionRequestedAt: "desc" },
    });

    let missionId = existingAwaiting?.id || null;
    let alreadyQueued = Boolean(existingAwaiting);

    if (!existingAwaiting) {
      const mission = await prisma.contactMission.create({
        data: {
          talentId: resolvedTalentId,
          creatorName: talentName || "Gift",
          targetBrand: marque.nom,
          targetBrandKey: normalizeMissionBrandKey(marque.nom),
          marqueId: marque.id,
          strategyReason,
          awaitingContactsCompletion: true,
          contactsCompletionRequestedAt: new Date(),
          createdById: user.id,
        },
        select: { id: true },
      });
      missionId = mission.id;
    } else {
      await prisma.contactMission.update({
        where: { id: existingAwaiting.id },
        data: {
          contactsCompletionRequestedAt: new Date(),
          strategyReason,
          ...(resolvedTalentId ? { talentId: resolvedTalentId } : {}),
        },
      });
    }

    const requestedByName =
      user.name?.trim() || user.email || "Quelqu’un";
    const enrichLien = "/enrichissement?tab=attente";

    const notifyUsers = await prisma.user.findMany({
      where: {
        actif: true,
        role: { in: ["ADMIN", "CASTING_MANAGER"] },
      },
      select: { id: true },
    });

    await Promise.all(
      notifyUsers.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            type: "GENERAL",
            titre: `Enrichir ${marque.nom}`,
            message: `${requestedByName} a mis ${marque.nom} en attente d'enrichissement (${giftLabel}${
              talentName ? ` · ${talentName}` : ""
            }).`,
            lien: enrichLien,
          },
        })
      )
    );

    const emailableCount = marque.contacts.filter((c) => {
      const email = (c.email || c.emailSuggested || "").trim();
      return email.includes("@");
    }).length;

    return NextResponse.json({
      ok: true,
      marque: { id: marque.id, nom: marque.nom },
      created: resolved.created,
      missionId,
      alreadyQueued,
      emailableCount,
      enrichPath: enrichLien,
      message: alreadyQueued
        ? `${marque.nom} est déjà en file d'enrichissement.`
        : `${marque.nom} ajoutée et envoyée en enrichissement.`,
    });
  } catch (error) {
    console.error("POST /api/gifts/enrich-marque:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
