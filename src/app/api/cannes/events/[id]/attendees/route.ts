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
  const { presenceId } = await req.json();

  const attendee = await prisma.cannesEventAttendee.upsert({
    where: { eventId_presenceId: { eventId, presenceId } },
    create: { eventId, presenceId },
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
