import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import { CannesCoiffeurBookingStatus } from "@prisma/client";

export async function PATCH(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const { id } = await params;

  const slot = await prisma.cannesCoiffeurSlot.findUnique({
    where: { id },
    include: { booking: true },
  });

  if (!slot) {
    return NextResponse.json({ error: "Creneau introuvable" }, { status: 404 });
  }
  if (slot.cancelledAt) {
    return NextResponse.json({ error: "Creneau deja annule" }, { status: 400 });
  }
  if (slot.booking?.status === CannesCoiffeurBookingStatus.CONFIRMED) {
    return NextResponse.json(
      { error: "Annulez dabord la reservation sur ce creneau" },
      { status: 409 }
    );
  }

  const updated = await prisma.cannesCoiffeurSlot.update({
    where: { id },
    data: { cancelledAt: new Date() },
    include: {
      booking: {
        include: { talent: { select: { id: true, prenom: true, nom: true } } },
      },
    },
  });

  return NextResponse.json(updated);
}
