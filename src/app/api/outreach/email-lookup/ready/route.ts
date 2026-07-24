import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";
import {
  tryEnrollMarqueAfterEmailComplete,
  tryEnrollBeneluxAfterEmailComplete,
} from "@/lib/envoyer-marque-outreach";

/**
 * POST → valide toute la fiche enrichissement d'un coup (« Prêt »).
 * Body: {
 *   market: "FR" | "BENELUX",
 *   marqueId: string,  // companyId si BENELUX
 *   contacts: [{ id: string, email: string }]
 * }
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!ALLOWED_ROLES.includes((session.user.role || "") as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      market?: string;
      marqueId?: string;
      contacts?: Array<{ id?: string; email?: string; bothMarkets?: boolean }>;
    };

    const market = body.market === "BENELUX" ? "BENELUX" : "FR";
    const marqueId = String(body.marqueId || "").trim();
    const rows = Array.isArray(body.contacts) ? body.contacts : [];

    if (!marqueId || rows.length === 0) {
      return NextResponse.json({ error: "Contacts requis." }, { status: 400 });
    }

    const ownPipeline = market === "BENELUX" ? "benelux" : "client";
    const saved: string[] = [];
    // Emails d'un contact placé volontairement « FR + BE » : leur présence dans
    // le marché frère (France ↔ Benelux) ne doit pas bloquer l'enregistrement.
    const crossMarketEmails = new Set<string>();

    for (const row of rows) {
      const id = String(row.id || "").trim();
      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      if (!id || !isValidEmail(email)) {
        return NextResponse.json(
          { error: `Email invalide pour un contact (${email || "vide"}).` },
          { status: 400 }
        );
      }

      const bothMarkets = row.bothMarkets === true;
      if (bothMarkets) crossMarketEmails.add(email);

      const conflict = await findCrossPipelineConflict(email, ownPipeline, {
        allowClientBeneluxSibling: bothMarkets,
      });
      if (conflict) {
        return NextResponse.json(
          {
            error: `${email} est déjà suivi dans ${conflict.label} (${conflict.company}).`,
          },
          { status: 409 }
        );
      }

      if (market === "BENELUX") {
        const contact = await prisma.beneluxContact.findFirst({
          where: { id, companyId: marqueId },
          select: { id: true },
        });
        if (!contact) {
          return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
        }
        await prisma.beneluxContact.update({
          where: { id },
          data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
        });
      } else {
        const contact = await prisma.marqueContact.findFirst({
          where: { id, marqueId },
          select: { id: true },
        });
        if (!contact) {
          return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
        }
        await prisma.marqueContact.update({
          where: { id },
          data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
        });
      }
      saved.push(email);
    }

    // « Prêt » = validation explicite des vrais emails → on enrôle DIRECTEMENT
    // les contacts influence dans « À contacter » (création des OutreachTarget).
    // Les AO ne sont jamais enrôlés (exclus par enrollInfluenceContacts).
    const enroll =
      market === "BENELUX"
        ? await tryEnrollBeneluxAfterEmailComplete({
            companyId: marqueId,
            userId: session.user.id,
            crossMarketEmails,
          })
        : await tryEnrollMarqueAfterEmailComplete({
            marqueId,
            userId: session.user.id,
            crossMarketEmails,
          });

    const suffix = market === "BENELUX" ? " BENELUX" : "";
    const message =
      enroll.enrolled > 0
        ? `${enroll.enrolled} contact(s) envoyés dans « À contacter »${suffix}.`
        : `${saved.length} email(s) enregistrés${suffix}.`;

    return NextResponse.json({
      ok: true,
      saved: saved.length,
      enrolled: enroll.enrolled,
      message,
    });
  } catch (error) {
    console.error("POST /api/outreach/email-lookup/ready:", error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Erreur serveur" },
      { status: 500 }
    );
  }
}
