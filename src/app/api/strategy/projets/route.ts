import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy, getOrCreateVillaProject } from "../_utils";

/**
 * Configuration d'un projet strategy (Villa Cannes, Ski Trip, ...).
 *  GET   ?projetSlug=… → infos projet dont la boîte d'envoi (senderEmail)
 *  PATCH { projetSlug, senderEmail } → change la boîte d'envoi (ADMIN only)
 */

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessStrategy(session.user.role || "")) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const projetSlug = (request.nextUrl.searchParams.get("projetSlug") || "villa-cannes").trim();
    const projet = await getOrCreateVillaProject(projetSlug);

    return NextResponse.json({
      projet: {
        id: projet.id,
        nom: projet.nom,
        slug: projet.slug,
        dateDebut: projet.dateDebut,
        dateFin: projet.dateFin,
        senderEmail: projet.senderEmail,
      },
    });
  } catch (error) {
    console.error("GET /api/strategy/projets:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Réservé à l'admin" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      projetSlug?: string;
      senderEmail?: string | null;
    };
    const projetSlug = (body.projetSlug || "").trim();
    if (!projetSlug) {
      return NextResponse.json({ error: "projetSlug requis." }, { status: 400 });
    }

    const senderEmail = (body.senderEmail || "").trim().toLowerCase() || null;
    if (senderEmail) {
      const token = await prisma.gmailToken.findUnique({
        where: { email: senderEmail },
        select: { id: true },
      });
      if (!token) {
        return NextResponse.json(
          {
            error: `La boîte ${senderEmail} n'est pas connectée. Connecte-la d'abord dans Réglages → Gmail.`,
          },
          { status: 400 }
        );
      }
    }

    const projet = await getOrCreateVillaProject(projetSlug);
    const updated = await prisma.projetEvenement.update({
      where: { id: projet.id },
      data: { senderEmail },
      select: { id: true, slug: true, senderEmail: true },
    });

    return NextResponse.json({ projet: updated });
  } catch (error) {
    console.error("PATCH /api/strategy/projets:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
