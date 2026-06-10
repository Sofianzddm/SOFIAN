import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreateMarque, ensureMarqueContact } from "@/lib/marque-resolver";

/**
 * GET  → liste des clients du cycle Outreach (toutes files) + stats
 * POST → ajoute un nouveau client (marque + contact créés/résolus à la volée)
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim().toLowerCase());
}

export async function GET(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const targets = await prisma.outreachTarget.findMany({
      orderBy: [{ status: "asc" }, { nextRecontactAt: "asc" }, { createdAt: "desc" }],
      include: {
        touches: {
          orderBy: { cycleNumber: "desc" },
          take: 1,
          select: {
            id: true,
            cycleNumber: true,
            subject: true,
            sentAt: true,
            relanceSentAt: true,
            repliedAt: true,
            openCount: true,
            clickCount: true,
            sendError: true,
          },
        },
      },
    });

    return NextResponse.json({ targets });
  } catch (error) {
    console.error("GET /api/outreach/targets:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      marqueId?: string;
      marqueContactId?: string;
      company?: string;
      firstname?: string;
      lastname?: string;
      email?: string;
      poste?: string;
    };

    const email = (body.email || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    const existing = await prisma.outreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true, status: true },
    });
    if (existing) {
      return NextResponse.json(
        {
          error: `Ce contact est déjà suivi dans le cycle Outreach (${existing.company}).`,
        },
        { status: 409 }
      );
    }

    // Contact de cartographie existant (importé sans email) : on note son
    // email sur la fiche marque et il entre dans le cycle — pas de doublon.
    if (body.marqueContactId) {
      const contact = await prisma.marqueContact.findUnique({
        where: { id: body.marqueContactId },
        include: { marque: { select: { id: true, nom: true } } },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      }

      const updated = await prisma.marqueContact.update({
        where: { id: contact.id },
        data: { email },
        select: { id: true, prenom: true, nom: true },
      });

      const target = await prisma.outreachTarget.create({
        data: {
          marqueId: contact.marqueId,
          marqueContactId: updated.id,
          firstname: updated.prenom || updated.nom,
          lastname: updated.prenom ? updated.nom : null,
          email,
          company: contact.marque.nom,
          createdById: session.user.id,
        },
      });
      return NextResponse.json({ target }, { status: 201 });
    }

    const firstname = (body.firstname || "").trim();
    const lastname = (body.lastname || "").trim();
    const poste = (body.poste || "").trim();

    if (!firstname) {
      return NextResponse.json(
        { error: "Prénom et email sont obligatoires." },
        { status: 400 }
      );
    }

    // Marque existante sélectionnée dans l'autocomplete, ou résolution/création
    // par nom via le résolveur central (pas de doublon possible).
    let marqueId: string;
    let company: string;
    if (body.marqueId) {
      const marque = await prisma.marque.findUnique({
        where: { id: body.marqueId },
        select: { id: true, nom: true },
      });
      if (!marque) {
        return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
      }
      marqueId = marque.id;
      company = marque.nom;
    } else {
      company = (body.company || "").trim();
      if (!company) {
        return NextResponse.json(
          { error: "La marque est obligatoire." },
          { status: 400 }
        );
      }
      const resolved = await findOrCreateMarque({ name: company, source: "MANUAL" });
      marqueId = resolved.marqueId;
    }

    await ensureMarqueContact({
      marqueId,
      email,
      prenom: firstname,
      nom: lastname || firstname,
      poste: poste || null,
    });
    const marqueContact = await prisma.marqueContact.findFirst({
      where: { marqueId, email: { equals: email, mode: "insensitive" } },
      select: { id: true },
    });

    const target = await prisma.outreachTarget.create({
      data: {
        marqueId,
        marqueContactId: marqueContact?.id || null,
        firstname,
        lastname: lastname || null,
        email,
        company,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("POST /api/outreach/targets:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
