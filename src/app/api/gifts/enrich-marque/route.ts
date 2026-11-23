import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { findOrCreateMarque } from "@/lib/marque-resolver";
import { ensureGiftMarqueInAwaitingEnrichissement } from "@/lib/resolve-awaiting-enrichissement";

/**
 * POST /api/gifts/enrich-marque
 * Crée (ou réutilise) une fiche marque, la lie éventuellement à une demande gift,
 * et la met en file « Marques en attente d'enrichissement ».
 *
 * Body: { nom: string, talentId?: string, giftId?: string, secteur?: string, siteWeb?: string }
 */
const ALLOWED = [
  "TM",
  "CM",
  "ADMIN",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF",
  "ASSISTANTE_TM",
] as const;

export async function POST(req: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const user = session.user as {
      id: string;
      role?: string;
      name?: string | null;
      email?: string | null;
    };
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
      select: { id: true, nom: true },
    });
    if (!marque) {
      return NextResponse.json(
        { error: "Marque introuvable après création" },
        { status: 500 }
      );
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

    // Clic « Enrichir » : toujours signaler, même si 2+ emails (contrôle CRM).
    const ensured = await ensureGiftMarqueInAwaitingEnrichissement({
      marqueId: marque.id,
      giftReference: gift?.reference || null,
      talentId: resolvedTalentId,
      talentName,
      createdById: user.id,
      onlyIfNeedsContacts: false,
    });

    const lookupQueued = ensured.lookupQueued;
    const alreadyQueued = !ensured.created && !ensured.skipped;
    const requestedByName = user.name?.trim() || user.email || "Quelqu’un";
    const enrichLien =
      lookupQueued > 0 ? "/enrichissement" : "/enrichissement?tab=attente";

    const notifyUsers = await prisma.user.findMany({
      where: {
        actif: true,
        role: { in: ["ADMIN", "CASTING_MANAGER"] },
      },
      select: { id: true },
    });

    const notifyDetail =
      lookupQueued > 0
        ? `${lookupQueued} email${lookupQueued > 1 ? "s" : ""} à trouver`
        : "compléter la fiche CRM";

    await Promise.all(
      notifyUsers.map((u) =>
        prisma.notification.create({
          data: {
            userId: u.id,
            type: "GENERAL",
            titre: `Enrichir ${marque.nom}`,
            message: `${requestedByName} a mis ${marque.nom} en enrichissement (${giftLabel}${
              talentName ? ` · ${talentName}` : ""
            } — ${notifyDetail}).`,
            lien: enrichLien,
          },
        })
      )
    );

    const baseMsg = alreadyQueued
      ? `${marque.nom} est déjà signalée en attente`
      : `${marque.nom} ajoutée et envoyée en enrichissement`;
    const queueMsg =
      lookupQueued > 0
        ? ` — ${lookupQueued} email${lookupQueued > 1 ? "s" : ""} à trouver dans la file`
        : " — complète la fiche CRM (Marques en attente)";

    return NextResponse.json({
      ok: true,
      marque: { id: marque.id, nom: marque.nom },
      created: resolved.created,
      missionId: ensured.missionId,
      alreadyQueued,
      lookupQueued,
      emailableCount: ensured.emailableCount,
      enrichPath: enrichLien,
      message: `${baseMsg}${queueMsg}.`,
    });
  } catch (error) {
    console.error("POST /api/gifts/enrich-marque:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
