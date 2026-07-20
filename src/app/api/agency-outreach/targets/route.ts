import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreatePartnerByName } from "@/lib/agency-partner";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";

/**
 * GET  → liste des contacts d'agences du cycle Prospection Agences (toutes files)
 * POST → ajoute un contact au cycle. Deux modes :
 *   - { agencyContactId }                : à partir d'un contact agence existant
 *   - { partnerId, prenom, nom?, email, poste?, language? } : crée le contact
 *     agence (AgencyContact) puis l'ajoute au cycle.
 *
 * Module 100 % isolé des marques : aucune écriture sur Marque / MarqueContact.
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

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

    // Filtre par marché (FR par défaut). Le toggle FR/BENELUX de la page envoie
    // toujours ?market=…, mais on tolère l'absence pour rétro-compatibilité.
    const marketParam = (request.nextUrl.searchParams.get("market") || "").toUpperCase();
    const market = marketParam === "BENELUX" ? "BENELUX" : marketParam === "FR" ? "FR" : null;

    const rows = await prisma.agencyOutreachTarget.findMany({
      where: market ? { market } : undefined,
      orderBy: [{ status: "asc" }, { nextRecontactAt: "asc" }, { createdAt: "desc" }],
      include: {
        partner: { select: { name: true, slug: true } },
        touches: {
          orderBy: { cycleNumber: "desc" },
          take: 1,
          select: {
            id: true,
            cycleNumber: true,
            subject: true,
            sentAt: true,
            relanceSentAt: true,
            relanceCancelledAt: true,
            repliedAt: true,
            openCount: true,
            openedAt: true,
            lastOpenAt: true,
            clickCount: true,
            clickedAt: true,
            lastClickAt: true,
            sendError: true,
          },
        },
      },
    });

    // On expose toujours le nom + le lien LIVE de /partners (et on resynchronise
    // le snapshot company / partnerSlug en base si l'agence a été modifiée depuis
    // l'ajout au cycle), pour que la liste et l'aperçu du token {{agence.lien}}
    // reflètent exactement la fiche /partners.
    const stale: { id: string; name: string; slug: string }[] = [];
    const targets = rows.map(({ partner, ...t }) => {
      const liveName = partner?.name ?? t.company;
      const liveSlug = partner?.slug ?? t.partnerSlug;
      if (partner && (t.company !== liveName || t.partnerSlug !== liveSlug)) {
        stale.push({ id: t.id, name: liveName, slug: liveSlug ?? "" });
      }
      return { ...t, company: liveName, partnerSlug: liveSlug };
    });

    if (stale.length > 0) {
      await Promise.all(
        stale.map((s) =>
          prisma.agencyOutreachTarget
            .update({
              where: { id: s.id },
              data: { company: s.name, partnerSlug: s.slug },
            })
            .catch(() => null)
        )
      );
    }

    return NextResponse.json({ targets });
  } catch (error) {
    console.error("GET /api/agency-outreach/targets:", error);
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
      agencyContactId?: string;
      partnerId?: string;
      partnerName?: string;
      prenom?: string;
      nom?: string;
      email?: string;
      poste?: string;
      fromEmail?: string;
      language?: string;
      market?: string;
    };

    const language = body.language === "en" ? "en" : "fr";
    const market = (body.market || "").toUpperCase() === "BENELUX" ? "BENELUX" : "FR";

    // Boîte expéditrice du cycle (optionnel, défaut Leyna) : réservé à l'ADMIN.
    let fromEmail: string | null = null;
    const rawFromEmail =
      session.user.role === "ADMIN" ? (body.fromEmail || "").trim().toLowerCase() : "";
    if (rawFromEmail) {
      const senderToken = await prisma.gmailToken.findUnique({
        where: { email: rawFromEmail },
        select: { id: true },
      });
      if (!senderToken) {
        return NextResponse.json(
          { error: `La boîte ${rawFromEmail} n'est pas connectée à la plateforme.` },
          { status: 400 }
        );
      }
      fromEmail = rawFromEmail;
    }

    // Mode 1 : contact agence existant.
    if (body.agencyContactId) {
      const contact = await prisma.agencyContact.findUnique({
        where: { id: body.agencyContactId },
        include: { partner: { select: { id: true, name: true, slug: true } } },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact agence introuvable." }, { status: 404 });
      }
      if (!contact.email || !isValidEmail(contact.email)) {
        return NextResponse.json(
          { error: "Ce contact n'a pas d'email valide." },
          { status: 400 }
        );
      }

      const existing = await prisma.agencyOutreachTarget.findUnique({
        where: { email: contact.email.toLowerCase() },
        select: { id: true, company: true },
      });
      if (existing) {
        return NextResponse.json(
          { error: `Ce contact est déjà suivi (${existing.company}).` },
          { status: 409 }
        );
      }

      // Anti double-prospection : jamais le même email dans deux pipelines.
      const conflict = await findCrossPipelineConflict(
        contact.email.toLowerCase(),
        "agency"
      );
      if (conflict) {
        return NextResponse.json(
          {
            error: `Ce contact est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
          },
          { status: 409 }
        );
      }

      const target = await prisma.agencyOutreachTarget.create({
        data: {
          partnerId: contact.partnerId,
          agencyContactId: contact.id,
          firstname: contact.prenom,
          lastname: contact.nom,
          email: contact.email.toLowerCase(),
          company: contact.partner.name,
          partnerSlug: contact.partner.slug,
          language: contact.language === "en" ? "en" : language,
          market,
          fromEmail,
          createdById: session.user.id,
        },
      });
      return NextResponse.json({ target }, { status: 201 });
    }

    // Mode 2 : création d'un contact agence + ajout au cycle.
    // L'agence est désignée soit par son id (sélection), soit par son nom
    // (champ libre) → réutilisée ou créée à la volée dans /partners.
    const partnerId = (body.partnerId || "").trim();
    const partnerName = (body.partnerName || "").trim();
    const prenom = (body.prenom || "").trim();
    const nom = (body.nom || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    const poste = (body.poste || "").trim();

    if (!partnerId && !partnerName) {
      return NextResponse.json({ error: "L'agence est obligatoire." }, { status: 400 });
    }
    if (!prenom) {
      return NextResponse.json({ error: "Le prénom est obligatoire." }, { status: 400 });
    }
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    let partner: { id: string; name: string; slug: string } | null = null;
    if (partnerId) {
      partner = await prisma.partner.findUnique({
        where: { id: partnerId },
        select: { id: true, name: true, slug: true },
      });
      if (!partner) {
        return NextResponse.json({ error: "Agence introuvable." }, { status: 404 });
      }
    } else {
      partner = await findOrCreatePartnerByName(partnerName, session.user.id);
    }

    const existing = await prisma.agencyOutreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Ce contact est déjà suivi (${existing.company}).` },
        { status: 409 }
      );
    }

    // Anti double-prospection : jamais le même email dans deux pipelines.
    const conflict = await findCrossPipelineConflict(email, "agency");
    if (conflict) {
      return NextResponse.json(
        {
          error: `Ce contact est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
        },
        { status: 409 }
      );
    }

    // Crée (ou récupère) le contact agence, dédoublonné par (partnerId, email).
    const contact = await prisma.agencyContact.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      update: {
        prenom,
        nom: nom || null,
        poste: poste || null,
        language,
      },
      create: {
        partnerId: partner.id,
        prenom,
        nom: nom || null,
        email,
        poste: poste || null,
        language,
        createdById: session.user.id,
      },
    });

    const target = await prisma.agencyOutreachTarget.create({
      data: {
        partnerId: partner.id,
        agencyContactId: contact.id,
        firstname: prenom,
        lastname: nom || null,
        email,
        company: partner.name,
        partnerSlug: partner.slug,
        language,
        market,
        fromEmail,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("POST /api/agency-outreach/targets:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
