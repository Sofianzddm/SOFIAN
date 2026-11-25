import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  CANNES_PARTENAIRES_SLUG,
  canAccessCannesPartenaires,
} from "@/lib/cannes-partenaires/constants";
import { getOrCreateVillaProject } from "@/app/api/strategy/_utils";

/**
 * Boîte d'envoi du module Cannes Partenaires.
 * GET  → sender actuel + accounts Gmail visibles
 * PATCH → change senderEmail (ADMIN + STRATEGY_PLANNER)
 */
export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);
    const tokens = await prisma.gmailToken.findMany({
      orderBy: { createdAt: "asc" },
      select: {
        email: true,
        displayName: true,
        userId: true,
        user: { select: { prenom: true, nom: true, email: true } },
      },
    });

    const accounts = tokens.map((t) => ({
      email: t.email,
      label:
        t.displayName ||
        (t.user
          ? `${t.user.prenom} ${t.user.nom}`.trim()
          : t.email),
      userId: t.userId,
    }));

    return NextResponse.json({
      senderEmail: projet.senderEmail,
      accounts,
      connectPath: "/settings/gmail",
    });
  } catch (e) {
    console.error("GET /api/cannes-partenaires/sender:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessCannesPartenaires(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      senderEmail?: string | null;
    };
    const senderEmail = (body.senderEmail || "").trim().toLowerCase() || null;

    if (senderEmail) {
      const token = await prisma.gmailToken.findUnique({
        where: { email: senderEmail },
        select: { id: true },
      });
      if (!token) {
        return NextResponse.json(
          {
            error: `La boîte ${senderEmail} n'est pas connectée. Branche-la dans Réglages → Gmail.`,
          },
          { status: 400 }
        );
      }
    }

    const projet = await getOrCreateVillaProject(CANNES_PARTENAIRES_SLUG);
    const updated = await prisma.projetEvenement.update({
      where: { id: projet.id },
      data: { senderEmail },
      select: { id: true, slug: true, senderEmail: true },
    });

    return NextResponse.json({ projet: updated });
  } catch (e) {
    console.error("PATCH /api/cannes-partenaires/sender:", e);
    return NextResponse.json({ error: "Erreur" }, { status: 500 });
  }
}
