import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findOrCreateMarque } from "@/lib/marque-resolver";

/**
 * POST /api/benelux-outreach/companies/[id]/contacts/transfer-to-fr
 * Body: { contactId: string }
 *
 * Bascule un contact BENELUX → fiche CRM France.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function isValidEmail(v: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: companyId } = await params;
    const body = (await request.json().catch(() => ({}))) as { contactId?: string };
    if (!body.contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    const company = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: {
        id: true,
        nom: true,
        secteur: true,
        siteWeb: true,
        ville: true,
        linkedMarqueId: true,
      },
    });
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    const contact = await prisma.beneluxContact.findFirst({
      where: { id: body.contactId, companyId },
      select: {
        id: true,
        prenom: true,
        nom: true,
        email: true,
        poste: true,
        language: true,
        principal: true,
        source: true,
        perimetre: true,
        localisation: true,
        priorite: true,
        linkedinUrl: true,
        outreachExcluded: true,
        outreachTargets: {
          select: {
            id: true,
            status: true,
            nextRecontactAt: true,
            cycleCount: true,
            fromEmail: true,
            lastSentAt: true,
            lastRepliedAt: true,
            firstname: true,
            lastname: true,
            language: true,
          },
          take: 1,
        },
      },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    const email = contact.email?.trim().toLowerCase() || null;
    if (!email || !isValidEmail(email)) {
      return NextResponse.json(
        { error: "Le contact doit avoir un email valide pour être basculé." },
        { status: 400 }
      );
    }

    const now = new Date();

    let marqueId = company.linkedMarqueId;
    if (!marqueId) {
      const resolved = await findOrCreateMarque({
        name: company.nom,
        source: "MANUAL",
        createDefaults: {
          secteur: company.secteur,
          siteWeb: company.siteWeb,
          ville: company.ville,
          pays: "Belgique",
        },
      });
      marqueId = resolved.marqueId;
      await prisma.beneluxCompany.update({
        where: { id: company.id },
        data: { linkedMarqueId: marqueId },
      });
    }

    let frContact = await prisma.marqueContact.findFirst({
      where: {
        marqueId,
        email: { equals: email, mode: "insensitive" },
      },
      select: { id: true },
    });
    if (!frContact) {
      frContact = await prisma.marqueContact.create({
        data: {
          marqueId,
          prenom: contact.prenom || null,
          nom: (contact.nom || contact.prenom || "Contact").trim(),
          email,
          poste: contact.poste,
          language: contact.language === "en" ? "en" : "fr",
          principal: contact.principal,
          source: contact.source === "CARTO" ? "CARTO" : null,
          perimetre: contact.perimetre,
          localisation: contact.localisation,
          priorite: contact.priorite,
          linkedinUrl: contact.linkedinUrl,
          outreachExcluded: contact.outreachExcluded,
        },
        select: { id: true },
      });
    }

    const beTarget = contact.outreachTargets[0];
    let outreachMoved = false;
    if (beTarget && !contact.outreachExcluded) {
      const existingFr = await prisma.outreachTarget.findUnique({
        where: { email },
        select: { id: true },
      });
      const status = beTarget.status === "STOPPED" ? "STOPPED" : beTarget.status;
      const migrationNote = `Basculé contact BENELUX → CRM France le ${new Intl.DateTimeFormat(
        "fr-FR",
        { day: "numeric", month: "long", year: "numeric" }
      ).format(now)}.`;

      if (existingFr) {
        await prisma.outreachTarget.update({
          where: { id: existingFr.id },
          data: {
            marqueId,
            marqueContactId: frContact.id,
            company: company.nom,
            status,
            fromEmail: beTarget.fromEmail,
            cycleCount: beTarget.cycleCount,
            lastSentAt: beTarget.lastSentAt,
            nextRecontactAt: beTarget.nextRecontactAt,
            lastRepliedAt: beTarget.lastRepliedAt,
            stoppedAt: status === "STOPPED" ? now : null,
            stoppedById: status === "STOPPED" ? session.user.id : null,
            autoRescheduleReason: migrationNote,
            autoRescheduledAt: now,
          },
        });
      } else {
        await prisma.outreachTarget.create({
          data: {
            marqueId,
            marqueContactId: frContact.id,
            firstname: beTarget.firstname,
            lastname: beTarget.lastname,
            email,
            company: company.nom,
            language: beTarget.language === "en" ? "en" : "fr",
            status,
            fromEmail: beTarget.fromEmail,
            cycleCount: beTarget.cycleCount,
            lastSentAt: beTarget.lastSentAt,
            nextRecontactAt: beTarget.nextRecontactAt,
            lastRepliedAt: beTarget.lastRepliedAt,
            stoppedAt: status === "STOPPED" ? now : null,
            stoppedById: status === "STOPPED" ? session.user.id : null,
            autoRescheduleReason: migrationNote,
            autoRescheduledAt: now,
            createdById: session.user.id,
          },
        });
      }

      await prisma.beneluxOutreachTarget.update({
        where: { id: beTarget.id },
        data: {
          status: "STOPPED",
          stoppedAt: now,
          stoppedById: session.user.id,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
        },
      });
      outreachMoved = true;
    }

    const fullName = [contact.prenom, contact.nom].filter(Boolean).join(" ") || email;
    return NextResponse.json({
      ok: true,
      marqueId,
      marqueContactId: frContact.id,
      outreachMoved,
      targetPath: `/marques/${marqueId}`,
      message: outreachMoved
        ? `${fullName} est sur la fiche France (cycle outreach déplacé).`
        : `${fullName} est maintenant contact sur la fiche France.`,
    });
  } catch (error) {
    console.error("POST .../contacts/transfer-to-fr:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
