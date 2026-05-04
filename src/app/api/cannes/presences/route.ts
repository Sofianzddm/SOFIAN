import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/cannes/auth";

export async function GET() {
  const { error } = await requireSession();
  if (error) return error;

  const presences = await prisma.cannesPresence.findMany({
    orderBy: [{ arrivalDate: "asc" }],
    include: {
      user: { select: { id: true, prenom: true, nom: true, role: true } },
      talent: {
        select: {
          id: true,
          prenom: true,
          nom: true,
          photo: true,
          instagram: true,
          tiktok: true,
        },
      },
      teamUnavailabilities: { orderBy: { startDate: "asc" } },
    },
  });

  return NextResponse.json(presences);
}

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  const body = await req.json();
  const presence = await prisma.cannesPresence.create({
    data: {
      userId: body.userId || null,
      talentId: body.talentId || null,
      arrivalDate: new Date(body.arrivalDate),
      departureDate: new Date(body.departureDate),
      hotel: body.hotel || null,
      hotelAddress: body.hotelAddress || null,
      flightArrival: body.flightArrival || null,
      flightDeparture: body.flightDeparture || null,
      roomNumber: body.roomNumber || null,
      notes: body.notes || null,
    },
  });

  return NextResponse.json(presence, { status: 201 });
}
