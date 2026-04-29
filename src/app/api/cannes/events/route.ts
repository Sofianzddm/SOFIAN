import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/cannes/auth";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const events = await prisma.cannesEvent.findMany({
    orderBy: [{ date: "asc" }, { startTime: "asc" }],
    include: {
      attendees: {
        include: {
          presence: {
            include: {
              user: { select: { id: true, prenom: true, nom: true, role: true } },
              talent: { select: { id: true, prenom: true, nom: true, photo: true } },
            },
          },
        },
      },
    },
  });

  return NextResponse.json(events);
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const user = session!.user as { id: string };

  const event = await prisma.cannesEvent.create({
    data: {
      date: new Date(body.date),
      startTime: body.startTime,
      endTime: body.endTime || null,
      title: body.title,
      type: body.type || "SOIREE",
      location: body.location,
      address: body.address || null,
      organizer: body.organizer || null,
      contactInfo: body.contactInfo || null,
      dressCode: body.dressCode || null,
      invitationLink: body.invitationLink || null,
      description: body.description || null,
      notes: body.notes || null,
      createdById: user.id,
    },
  });

  return NextResponse.json(event, { status: 201 });
}
