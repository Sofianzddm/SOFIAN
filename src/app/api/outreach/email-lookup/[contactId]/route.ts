import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";
import { writeBeneluxContactEmail } from "@/lib/benelux-contact-email";
import { writeAgencyContactEmail } from "@/lib/agency-contact-email";
import { writeMarqueContactEmail } from "@/lib/marque-contact-email";

/**
 * PATCH → complète (ou marque introuvable) un email en file d'enrichissement.
 * Body: { email?, notFound?, market?: "FR" | "BENELUX" | "AGENCY" }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

type Market = "FR" | "BENELUX" | "AGENCY";

function parseMarket(raw: string | null | undefined): Market {
  const m = (raw || "FR").toUpperCase();
  if (m === "BENELUX") return "BENELUX";
  if (m === "AGENCY") return "AGENCY";
  return "FR";
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
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

    const { contactId } = await params;
    const body = (await request.json().catch(() => ({}))) as {
      email?: string;
      notFound?: boolean;
      market?: string;
    };
    const market = parseMarket(body.market);

    if (market === "AGENCY" && role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    if (market === "AGENCY") {
      const contact = await prisma.agencyContact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          partnerId: true,
          partner: { select: { name: true } },
        },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      }

      if (body.notFound) {
        await prisma.agencyContact.update({
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

      const conflict = await findCrossPipelineConflict(email, "agency");
      if (conflict) {
        return NextResponse.json(
          {
            error: `Cet email est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
          },
          { status: 409 }
        );
      }

      await writeAgencyContactEmail(contactId, contact.partnerId, email);

      return NextResponse.json({
        ok: true,
        status: "FOUND",
        email,
        message: `Email enregistré — ${contact.partner.name} à lancer dans « À contacter » agences.`,
      });
    }

    const ownPipeline = market === "BENELUX" ? "benelux" : "client";

    if (market === "BENELUX") {
      const contact = await prisma.beneluxContact.findUnique({
        where: { id: contactId },
        select: {
          id: true,
          companyId: true,
          source: true,
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

      if (contact.source !== "AO") {
        const conflict = await findCrossPipelineConflict(email, ownPipeline);
        if (conflict) {
          return NextResponse.json(
            {
              error: `Cet email est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
            },
            { status: 409 }
          );
        }
      }

      await writeBeneluxContactEmail(contactId, contact.companyId, email);

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
        source: true,
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

    if (contact.source !== "AO") {
      const conflict = await findCrossPipelineConflict(email, ownPipeline);
      if (conflict) {
        return NextResponse.json(
          {
            error: `Cet email est déjà suivi dans le module ${conflict.label} (${conflict.company}).`,
          },
          { status: 409 }
        );
      }
    }

    await writeMarqueContactEmail(contactId, contact.marqueId, email);

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

/**
 * DELETE → retire un contact de la file d'enrichissement.
 * Query: ?market=FR|BENELUX|AGENCY
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ contactId: string }> }
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

    const { contactId } = await params;
    const market = parseMarket(request.nextUrl.searchParams.get("market"));

    if (market === "AGENCY" && role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    if (market === "AGENCY") {
      const contact = await prisma.agencyContact.findUnique({
        where: { id: contactId },
        select: { id: true, prenom: true, nom: true },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      }
      await prisma.agencyContact.delete({ where: { id: contactId } });
      const name = [contact.prenom, contact.nom].filter(Boolean).join(" ").trim();
      return NextResponse.json({
        ok: true,
        deleted: true,
        message: `${name || "Contact"} supprimé.`,
      });
    }

    if (market === "BENELUX") {
      const contact = await prisma.beneluxContact.findUnique({
        where: { id: contactId },
        select: { id: true, prenom: true, nom: true },
      });
      if (!contact) {
        return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
      }
      await prisma.beneluxContact.delete({ where: { id: contactId } });
      const name = [contact.prenom, contact.nom].filter(Boolean).join(" ").trim();
      return NextResponse.json({
        ok: true,
        deleted: true,
        message: `${name || "Contact"} supprimé.`,
      });
    }

    const contact = await prisma.marqueContact.findUnique({
      where: { id: contactId },
      select: { id: true, prenom: true, nom: true },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
    }
    await prisma.marqueContact.delete({ where: { id: contactId } });
    const name = [contact.prenom, contact.nom].filter(Boolean).join(" ").trim();
    return NextResponse.json({
      ok: true,
      deleted: true,
      message: `${name || "Contact"} supprimé.`,
    });
  } catch (error) {
    console.error("DELETE /api/outreach/email-lookup/[contactId]:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
