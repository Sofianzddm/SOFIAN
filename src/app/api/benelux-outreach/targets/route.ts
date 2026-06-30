import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreateBeneluxCompany } from "@/lib/benelux-company";

/**
 * GET  → liste des prospects BENELUX du cycle (toutes files)
 * POST → ajoute un prospect au cycle. Trois modes :
 *   - { beneluxContactId } : contact carto existant (on note son email)
 *   - { companyId, firstname, ... } : entreprise BENELUX existante
 *   - { company, firstname, ... }   : entreprise résolue/créée par nom
 *
 * Module 100 % isolé du CRM FR : aucune écriture sur Marque / MarqueContact.
 * Le payload GET aligne ses clés sur l'outreach FR (marqueId = companyId,
 * company = companyName) pour rester « drop-in » dans la page /outreach.
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

    const rows = await prisma.beneluxOutreachTarget.findMany({
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

    const targets = rows.map(({ companyId, companyName, ...t }) => ({
      ...t,
      marqueId: companyId,
      company: companyName,
      hubspotContactId: null,
      hubspotSyncedAt: null,
    }));

    return NextResponse.json({ targets });
  } catch (error) {
    console.error("GET /api/benelux-outreach/targets:", error);
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
      beneluxContactId?: string;
      companyId?: string;
      // Alias envoyés par la page /outreach (échange de préfixe d'API) :
      // marqueId = id entreprise BENELUX, marqueContactId = id contact BENELUX.
      marqueId?: string;
      marqueContactId?: string;
      company?: string;
      firstname?: string;
      lastname?: string;
      email?: string;
      poste?: string;
      fromEmail?: string;
      language?: string;
    };

    const beneluxContactId = body.beneluxContactId || body.marqueContactId;
    const companyIdInput = body.companyId || body.marqueId;

    const email = (body.email || "").trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    const language = body.language === "en" ? "en" : "fr";

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

    const existing = await prisma.beneluxOutreachTarget.findUnique({
      where: { email },
      select: { id: true, companyName: true },
    });
    if (existing) {
      return NextResponse.json(
        { error: `Ce contact est déjà suivi dans le cycle BENELUX (${existing.companyName}).` },
        { status: 409 }
      );
    }

    // Mode 1 : contact carto existant (importé sans email).
    if (beneluxContactId) {
      const contact = await prisma.beneluxContact.findUnique({
        where: { id: beneluxContactId },
        include: { company: { select: { id: true, nom: true } } },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      }

      const updated = await prisma.beneluxContact.update({
        where: { id: contact.id },
        data: { email },
        select: { id: true, prenom: true, nom: true },
      });

      const contactLanguage =
        body.language === "en" || body.language === "fr"
          ? language
          : contact.language === "en"
          ? "en"
          : "fr";

      const target = await prisma.beneluxOutreachTarget.create({
        data: {
          companyId: contact.companyId,
          beneluxContactId: updated.id,
          firstname: updated.prenom || updated.nom || "Contact",
          lastname: updated.prenom ? updated.nom : null,
          email,
          companyName: contact.company.nom,
          language: contactLanguage,
          fromEmail,
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

    // Entreprise existante (id) ou résolue/créée par nom.
    let companyId: string;
    let companyName: string;
    if (companyIdInput) {
      const company = await prisma.beneluxCompany.findUnique({
        where: { id: companyIdInput },
        select: { id: true, nom: true },
      });
      if (!company) {
        return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
      }
      companyId = company.id;
      companyName = company.nom;
    } else {
      companyName = (body.company || "").trim();
      if (!companyName) {
        return NextResponse.json(
          { error: "L'entreprise est obligatoire." },
          { status: 400 }
        );
      }
      const resolved = await findOrCreateBeneluxCompany(companyName, session.user.id);
      companyId = resolved.id;
      companyName = resolved.nom;
    }

    // Crée (ou récupère) le contact, dédoublonné par (companyId, email).
    const contact = await prisma.beneluxContact.upsert({
      where: { companyId_email: { companyId, email } },
      update: {
        prenom: firstname,
        nom: lastname || null,
        poste: poste || null,
        language,
      },
      create: {
        companyId,
        prenom: firstname,
        nom: lastname || null,
        email,
        poste: poste || null,
        language,
        source: "MANUAL",
        createdById: session.user.id,
      },
    });

    const target = await prisma.beneluxOutreachTarget.create({
      data: {
        companyId,
        beneluxContactId: contact.id,
        firstname,
        lastname: lastname || null,
        email,
        companyName,
        language,
        fromEmail,
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ target }, { status: 201 });
  } catch (error) {
    console.error("POST /api/benelux-outreach/targets:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
