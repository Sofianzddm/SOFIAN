import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { findCrossPipelineConflict } from "@/lib/outreach-bridge";
import {
  tryEnrollMarqueAfterEmailComplete,
  tryEnrollBeneluxAfterEmailComplete,
} from "@/lib/envoyer-marque-outreach";
import { writeBeneluxContactEmail } from "@/lib/benelux-contact-email";
import {
  writeAgencyContactEmail,
  tryEnrollAgencyAfterEmailComplete,
} from "@/lib/agency-contact-email";

/**
 * POST → valide toute la fiche enrichissement d'un coup (« Prêt »).
 * Body: {
 *   market: "FR" | "BENELUX" | "AGENCY",
 *   marqueId: string,  // companyId si BENELUX, partnerId si AGENCY
 *   contacts: [{ id: string, email?: string, notFound?: boolean, bothMarkets?: boolean }]
 * }
 *
 * Un contact peut être complété (email) ou marqué introuvable (notFound).
 * Seuls ceux avec email partent ensuite en outreach.
 */

const ALLOWED_ROLES = ["ADMIN", "CASTING_MANAGER"] as const;

const isValidEmail = (value: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);

async function markNotFound(
  market: "FR" | "BENELUX" | "AGENCY",
  contactId: string,
  parentId: string
): Promise<"ok" | "not_found"> {
  if (market === "AGENCY") {
    const contact = await prisma.agencyContact.findFirst({
      where: { id: contactId, partnerId: parentId },
      select: { id: true },
    });
    if (!contact) return "not_found";
    await prisma.agencyContact.update({
      where: { id: contactId },
      data: { emailLookupStatus: "NOT_FOUND", emailSuggested: null },
    });
    return "ok";
  }
  if (market === "BENELUX") {
    const contact = await prisma.beneluxContact.findFirst({
      where: { id: contactId, companyId: parentId },
      select: { id: true },
    });
    if (!contact) return "not_found";
    await prisma.beneluxContact.update({
      where: { id: contactId },
      data: { emailLookupStatus: "NOT_FOUND", emailSuggested: null },
    });
    return "ok";
  }
  const contact = await prisma.marqueContact.findFirst({
    where: { id: contactId, marqueId: parentId },
    select: { id: true },
  });
  if (!contact) return "not_found";
  await prisma.marqueContact.update({
    where: { id: contactId },
    data: { emailLookupStatus: "NOT_FOUND", emailSuggested: null },
  });
  return "ok";
}

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user?.id) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role || "";
    if (!ALLOWED_ROLES.includes(role as (typeof ALLOWED_ROLES)[number])) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = (await request.json().catch(() => ({}))) as {
      market?: string;
      marqueId?: string;
      contacts?: Array<{
        id?: string;
        email?: string;
        notFound?: boolean;
        bothMarkets?: boolean;
      }>;
    };

    const marketRaw = (body.market || "FR").toUpperCase();
    const market =
      marketRaw === "BENELUX" ? "BENELUX" : marketRaw === "AGENCY" ? "AGENCY" : "FR";
    const marqueId = String(body.marqueId || "").trim();
    const rows = Array.isArray(body.contacts) ? body.contacts : [];

    if (!marqueId || rows.length === 0) {
      return NextResponse.json({ error: "Contacts requis." }, { status: 400 });
    }

    // Onglet Agences : réservé ADMIN.
    if (market === "AGENCY" && role !== "ADMIN") {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const ownPipeline =
      market === "BENELUX" ? "benelux" : market === "AGENCY" ? "agency" : "client";
    const saved: string[] = [];
    let notFoundCount = 0;
    const crossMarketEmails = new Set<string>();
    /** Ids avec email valide — seuls candidats à l'enrôlement. */
    const enrollableIds: string[] = [];

    for (const row of rows) {
      const id = String(row.id || "").trim();
      if (!id) {
        return NextResponse.json({ error: "Contact invalide." }, { status: 400 });
      }

      if (row.notFound) {
        const result = await markNotFound(market, id, marqueId);
        if (result === "not_found") {
          return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
        }
        notFoundCount += 1;
        continue;
      }

      const email = String(row.email || "")
        .trim()
        .toLowerCase();
      if (!isValidEmail(email)) {
        return NextResponse.json(
          { error: `Email invalide pour un contact (${email || "vide"}).` },
          { status: 400 }
        );
      }

      const bothMarkets = row.bothMarkets === true;

      const guardConflict = async (isAo: boolean): Promise<NextResponse | null> => {
        if (isAo) return null;
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
        return null;
      };

      if (market === "AGENCY") {
        const contact = await prisma.agencyContact.findFirst({
          where: { id, partnerId: marqueId },
          select: { id: true },
        });
        if (!contact) {
          return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
        }
        const blocked = await guardConflict(false);
        if (blocked) return blocked;
        await writeAgencyContactEmail(id, marqueId, email);
      } else if (market === "BENELUX") {
        const contact = await prisma.beneluxContact.findFirst({
          where: { id, companyId: marqueId },
          select: { id: true, source: true },
        });
        if (!contact) {
          return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
        }
        const blocked = await guardConflict(contact.source === "AO");
        if (blocked) return blocked;
        await writeBeneluxContactEmail(id, marqueId, email);
      } else {
        const contact = await prisma.marqueContact.findFirst({
          where: { id, marqueId },
          select: { id: true, source: true },
        });
        if (!contact) {
          return NextResponse.json({ error: "Contact introuvable." }, { status: 404 });
        }
        const blocked = await guardConflict(contact.source === "AO");
        if (blocked) return blocked;
        await prisma.marqueContact.update({
          where: { id },
          data: { email, emailLookupStatus: "FOUND", emailSuggested: null },
        });
      }
      saved.push(email);
      enrollableIds.push(id);
    }

    if (market === "AGENCY") {
      // Tous les ids de la fiche (email + NOT_FOUND) : le filtre contactIds
      // évite de rebloquer sur d'autres contacts hors de cette validation.
      // tryEnroll n'enrôle que ceux qui ont un email valide.
      const allIds = rows.map((r) => String(r.id || "").trim()).filter(Boolean);
      const enroll =
        enrollableIds.length > 0
          ? await tryEnrollAgencyAfterEmailComplete({
              partnerId: marqueId,
              userId: session.user.id,
              contactIds: allIds,
            })
          : { enrolled: 0, stillQueued: 0 };
      return NextResponse.json({
        ok: true,
        saved: saved.length,
        notFound: notFoundCount,
        enrolled: enroll.enrolled,
        message:
          enroll.enrolled > 0
            ? `${enroll.enrolled} contact(s) envoyés dans « À contacter » agences.`
            : saved.length > 0
              ? `${saved.length} email(s) enregistrés.`
              : `${notFoundCount} contact(s) marqués sans email.`,
      });
    }

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
        : saved.length > 0
          ? `${saved.length} email(s) enregistrés${suffix}.`
          : `${notFoundCount} contact(s) marqués sans email${suffix}.`;

    return NextResponse.json({
      ok: true,
      saved: saved.length,
      notFound: notFoundCount,
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
