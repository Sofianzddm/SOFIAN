import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { CannesCoiffeurBookingStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { parsePublicToken } from "@/lib/cannes-coiffeur/cancellationToken";
import { checkRateLimit, getClientIp, isRateLimitBypassed } from "@/lib/cannes-coiffeur/rateLimit";
import { sendCoiffeurBookingCancellationEmails } from "@/lib/cannes-coiffeur/coiffeurBookingEmails";

export const dynamic = "force-dynamic";

const cancelSchema = z.object({
  t: z.string().min(10),
});

export async function POST(req: NextRequest) {
  const ip = getClientIp(req);
  if (!isRateLimitBypassed(ip)) {
    const limit = checkRateLimit({ key: `cancel:${ip}`, max: 10, windowMs: 10 * 60 * 1000 });
    if (!limit.allowed) {
      const retryAfter = Math.max(1, Math.ceil((limit.resetAt - Date.now()) / 1000));
      return NextResponse.json(
        { error: "Trop de tentatives. Merci de réessayer dans quelques instants.", retryAfter },
        { status: 429, headers: { "Retry-After": String(retryAfter) } }
      );
    }
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "JSON invalide" }, { status: 400 });
  }

  const parsedBody = cancelSchema.safeParse(body);
  if (!parsedBody.success) {
    return NextResponse.json({ error: "Paramètres invalides" }, { status: 400 });
  }

  const parsedToken = parsePublicToken(parsedBody.data.t);
  if (!parsedToken.valid || !parsedToken.token) {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }

  const result = await prisma.$transaction(async (tx) => {
    const booking = await tx.cannesCoiffeurBooking.findUnique({
      where: { cancellationToken: parsedToken.token },
      include: {
        slot: true,
        prestation: { select: { title: true } },
        talent: { select: { email: true, prenom: true, nom: true } },
      },
    });

    if (!booking) return { kind: "not_found" as const };
    if (booking.cancelledAt || booking.status === CannesCoiffeurBookingStatus.CANCELLED) {
      return { kind: "already_cancelled" as const };
    }
    if (booking.slot.startsAt.getTime() < Date.now()) {
      return { kind: "past" as const };
    }

    const now = new Date();
    const updated = await tx.cannesCoiffeurBooking.update({
      where: { id: booking.id },
      data: {
        status: CannesCoiffeurBookingStatus.CANCELLED,
        cancelledAt: now,
        cancelledBy: "talent",
      },
      include: {
        slot: true,
        prestation: { select: { title: true } },
        talent: { select: { email: true, prenom: true, nom: true } },
      },
    });

    if (!booking.slot.createdById) {
      await tx.cannesCoiffeurSlot.update({
        where: { id: booking.slotId },
        data: { cancelledAt: now },
      });
    }

    return { kind: "cancelled" as const, booking: updated };
  });

  if (result.kind === "not_found") {
    return NextResponse.json({ status: "not_found" }, { status: 404 });
  }
  if (result.kind === "already_cancelled") {
    return NextResponse.json({ ok: true, status: "cancelled" });
  }
  if (result.kind === "past") {
    return NextResponse.json(
      { error: "Cette réservation est déjà passée, impossible de l'annuler." },
      { status: 400 }
    );
  }

  try {
    const booking = result.booking;
    const guestEmail = booking.guestEmail?.trim().toLowerCase() || "";
    const guestName = booking.guestName?.trim() || "";
    const recipientEmail = guestEmail || booking.talent?.email?.trim().toLowerCase() || "";
    const recipientName =
      guestName || (booking.talent ? `${booking.talent.prenom} ${booking.talent.nom}`.trim() : "");
    if (recipientEmail.includes("@") && recipientName) {
      await sendCoiffeurBookingCancellationEmails({
        recipientEmail,
        recipientName,
        startsAt: booking.slot.startsAt,
        endsAt: booking.slot.endsAt,
        prestationTitle: booking.prestation?.title ?? null,
      });
    }
  } catch (mailErr) {
    console.error("[pub/cannes-coiffeur/cancel] email annulation", mailErr);
  }

  return NextResponse.json({ ok: true, status: "cancelled" });
}
