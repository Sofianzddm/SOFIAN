import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import { sendCoiffeurBookingCancellationEmail } from "@/lib/cannes-coiffeur/coiffeurBookingEmails";
import { CannesCoiffeurBookingStatus } from "@prisma/client";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const { id } = await params;

  const booking = await prisma.cannesCoiffeurBooking.findUnique({
    where: { id },
    include: {
      slot: true,
      prestation: { select: { title: true } },
      talent: { select: { email: true, prenom: true, nom: true } },
    },
  });
  if (!booking) {
    return NextResponse.json({ error: "Reservation introuvable" }, { status: 404 });
  }
  if (booking.status === CannesCoiffeurBookingStatus.CANCELLED) {
    return NextResponse.json({ error: "Deja annulee" }, { status: 400 });
  }

  const updated = await prisma.cannesCoiffeurBooking.update({
    where: { id },
    data: {
      status: CannesCoiffeurBookingStatus.CANCELLED,
      cancelledAt: new Date(),
      cancelledBy: "staff",
    },
    include: {
      talent: { select: { id: true, prenom: true, nom: true } },
      slot: true,
    },
  });

  try {
    const guestEmail = booking.guestEmail?.trim().toLowerCase() || "";
    const guestName = booking.guestName?.trim() || "";
    const recipientEmail =
      guestEmail ||
      booking.talent?.email?.trim().toLowerCase() ||
      "";
    const recipientName =
      guestName ||
      (booking.talent ? `${booking.talent.prenom} ${booking.talent.nom}`.trim() : "") ||
      "Client";

    await sendCoiffeurBookingCancellationEmail({
      recipientEmail,
      recipientName,
      startsAt: booking.slot.startsAt,
      endsAt: booking.slot.endsAt,
      prestationTitle: booking.prestation?.title ?? null,
      stylistMeta: {
        cancelSource: "staff",
        guestEmail: guestEmail || booking.talent?.email?.trim().toLowerCase() || null,
        notes: booking.notes ?? null,
      },
    });
  } catch (mailErr) {
    console.error("[cannes/coiffeur/bookings PATCH] email annulation", mailErr);
  }

  return NextResponse.json(updated);
}
