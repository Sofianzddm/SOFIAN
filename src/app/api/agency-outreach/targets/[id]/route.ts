import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";

/**
 * GET    → fiche contact agence + historique complet des touches
 * PATCH  → { action: "stop" | "resume" } : sortir/remettre dans le cycle
 *          { action: "pause-relance" | "resume-relance" } : relance auto J+3
 *          { action: "draft", subject, bodyHtml } : enregistrer le brouillon
 *          { action: "edit", firstname, lastname, email, fromEmail?, language? }
 * DELETE → suppression (ADMIN uniquement)
 */

const ALLOWED_ROLES = ["ADMIN", "HEAD_OF_SALES"] as const;

function hasAccess(role: string | undefined | null): boolean {
  return ALLOWED_ROLES.includes((role || "") as (typeof ALLOWED_ROLES)[number]);
}

export async function GET(
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

    const { id } = await params;
    const target = await prisma.agencyOutreachTarget.findUnique({
      where: { id },
      include: {
        touches: {
          orderBy: { cycleNumber: "desc" },
          include: {
            clicks: {
              orderBy: { clickedAt: "desc" },
              select: { id: true, url: true, clickedAt: true },
            },
          },
        },
        partner: { select: { id: true, name: true, slug: true } },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Contact agence introuvable." }, { status: 404 });
    }

    return NextResponse.json({ target });
  } catch (error) {
    console.error("GET /api/agency-outreach/targets/[id]:", error);
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

    const { id } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      action?:
        | "stop"
        | "resume"
        | "pause-relance"
        | "resume-relance"
        | "draft"
        | "edit";
      subject?: string;
      bodyHtml?: string;
      firstname?: string;
      lastname?: string;
      email?: string;
      fromEmail?: string | null;
      language?: string;
    };

    const target = await prisma.agencyOutreachTarget.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Contact agence introuvable." }, { status: 404 });
    }

    if (body.action === "edit") {
      const firstname = String(body.firstname || "").trim();
      const lastname = String(body.lastname || "").trim();
      const email = String(body.email || "").trim().toLowerCase();

      if (!firstname || !email) {
        return NextResponse.json(
          { error: "Prénom et email sont obligatoires." },
          { status: 400 }
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Email invalide." }, { status: 400 });
      }

      if (email !== target.email.toLowerCase()) {
        const duplicate = await prisma.agencyOutreachTarget.findUnique({
          where: { email },
          select: { id: true, company: true },
        });
        if (duplicate && duplicate.id !== id) {
          return NextResponse.json(
            { error: `Cet email est déjà suivi (${duplicate.company}).` },
            { status: 409 }
          );
        }
      }

      // Boîte expéditrice : null = retour au défaut (Leyna). Réservé à l'ADMIN.
      let fromEmailUpdate: { fromEmail: string | null } | Record<string, never> = {};
      if ("fromEmail" in body && session.user.role === "ADMIN") {
        const rawFromEmail = (body.fromEmail || "").trim().toLowerCase();
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
          fromEmailUpdate = { fromEmail: rawFromEmail };
        } else {
          fromEmailUpdate = { fromEmail: null };
        }
      }

      // Synchronise le contact agence rattaché (si présent), dédoublonné par email.
      if (target.agencyContactId) {
        await prisma.agencyContact
          .update({
            where: { id: target.agencyContactId },
            data: {
              prenom: firstname,
              nom: lastname || null,
              email,
              ...(body.language === "en" || body.language === "fr"
                ? { language: body.language }
                : {}),
            },
          })
          .catch(() => null);
      }

      const updated = await prisma.agencyOutreachTarget.update({
        where: { id },
        data: {
          firstname,
          lastname: lastname || null,
          email,
          ...(body.language === "en" || body.language === "fr"
            ? { language: body.language }
            : {}),
          ...fromEmailUpdate,
        },
      });
      return NextResponse.json({ target: updated });
    }

    if (body.action === "draft") {
      const updated = await prisma.agencyOutreachTarget.update({
        where: { id },
        data: {
          draftSubject: String(body.subject || "").trim() || null,
          draftBodyHtml: String(body.bodyHtml || "").trim() || null,
        },
      });
      return NextResponse.json({ target: updated });
    }

    if (body.action === "stop") {
      const updated = await prisma.agencyOutreachTarget.update({
        where: { id },
        data: {
          status: "STOPPED",
          stoppedAt: new Date(),
          stoppedById: session.user.id,
        },
      });
      return NextResponse.json({ target: updated });
    }

    if (body.action === "resume") {
      if (target.status !== "STOPPED") {
        return NextResponse.json({ error: "Ce contact n'est pas stoppé." }, { status: 409 });
      }
      const now = Date.now();
      const status =
        target.cycleCount === 0
          ? "TO_CONTACT"
          : target.nextRecontactAt && target.nextRecontactAt.getTime() > now
          ? "WAITING"
          : "TO_RECONTACT";
      const updated = await prisma.agencyOutreachTarget.update({
        where: { id },
        data: { status, stoppedAt: null, stoppedById: null },
      });
      return NextResponse.json({ target: updated });
    }

    if (body.action === "pause-relance" || body.action === "resume-relance") {
      const touch = await prisma.agencyOutreachTouch.findFirst({
        where: { targetId: id, sentAt: { not: null } },
        orderBy: { cycleNumber: "desc" },
        select: { id: true, relanceSentAt: true, repliedAt: true },
      });
      if (!touch) {
        return NextResponse.json(
          { error: "Aucun mail de cycle envoyé pour ce contact." },
          { status: 409 }
        );
      }
      if (touch.relanceSentAt) {
        return NextResponse.json(
          { error: "La relance a déjà été envoyée pour ce mail." },
          { status: 409 }
        );
      }
      if (body.action === "pause-relance" && touch.repliedAt) {
        return NextResponse.json(
          { error: "Le contact a répondu : aucune relance n'est prévue." },
          { status: 409 }
        );
      }

      await prisma.agencyOutreachTouch.update({
        where: { id: touch.id },
        data:
          body.action === "pause-relance"
            ? { relanceCancelledAt: new Date(), relanceCancelledById: session.user.id }
            : { relanceCancelledAt: null, relanceCancelledById: null },
      });
      return NextResponse.json({ ok: true });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/agency-outreach/targets/[id]:", error);
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

    const { id } = await params;
    await prisma.agencyOutreachTarget.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/agency-outreach/targets/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
