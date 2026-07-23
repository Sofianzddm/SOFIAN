import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";

/**
 * PATCH → complète (ou marque introuvable) un email en file d'enrichissement.
 * Body: { email?, notFound?, market?: "FR" | "BENELUX" }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      notFound?: boolean;
      market?: string;
    };
    const market = body.market === "BENELUX" ? "BENELUX" : "FR";
    const ownPipeline = market === "BENELUX" ? "benelux" : "client";

    if (market === "BENELUX") {
      const contact = await prisma.beneluxContact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          companyId: true,
          company: { select: { nom: true } },
        },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      }

      if (body.notFound) {
        await prisma.beneluxContact.update({
          where: { id: contactId },
          data: { emailLookupStatus: "NOT_FOUND", emailSuggested: null },
        });
        return NextResponse.json({
          ok: true,
          status: "NOT_FOUND",
          message: "Marqué introuvable.",
        });
      }

      const email = String(body.email || "")
        .trim()
        .toLowerCase();
      if (!isValidEmail(email)) {
        return NextResponse.json({ error: "Email invalide." }, { status: 400 });
      }

      const conflict = await findCrossPipelineConflict(email, ownPipeline);
      if (conflict) {
        return NextResponse.json(
          {
            error: `Cet email est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
          },
          { status: 409 }
        );
      }

      await prisma.beneluxContact.update({
        where: { id: contactId },
        data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
      });

      return NextResponse.json({
        ok: true,
        status: "FOUND",
        email,
        message: `Email enregistré — ${contact.company.nom} à lancer dans « À contacter » BENELUX.`,
      });
    }

    const contact = await prisma.marqueContact.findUnique({
      where: { id: contactId },
      select: {
        id: true,
        marqueId: true,
        marque: { select: { nom: true } },
      },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }

    if (body.notFound) {
      await prisma.marqueContact.update({
        where: { id: contactId },
        data: { emailLookupStatus: "NOT_FOUND", emailSuggested: null },
      });
      return NextResponse.json({
        ok: true,
        status: "NOT_FOUND",
        message: "Marqué introuvable — restera hors cycle tant qu'un email n'est pas saisi.",
      });
    }

    const email = String(body.email || "")
      .trim()
      .toLowerCase();
    if (!isValidEmail(email)) {
      return NextResponse.json({ error: "Email invalide." }, { status: 400 });
    }

    const conflict = await findCrossPipelineConflict(email, ownPipeline);
    if (conflict) {
      return NextResponse.json(
        {
          error: `Cet email est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
        },
        { status: 409 }
      );
    }

    await prisma.marqueContact.update({
      where: { id: contactId },
      data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
    });

    // Pas d'enrôlement auto : le contact rejoint « À contacter » avec son vrai
    // email, à lancer manuellement.
    return NextResponse.json({
      ok: true,
      status: "FOUND",
      email,
      message: `Email enregistré — ${contact.marque.nom} à lancer dans « À contacter ».`,
    });
  } catch (error) {
    console.error("PATCH /api/outreach/email-lookup/[contactId]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
