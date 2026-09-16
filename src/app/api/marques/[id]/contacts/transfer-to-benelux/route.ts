import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  generateUniqueBeneluxSlug,
  slugifyBenelux,
} from "@/lib/benelux-company";

/**
 * POST /api/marques/[id]/contacts/transfer-to-benelux
 * Body: { contactId: string }
 *
 * Bascule un contact CRM France → fiche BENELUX (crée le contact BE,
 * lie les entreprises, déplace le cycle outreach s'il existe).
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

    const { id: marqueId } = await params;
    const body = (await request.json().catch(() => ({}))) as { contactId?: string };
    if (!body.contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    const marque = await prisma.marque.findUnique({
      where: { id: marqueId },
      select: { id: true, nom: true, secteur: true, siteWeb: true, ville: true },
    });
    if (!marque) {
      return NextResponse.json({ error: "Marque introuvable." }, { status: 404 });
    }

    const contact = await prisma.marqueContact.findFirst({
      where: { id: body.contactId, marqueId },
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
        diffusionOptOut: true,
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
    const note = `Contact basculé depuis CRM France le ${new Intl.DateTimeFormat("fr-FR", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(now)}.`;

    // 1. Entreprise BENELUX liée (ou créée)
    let company =
      (await prisma.beneluxCompany.findFirst({
        where: { linkedMarqueId: marque.id },
        select: { id: true, nom: true },
      })) ||
      (await prisma.beneluxCompany.findFirst({
        where: { nom: { equals: marque.nom, mode: "insensitive" } },
        select: { id: true, nom: true },
      }));

    if (!company) {
      const slug = await generateUniqueBeneluxSlug(slugifyBenelux(marque.nom));
      company = await prisma.beneluxCompany.create({
        data: {
          nom: marque.nom,
          slug,
          secteur: marque.secteur,
          siteWeb: marque.siteWeb,
          ville: marque.ville,
          linkedMarqueId: marque.id,
          notes: note,
          createdById: session.user.id,
        },
        select: { id: true, nom: true },
      });
    } else {
      await prisma.beneluxCompany.update({
        where: { id: company.id },
        data: { linkedMarqueId: marque.id },
      });
    }

    // 2. Contact BENELUX
    let beContact = await prisma.beneluxContact.findUnique({
      where: { companyId_email: { companyId: company.id, email } },
      select: { id: true },
    });
    if (!beContact) {
      beContact = await prisma.beneluxContact.create({
        data: {
          companyId: company.id,
          prenom: (contact.prenom || contact.nom || "Contact").trim(),
          nom: contact.prenom ? contact.nom : contact.nom || null,
          email,
          poste: contact.poste,
          language: contact.language === "en" ? "en" : "fr",
          principal: contact.principal,
          source: contact.source === "CARTO" ? "CARTO" : "MANUAL",
          perimetre: contact.perimetre,
          localisation: contact.localisation,
          priorite: contact.priorite,
          linkedinUrl: contact.linkedinUrl,
          outreachExcluded: contact.outreachExcluded || contact.diffusionOptOut,
          excluded: contact.outreachExcluded || contact.diffusionOptOut,
          createdById: session.user.id,
        },
        select: { id: true },
      });
    }

    // 3. Cycle outreach FR → BE si présent
    const frTarget = contact.outreachTargets[0];
    let outreachMoved = false;
    if (frTarget && !contact.diffusionOptOut) {
      const existingBe = await prisma.beneluxOutreachTarget.findUnique({
        where: { email },
        select: { id: true },
      });
      const status = frTarget.status === "STOPPED" ? "STOPPED" : frTarget.status;
      const migrationNote = `Basculé contact CRM France → BENELUX le ${new Intl.DateTimeFormat(
        "fr-FR",
        { day: "numeric", month: "long", year: "numeric" }
      ).format(now)}.`;

      if (existingBe) {
        await prisma.beneluxOutreachTarget.update({
          where: { id: existingBe.id },
          data: {
            companyId: company.id,
            beneluxContactId: beContact.id,
            companyName: company.nom,
            status,
            fromEmail: frTarget.fromEmail,
            cycleCount: frTarget.cycleCount,
            lastSentAt: frTarget.lastSentAt,
            nextRecontactAt: frTarget.nextRecontactAt,
            lastRepliedAt: frTarget.lastRepliedAt,
            stoppedAt: status === "STOPPED" ? now : null,
            stoppedById: status === "STOPPED" ? session.user.id : null,
            autoRescheduleReason: migrationNote,
            autoRescheduledAt: now,
          },
        });
      } else {
        await prisma.beneluxOutreachTarget.create({
          data: {
            companyId: company.id,
            beneluxContactId: beContact.id,
            firstname: frTarget.firstname,
            lastname: frTarget.lastname,
            email,
            companyName: company.nom,
            language: frTarget.language === "en" ? "en" : "fr",
            status,
            fromEmail: frTarget.fromEmail,
            cycleCount: frTarget.cycleCount,
            lastSentAt: frTarget.lastSentAt,
            nextRecontactAt: frTarget.nextRecontactAt,
            lastRepliedAt: frTarget.lastRepliedAt,
            stoppedAt: status === "STOPPED" ? now : null,
            stoppedById: status === "STOPPED" ? session.user.id : null,
            autoRescheduleReason: migrationNote,
            autoRescheduledAt: now,
            createdById: session.user.id,
          },
        });
      }

      await prisma.outreachTarget.update({
        where: { id: frTarget.id },
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
      companyId: company.id,
      beneluxContactId: beContact.id,
      outreachMoved,
      targetPath: `/marques/benelux/${company.id}`,
      message: outreachMoved
        ? `${fullName} est sur la fiche BENELUX (cycle outreach déplacé).`
        : `${fullName} est maintenant contact sur la fiche BENELUX.`,
    });
  } catch (error) {
    console.error("POST .../contacts/transfer-to-benelux:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
