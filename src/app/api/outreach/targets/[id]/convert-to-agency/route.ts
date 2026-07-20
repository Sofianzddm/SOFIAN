import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  slugifyPartner,
  generateUniquePartnerSlug,
} from "@/lib/agency-partner";

/**
 * POST /api/outreach/targets/[id]/convert-to-agency
 *
 * Correction d'erreur de classement : un contact d'Outreach Clients est en
 * réalité une agence → on stoppe le target client (trace conservée) et le
 * contact entre en Prospection Agences, rattaché à une agence existante
 * (partnerId) ou créée à la volée (agencyName + market). Le statut et le
 * compteur de recontact sont conservés.
 *
 * Body : { partnerId?: string; agencyName?: string; market?: "FR" | "BENELUX" }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      partnerId?: string;
      agencyName?: string;
      market?: string;
    };

    const target = await prisma.outreachTarget.findUnique({
      where: { id },
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        company: true,
        language: true,
        status: true,
        nextRecontactAt: true,
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    // 1. Résoudre l'agence : existante (sélection) ou créée à la volée.
    let partner: { id: string; name: string; slug: string; market: string };
    if (body.partnerId) {
      const found = await prisma.partner.findUnique({
        where: { id: body.partnerId },
        select: { id: true, name: true, slug: true, market: true },
      });
      if (!found) {
        return NextResponse.json({ error: "Agence introuvable." }, { status: 404 });
      }
      partner = found;
    } else {
      const agencyName = (body.agencyName || "").trim();
      if (!agencyName) {
        return NextResponse.json(
          { error: "Sélectionnez une agence existante ou saisissez son nom." },
          { status: 400 }
        );
      }
      const market = body.market === "BENELUX" ? "BENELUX" : "FR";
      const existing = await prisma.partner.findFirst({
        where: { name: { equals: agencyName, mode: "insensitive" } },
        select: { id: true, name: true, slug: true, market: true },
      });
      if (existing) {
        partner = existing;
      } else {
        // Filet anti-doublon par slug normalisé (accents/espaces/ponctuation).
        const baseSlug = slugifyPartner(agencyName);
        const bySlug = baseSlug
          ? await prisma.partner.findUnique({
              where: { slug: baseSlug },
              select: { id: true, name: true, slug: true, market: true },
            })
          : null;
        if (bySlug) {
          partner = bySlug;
        } else {
          const slug = await generateUniquePartnerSlug(baseSlug);
          partner = await prisma.partner.create({
            data: { name: agencyName, slug, market, createdBy: session.user.id },
            select: { id: true, name: true, slug: true, market: true },
          });
        }
      }
    }

    const email = target.email.trim().toLowerCase();
    const now = new Date();
    const migrationNote =
      `Requalifié agence (${partner.name}) : déplacé vers Prospection Agences le ` +
      `${new Intl.DateTimeFormat("fr-FR", { day: "numeric", month: "long", year: "numeric" }).format(now)}.`;

    // 2. Contact agence (dédup par partner + email).
    const agencyContact = await prisma.agencyContact.upsert({
      where: { partnerId_email: { partnerId: partner.id, email } },
      update: {},
      create: {
        partnerId: partner.id,
        prenom: target.firstname,
        nom: target.lastname || null,
        email,
        language: target.language === "en" ? "en" : "fr",
        createdById: session.user.id,
      },
    });

    // 3. Target agence : réactive l'existant sur cet email, sinon création en
    //    conservant l'état du cycle (statut hors STOPPED + compteur).
    const carriedStatus =
      target.status === "STOPPED" || target.status === "TO_CONTACT"
        ? "TO_CONTACT"
        : target.status;

    const existingAgencyTarget = await prisma.agencyOutreachTarget.findUnique({
      where: { email },
      select: { id: true, company: true },
    });

    let agencyTarget;
    if (existingAgencyTarget) {
      agencyTarget = await prisma.agencyOutreachTarget.update({
        where: { id: existingAgencyTarget.id },
        data: {
          status: carriedStatus,
          nextRecontactAt: target.nextRecontactAt,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
          stoppedAt: null,
          stoppedById: null,
        },
      });
    } else {
      agencyTarget = await prisma.agencyOutreachTarget.create({
        data: {
          partnerId: partner.id,
          agencyContactId: agencyContact.id,
          firstname: target.firstname,
          lastname: target.lastname,
          email,
          company: partner.name,
          partnerSlug: partner.slug,
          language: target.language === "en" ? "en" : "fr",
          market: partner.market === "BENELUX" ? "BENELUX" : "FR",
          status: carriedStatus,
          nextRecontactAt: target.nextRecontactAt,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
          createdById: session.user.id,
        },
      });
    }

    // 4. Stopper le target client (trace de la migration conservée).
    await prisma.outreachTarget.update({
      where: { id: target.id },
      data: {
        status: "STOPPED",
        stoppedAt: now,
        stoppedById: session.user.id,
        autoRescheduleReason: migrationNote,
        autoRescheduledAt: now,
      },
    });

    return NextResponse.json({
      partner,
      target: agencyTarget,
      message: `${target.firstname} (${email}) est maintenant suivi en Prospection Agences (${partner.name}).`,
    });
  } catch (error) {
    console.error("POST /api/outreach/targets/[id]/convert-to-agency:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
