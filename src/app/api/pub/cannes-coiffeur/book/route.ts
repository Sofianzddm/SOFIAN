import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { CannesCoiffeurBookingStatus } from "@prisma/client";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { isValidatedFreeSlot, resolveActivePrestationBySlug } from "@/lib/cannes-coiffeur/availability";
import { formatParisTime, PARIS_TZ } from "@/lib/cannes-coiffeur/formatParisTime";
import { sendCoiffeurBookingConfirmationEmails } from "@/lib/cannes-coiffeur/coiffeurBookingEmails";
import { formatInTimeZone } from "date-fns-tz";
import { buildPublicToken, generateCancellationToken } from "@/lib/cannes-coiffeur/cancellationToken";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";

export const dynamic = "force-dynamic";

const bookSchema = z.object({
  prestationSlug: z.string().min(2).max(80),
  startsAt: z.string().datetime(),
  endsAt: z.string().datetime(),
  guestName: z.string().min(1).max(240).trim(),
  guestEmail: z.string().email().max(320).transform((e) => e.trim().toLowerCase()),
  note: z
    .string()
    .trim()
    .min(8, "Merci de décrire ce que tu souhaites (coupe, style, longueur, frange…).")
    .max(2000),
});

/** Date Paris yyyy-MM-DD pour une réservation donnée — alignée sur startsAt dans ce fuseau. */
function bookingDateParisYmd(startsAt: Date): string {
  return formatInTimeZone(startsAt, PARIS_TZ, "yyyy-MM-dd");
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!isRateLimitBypassed(ip)) {
    const limit = checkRateLimit({
      key: `book:${ip}`,
      max: 3,
      windowMs: 10 * 60 * 1000,
    });
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        {
          error: "Trop de tentatives. Merci de patienter quelques minutes avant de réessayer.",
          retryAfter,
        },
        {
          status: 429,
          headers: { "Retry-After": String(retryAfter) },
        }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsed = bookSchema.safeParse(body);
  if (!parsed.success) {
    const msg = parsed.error.flatten().fieldErrors;
    const first = Object.values(msg)[0]?.[0] || "Donnees invalides";
    return NextResponse.json({ error: first }, { status: 400 });
  }

  const input = parsed.data;

  const prestation = await resolveActivePrestationBySlug(prisma, input.prestationSlug.trim());
  if (!prestation) {
    return NextResponse.json({ error: "Prestation inconnue ou inactive" }, { status: 400 });
  }

  let startsAt: Date;
  let endsAt: Date;
  try {
    startsAt = new Date(input.startsAt);
    endsAt = new Date(input.endsAt);
  } catch {
    return NextResponse.json({ error: "Dates invalides" }, { status: 400 });
  }
  if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
    return NextResponse.json({ error: "Creneau horaire invalide" }, { status: 400 });
  }

  const now = new Date();
  if (startsAt.getTime() < now.getTime()) {
    return NextResponse.json({ error: "Ce creneau est deja passe" }, { status: 400 });
  }

  const ymd = bookingDateParisYmd(startsAt);

  /** Doit encore figurer parmi les créneaux libres calculés (incluant anti-triche hors grille). */
  const stillFree = await isValidatedFreeSlot(prisma, ymd, prestation.id, startsAt, endsAt, now);
  if (!stillFree) {
    return NextResponse.json(
      { error: "Ce creneau n est plus disponible ou hors plage" },
      { status: 400 }
    );
  }

  const noteVal = input.note;
  let cancellationToken: string | null = null;

  try {
    await prisma.$transaction(async (tx) => {
      const occupied = await tx.cannesCoiffeurSlot.findFirst({
        where: {
          cancelledAt: null,
          startsAt: { lt: endsAt },
          endsAt: { gt: startsAt },
          booking: { status: CannesCoiffeurBookingStatus.CONFIRMED },
        },
      });
      if (occupied) {
        throw Object.assign(new Error("CONFLICT"), { code: "CONFLICT" });
      }

      const slot = await tx.cannesCoiffeurSlot.create({
        data: {
          startsAt,
          endsAt,
          createdById: null,
          label: null,
        },
      });

      const booking = await tx.cannesCoiffeurBooking.create({
        data: {
          slotId: slot.id,
          prestationId: prestation.id,
          guestName: input.guestName,
          guestEmail: input.guestEmail,
          notes: noteVal,
          createdById: null,
          status: CannesCoiffeurBookingStatus.CONFIRMED,
          cancellationToken: generateCancellationToken(),
        },
        select: { cancellationToken: true },
      });
      cancellationToken = booking.cancellationToken;
    });
  } catch (e) {
    if (e && typeof e === "object" && (e as { code?: string }).code === "CONFLICT") {
      return NextResponse.json(
        { error: "Ce creneau vient d etre reserve, choisis-en un autre." },
        { status: 409 }
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2002") {
      return NextResponse.json(
        { error: "Ce creneau vient d etre reserve, choisis-en un autre." },
        { status: 409 }
      );
    }
    if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === "P2022") {
      console.error(
        "[pub/cannes-coiffeur/book] schéma BDD incomplet — pnpm prisma migrate deploy (ou prisma/sql/cannes_coiffeur_cancellation.sql sur Neon)",
        e.meta
      );
      return NextResponse.json(
        {
          error:
            "La base de données n’est pas à jour. Déploie les migrations Prisma (`pnpm prisma migrate deploy`) ou exécute prisma/sql/cannes_coiffeur_cancellation.sql sur la même DATABASE_URL.",
        },
        { status: 503 }
      );
    }
    console.error("[pub/cannes-coiffeur/book]", e);
    return NextResponse.json({ error: "Erreur serveur lors de la reservation" }, { status: 500 });
  }

  try {
    await sendCoiffeurBookingConfirmationEmails({
      guestEmail: input.guestEmail,
      guestName: input.guestName,
      startsAt,
      endsAt,
      notes: noteVal,
      prestationTitle: prestation.title,
      publicToken: cancellationToken ? buildPublicToken(cancellationToken) : null,
    });
  } catch (mailErr) {
    console.error("[pub/cannes-coiffeur/book] email", mailErr);
  }

  return NextResponse.json(
    {
      ok: true,
      recap: `${prestation.title} · ${formatParisTime(startsAt, "EEEE d MMMM yyyy · HH:mm")} — ${formatParisTime(endsAt, "HH:mm")} (Paris)`,
      dateParis: ymd,
    },
    { status: 201 }
  );
}
