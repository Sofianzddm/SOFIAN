import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { markContactContactedFromApp } from "@/lib/hubspot";
import { findOrCreateMarque, ensureMarqueContact } from "@/lib/marque-resolver";

/**
 * GET    → fiche client + historique complet des touches
 * PATCH  → { action: "stop" | "resume" }  : sortir/remettre le client dans le cycle
 *          { action: "draft", subject, bodyHtml } : enregistrer le brouillon
 *          { action: "edit", firstname, lastname, email, company } : éditer le client
 * DELETE → suppression (ADMIN uniquement, p.ex. ajout par erreur)
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

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
    const target = await prisma.outreachTarget.findUnique({
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
        marque: { select: { id: true, nom: true } },
      },
    });
    if (!target) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    return NextResponse.json({ target });
  } catch (error) {
    console.error("GET /api/outreach/targets/[id]:", error);
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
      action?: "stop" | "resume" | "draft" | "edit";
      subject?: string;
      bodyHtml?: string;
      firstname?: string;
      lastname?: string;
      email?: string;
      company?: string;
      fromEmail?: string | null;
      language?: string;
    };

    const target = await prisma.outreachTarget.findUnique({ where: { id } });
    if (!target) {
      return NextResponse.json({ error: "Client introuvable." }, { status: 404 });
    }

    if (body.action === "edit") {
      const firstname = String(body.firstname || "").trim();
      const lastname = String(body.lastname || "").trim();
      const email = String(body.email || "").trim().toLowerCase();
      const company = String(body.company || "").trim();

      if (!firstname || !email || !company) {
        return NextResponse.json(
          { error: "Prénom, email et marque sont obligatoires." },
          { status: 400 }
        );
      }
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        return NextResponse.json({ error: "Email invalide." }, { status: 400 });
      }

      // L'email est la clé d'unicité du cycle
      if (email !== target.email.toLowerCase()) {
        const duplicate = await prisma.outreachTarget.findUnique({
          where: { email },
          select: { id: true, company: true },
        });
        if (duplicate && duplicate.id !== id) {
          return NextResponse.json(
            { error: `Cet email est déjà suivi dans le cycle (${duplicate.company}).` },
            { status: 409 }
          );
        }
      }

      // Changement d'entreprise → re-résolution de la marque (sans doublon)
      let marqueId = target.marqueId;
      let marqueContactId = target.marqueContactId;
      if (company !== target.company) {
        const resolved = await findOrCreateMarque({ name: company, source: "MANUAL" });
        marqueId = resolved.marqueId;
        marqueContactId = null;
      }
      // Contact synchronisé sur la fiche marque (dédoublonné par email)
      await ensureMarqueContact({
        marqueId,
        email,
        prenom: firstname,
        nom: lastname || firstname,
      });
      const marqueContact = await prisma.marqueContact.findFirst({
        where: { marqueId, email: { equals: email, mode: "insensitive" } },
        select: { id: true },
      });
      marqueContactId = marqueContact?.id || marqueContactId;

      // Boîte expéditrice : null = retour au défaut (Leyna), sinon doit être
      // connectée. Choix réservé à l'ADMIN — ignoré pour les autres rôles.
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

      const updated = await prisma.outreachTarget.update({
        where: { id },
        data: {
          firstname,
          lastname: lastname || null,
          email,
          company,
          marqueId,
          marqueContactId,
          ...(body.language === "en" || body.language === "fr"
            ? { language: body.language }
            : {}),
          ...fromEmailUpdate,
          // L'id HubSpot mémorisé n'est plus fiable si l'email change
          ...(email !== target.email.toLowerCase()
            ? { hubspotContactId: null, hubspotSyncedAt: null }
            : {}),
        },
      });
      return NextResponse.json({ target: updated });
    }

    if (body.action === "draft") {
      const updated = await prisma.outreachTarget.update({
        where: { id },
        data: {
          draftSubject: String(body.subject || "").trim() || null,
          draftBodyHtml: String(body.bodyHtml || "").trim() || null,
        },
      });
      return NextResponse.json({ target: updated });
    }

    if (body.action === "stop") {
      const updated = await prisma.outreachTarget.update({
        where: { id },
        data: {
          status: "STOPPED",
          stoppedAt: new Date(),
          stoppedById: session.user.id,
        },
      });
      // Write-back best-effort pour que les listes HubSpot le voient aussi
      if (target.hubspotContactId) {
        markContactContactedFromApp(target.hubspotContactId, "stoppe").catch(() => {});
      }
      return NextResponse.json({ target: updated });
    }

    if (body.action === "resume") {
      if (target.status !== "STOPPED") {
        return NextResponse.json(
          { error: "Ce client n'est pas stoppé." },
          { status: 409 }
        );
      }
      const now = Date.now();
      const status =
        target.cycleCount === 0
          ? "TO_CONTACT"
          : target.nextRecontactAt && target.nextRecontactAt.getTime() > now
          ? "WAITING"
          : "TO_RECONTACT";
      const updated = await prisma.outreachTarget.update({
        where: { id },
        data: { status, stoppedAt: null, stoppedById: null },
      });
      return NextResponse.json({ target: updated });
    }

    return NextResponse.json({ error: "Action inconnue." }, { status: 400 });
  } catch (error) {
    console.error("PATCH /api/outreach/targets/[id]:", error);
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
    await prisma.outreachTarget.delete({ where: { id } }).catch(() => null);
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error("DELETE /api/outreach/targets/[id]:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
