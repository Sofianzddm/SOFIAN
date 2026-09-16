import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  generateUniqueBeneluxSlug,
  slugifyBenelux,
} from "@/lib/benelux-company";

/**
 * POST /api/outreach/targets/[id]/convert-to-benelux
 *
 * Correction de marché : un contact d'Outreach Clients FR doit être suivi
 * en prospection BENELUX. On stoppe le target FR (trace conservée) et on
 * crée / réactive le BeneluxOutreachTarget en conservant statut + compteur.
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
      return NextResponse.json(
        { error: "Permissions insuffisantes" },
        { status: 403 }
      );
    }

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      companyName?: string;
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
        cycleCount: true,
        fromEmail: true,
        lastSentAt: true,
        lastRepliedAt: true,
        marqueId: true,
        marqueContactId: true,
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    const companyName = (body.companyName || target.company || "").trim();
    if (!companyName) {
      return NextResponse.json(
        { error: "Nom d'entreprise requis." },
        { status: 400 }
      );
    }

    const email = target.email.trim().toLowerCase();
    const now = new Date();
    const migrationNote =
      `Basculé Outreach Clients FR → BENELUX le ` +
      `${new Intl.DateTimeFormat("fr-FR", {
        day: "numeric",
        month: "long",
        year: "numeric",
      }).format(now)}.`;

    // 1. Entreprise BENELUX (réutilise si même nom)
    let company = await prisma.beneluxCompany.findFirst({
      where: { nom: { equals: companyName, mode: "insensitive" } },
      select: { id: true, nom: true, linkedMarqueId: true },
    });
    if (!company) {
      const slug = await generateUniqueBeneluxSlug(slugifyBenelux(companyName));
      company = await prisma.beneluxCompany.create({
        data: {
          nom: companyName,
          slug,
          linkedMarqueId: target.marqueId || null,
          createdById: session.user.id,
        },
        select: { id: true, nom: true, linkedMarqueId: true },
      });
    } else if (target.marqueId && !company.linkedMarqueId) {
      company = await prisma.beneluxCompany.update({
        where: { id: company.id },
        data: { linkedMarqueId: target.marqueId },
        select: { id: true, nom: true, linkedMarqueId: true },
      });
    }

    // 2. Contact BENELUX
    let beneluxContact = await prisma.beneluxContact.findUnique({
      where: {
        companyId_email: { companyId: company.id, email },
      },
      select: { id: true },
    });
    if (!beneluxContact) {
      beneluxContact = await prisma.beneluxContact.create({
        data: {
          companyId: company.id,
          prenom: target.firstname,
          nom: target.lastname || null,
          email,
          language: target.language === "en" ? "en" : "fr",
          source: "MANUAL",
          createdById: session.user.id,
        },
        select: { id: true },
      });
    }

    // 3. Target BENELUX — conserve le cycle
    const carriedStatus =
      target.status === "STOPPED" ? "STOPPED" : target.status;

    const existingBe = await prisma.beneluxOutreachTarget.findUnique({
      where: { email },
      select: { id: true, companyName: true },
    });

    let beTarget;
    if (existingBe) {
      beTarget = await prisma.beneluxOutreachTarget.update({
        where: { id: existingBe.id },
        data: {
          companyId: company.id,
          beneluxContactId: beneluxContact.id,
          companyName: company.nom,
          status: carriedStatus,
          fromEmail: target.fromEmail,
          cycleCount: target.cycleCount,
          lastSentAt: target.lastSentAt,
          nextRecontactAt: target.nextRecontactAt,
          lastRepliedAt: target.lastRepliedAt,
          stoppedAt: carriedStatus === "STOPPED" ? now : null,
          stoppedById: carriedStatus === "STOPPED" ? session.user.id : null,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
        },
      });
    } else {
      beTarget = await prisma.beneluxOutreachTarget.create({
        data: {
          companyId: company.id,
          beneluxContactId: beneluxContact.id,
          firstname: target.firstname,
          lastname: target.lastname,
          email,
          companyName: company.nom,
          language: target.language === "en" ? "en" : "fr",
          status: carriedStatus,
          fromEmail: target.fromEmail,
          cycleCount: target.cycleCount,
          lastSentAt: target.lastSentAt,
          nextRecontactAt: target.nextRecontactAt,
          lastRepliedAt: target.lastRepliedAt,
          stoppedAt: carriedStatus === "STOPPED" ? now : null,
          stoppedById: carriedStatus === "STOPPED" ? session.user.id : null,
          autoRescheduleReason: migrationNote,
          autoRescheduledAt: now,
          createdById: session.user.id,
        },
      });
    }

    // 4. Stopper le target FR
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
      company,
      target: beTarget,
      message: `${target.firstname} (${email}) est maintenant suivi en Outreach BENELUX (${company.nom}).`,
      redirectPath: `/outreach?market=BENELUX&q=${encodeURIComponent(company.nom)}`,
    });
  } catch (error) {
    console.error("POST /api/outreach/targets/[id]/convert-to-benelux:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
