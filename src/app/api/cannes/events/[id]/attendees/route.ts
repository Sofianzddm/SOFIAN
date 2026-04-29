import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/cannes/auth";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: eventId } = await params;
  const { presenceId, talentId, userId, eventDate } = await req.json();

  let resolvedPresenceId = presenceId as string | undefined;

  if (!resolvedPresenceId && (talentId || userId) && eventDate) {
    const dayStart = new Date(`${eventDate}T00:00:00.000Z`);
    const dayEnd = new Date(`${eventDate}T23:59:59.999Z`);

    const existingPresence = await prisma.cannesPresence.findFirst({
      where: {
        talentId: talentId || null,
        userId: userId || null,
        arrivalDate: { lte: dayEnd },
        departureDate: { gte: dayStart },
      },
      select: { id: true },
    });

    if (existingPresence) {
      resolvedPresenceId = existingPresence.id;
    } else {
      const createdPresence = await prisma.cannesPresence.create({
        data: {
          talentId: talentId || null,
          userId: userId || null,
          arrivalDate: dayStart,
          departureDate: dayEnd,
        },
        select: { id: true },
      });
      resolvedPresenceId = createdPresence.id;
    }
  }

  if (!resolvedPresenceId) {
    return NextResponse.json(
      { error: "presenceId ou talentId/userId + eventDate requis" },
      { status: 400 }
    );
  }

  const attendee = await prisma.cannesEventAttendee.upsert({
    where: { eventId_presenceId: { eventId, presenceId: resolvedPresenceId } },
    create: { eventId, presenceId: resolvedPresenceId },
    update: {},
  });

  return NextResponse.json(attendee, { status: 201 });
}

export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireAdmin();
  if (error) return error;

  const { id: eventId } = await params;
  const { searchParams } = new URL(req.url);
  const presenceId = searchParams.get("presenceId");

  if (!presenceId) {
    return NextResponse.json({ error: "presenceId requis" }, { status: 400 });
  }

  await prisma.cannesEventAttendee.delete({
    where: { eventId_presenceId: { eventId, presenceId } },
  });

  return NextResponse.json({ ok: true });
}
