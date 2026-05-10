import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";

export const dynamic = "force-dynamic";

/** Slots + réservation confirmée éventuelle (vue planning coiffeur). */
export async function GET(req: NextRequest) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const { searchParams } = new URL(req.url);
  const from = searchParams.get("from");
  const to = searchParams.get("to");

  const slots = await prisma.cannesCoiffeurSlot.findMany({
    where: {
      ...(from ? { endsAt: { gte: new Date(from) } } : {}),
      ...(to ? { startsAt: { lte: new Date(to) } } : {}),
    },
    orderBy: [{ startsAt: "asc" }],
    include: {
      booking: {
        include: {
          talent: { select: { id: true, prenom: true, nom: true } },
          prestation: { select: { id: true, title: true, slug: true } },
        },
      },
      createdBy: { select: { id: true, prenom: true, nom: true } },
    },
  });

  return NextResponse.json(slots);
}
