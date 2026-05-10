import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import { sendCoiffeurBookingConfirmationEmails } from "@/lib/cannes-coiffeur/coiffeurBookingEmails";
import { CannesCoiffeurBookingStatus } from "@prisma/client";
import { generateCancellationToken } from "@/lib/cannes-coiffeur/cancellationToken";

export async function POST(req: NextRequest) {
  const { session, error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const body = (await req.json()) as {
    slotId?: string;
    guestName?: string | null;
    guestEmail?: string | null;
    notes?: string | null;
  };

  const slotId = body.slotId?.trim();
  if (!slotId) {
    return NextResponse.json({ error: "slotId requis" }, { status: 400 });
  }

  const guestName = body.guestName?.trim() || null;
  const guestEmailRaw = body.guestEmail?.trim();
  const guestEmail = guestEmailRaw ? guestEmailRaw.toLowerCase() : null;

  if (!guestName || !guestEmail) {
    return NextResponse.json({ error: "Nom et email requis (reservation sans compte)" }, { status: 400 });
  }

  const slot = await prisma.cannesCoiffeurSlot.findUnique({
    where: { id: slotId },
    include: {
      booking: true,
    },
  });

  if (!slot || slot.cancelledAt) {
    return NextResponse.json({ error: "Creneau indisponible" }, { status: 400 });
  }

  const active = slot.booking?.status === CannesCoiffeurBookingStatus.CONFIRMED;
  if (active) {
    return NextResponse.json({ error: "Ce creneau est deja reserve" }, { status: 409 });
  }

  const userId = session!.user.id as string;

  const booking = await prisma.$transaction(async (tx) => {
    if (
      slot.booking &&
      slot.booking.status === CannesCoiffeurBookingStatus.CANCELLED
    ) {
      return tx.cannesCoiffeurBooking.update({
        where: { id: slot.booking.id },
        data: {
          talentId: null,
          guestName,
          guestEmail,
          notes: body.notes?.trim() || null,
          status: CannesCoiffeurBookingStatus.CONFIRMED,
          cancelledAt: null,
          cancelledBy: null,
          cancellationToken: slot.booking.cancellationToken ?? generateCancellationToken(),
          createdById: userId,
        },
        include: {
          slot: true,
          prestation: { select: { title: true } },
        },
      });
    }

    return tx.cannesCoiffeurBooking.create({
      data: {
        slotId,
        talentId: null,
        guestName,
        guestEmail,
        notes: body.notes?.trim() || null,
        createdById: userId,
        cancellationToken: generateCancellationToken(),
      },
      include: {
        slot: true,
        prestation: { select: { title: true } },
      },
    });
  });

  try {
    const notifyEmail = booking.guestEmail?.trim().toLowerCase() || "";
    const notifyName = booking.guestName?.trim() || "";
    if (notifyEmail.includes("@") && notifyName) {
      await sendCoiffeurBookingConfirmationEmails({
        guestEmail: notifyEmail,
        guestName: notifyName,
        startsAt: booking.slot.startsAt,
        endsAt: booking.slot.endsAt,
        notes: booking.notes,
        prestationTitle: booking.prestation?.title ?? null,
      });
    }
  } catch (mailErr) {
    console.error("[cannes/coiffeur/bookings POST] confirmation email", mailErr);
  }

  return NextResponse.json(booking, { status: 201 });
}
