import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * CRUD contacts BENELUX — miroir de /api/marques/[id]/contacts pour
 * alimenter la même UI MarqueRecordPage.
 *
 * POST   → ajout rapide
 * PATCH  → email / langue / principal / opt-out (outreachExcluded)
 * DELETE → ?contactId=… (ADMIN)
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
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
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: companyId } = await params;
    const company = await prisma.beneluxCompany.findUnique({
      where: { id: companyId },
      select: { id: true },
    });
    if (!company) {
      return NextResponse.json({ error: "Entreprise introuvable." }, { status: 404 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      prenom?: string;
      nom?: string;
      email?: string;
      poste?: string;
      linkedinUrl?: string;
      language?: string;
    };

    const prenom = (body.prenom || "").trim();
    const nom = (body.nom || "").trim();
    const email = (body.email || "").trim().toLowerCase();
    if (!prenom && !nom) {
      return NextResponse.json({ error: "Nom ou prénom requis." }, { status: 400 });
    }
    if (body.language !== "fr" && body.language !== "en") {
      return NextResponse.json(
        { error: "Langue du contact requise (français ou anglais)." },
        { status: 400 }
      );
    }
    if (email && !isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    if (email) {
      const dup = await prisma.beneluxContact.findUnique({
        where: { companyId_email: { companyId, email } },
        select: { id: true },
      });
      if (dup) {
        return NextResponse.json(
          { error: "Un contact avec cet email existe déjà sur cette entreprise." },
          { status: 409 }
        );
      }
    }

    const contact = await prisma.beneluxContact.create({
      data: {
        companyId,
        prenom: prenom || nom || "Contact",
        nom: nom || null,
        email: email || null,
        poste: (body.poste || "").trim() || null,
        linkedinUrl: (body.linkedinUrl || "").trim() || null,
        language: body.language,
        source: "MANUAL",
        createdById: session.user.id,
      },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error) {
    console.error("POST /api/benelux-outreach/companies/[id]/contacts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!hasAccess(session.user.role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: companyId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      contactId?: string;
      email?: string | null;
      language?: string;
      principal?: boolean;
      diffusionOptOut?: boolean;
      outreachExcluded?: boolean;
    };

    if (!body.contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    const contact = await prisma.beneluxContact.findFirst({
      where: { id: body.contactId, companyId },
      select: { id: true, email: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    const data: {
      email?: string | null;
      language?: string;
      principal?: boolean;
      outreachExcluded?: boolean;
      excluded?: boolean;
      emailLookupStatus?: string | null;
      emailSuggested?: string | null;
    } = {};

    if (typeof body.email === "string" || body.email === null) {
      const email = body.email?.trim().toLowerCase() || null;
      if (email && !isValidEmail(email)) {
        return NextResponse.json({ error: "Email invalide." }, { status: 400 });
      }
      if (email) {
        const dup = await prisma.beneluxContact.findFirst({
          where: {
            companyId,
            email: { equals: email, mode: "insensitive" },
            NOT: { id: contact.id },
          },
          select: { id: true },
        });
        if (dup) {
          return NextResponse.json(
            { error: "Un autre contact a déjà cet email." },
            { status: 409 }
          );
        }
      }
      data.email = email;
      if (email) {
        data.emailLookupStatus = "FOUND";
        data.emailSuggested = null;
      }
    }

    if (body.language === "fr" || body.language === "en") {
      data.language = body.language;
      // Sync langue sur le target s'il existe
      if (contact.email) {
        await prisma.beneluxOutreachTarget.updateMany({
          where: { email: contact.email.toLowerCase() },
          data: { language: body.language },
        });
      }
    }

    if (typeof body.principal === "boolean") {
      data.principal = body.principal;
      if (body.principal) {
        await prisma.beneluxContact.updateMany({
          where: { companyId, NOT: { id: contact.id } },
          data: { principal: false },
        });
      }
    }

    // Opt-out liste de diffusion → outreachExcluded (même UX que FR)
    if (typeof body.diffusionOptOut === "boolean") {
      data.outreachExcluded = body.diffusionOptOut;
      data.excluded = body.diffusionOptOut;
      if (body.diffusionOptOut && contact.email) {
        await prisma.beneluxOutreachTarget.updateMany({
          where: { email: contact.email.toLowerCase() },
          data: {
            status: "STOPPED",
            stoppedAt: new Date(),
            stoppedById: session.user.id,
            autoRescheduleReason: "Opt-out liste de diffusion (CRM BENELUX)",
            autoRescheduledAt: new Date(),
          },
        });
      }
    } else if (typeof body.outreachExcluded === "boolean") {
      data.outreachExcluded = body.outreachExcluded;
    }

    const updated = await prisma.beneluxContact.update({
      where: { id: contact.id },
      data,
    });

    return NextResponse.json({ contact: updated });
  } catch (error) {
    console.error("PATCH /api/benelux-outreach/companies/[id]/contacts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (session.user.role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: companyId } = await params;
    const contactId = request.nextUrl.searchParams.get("contactId");
    if (!contactId) {
      return NextResponse.json({ error: "contactId requis." }, { status: 400 });
    }

    const contact = await prisma.beneluxContact.findFirst({
      where: { id: contactId, companyId },
      select: { id: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    await prisma.$transaction([
      prisma.beneluxOutreachTarget.deleteMany({ where: { beneluxContactId: contactId } }),
      prisma.beneluxContact.delete({ where: { id: contactId } }),
    ]);

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/benelux-outreach/companies/[id]/contacts:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
