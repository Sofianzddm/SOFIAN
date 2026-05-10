import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";

function overlapWhere(startsAt: Date, endsAt: Date) {
  return {
    cancelledAt: null as Date | null,
    AND: [{ startsAt: { lt: endsAt } }, { endsAt: { gt: startsAt } }],
  };
}

export async function POST(req: NextRequest) {
  const { session, error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const body = (await req.json()) as {
    startsAt?: string;
    endsAt?: string;
    label?: string | null;
  };

  const startsAt = body.startsAt ? new Date(body.startsAt) : null;
  const endsAt = body.endsAt ? new Date(body.endsAt) : null;
  if (!startsAt || Number.isNaN(startsAt.getTime()) || !endsAt || Number.isNaN(endsAt.getTime())) {
    return NextResponse.json({ error: "startsAt et endsAt ISO requis" }, { status: 400 });
  }
  if (endsAt <= startsAt) {
    return NextResponse.json({ error: "La fin doit etre apres le debut" }, { status: 400 });
  }

  const clash = await prisma.cannesCoiffeurSlot.findFirst({
    where: overlapWhere(startsAt, endsAt),
  });
  if (clash) {
    return NextResponse.json({ error: "Chevauchement avec un autre creneau actif" }, { status: 409 });
  }

  const userId = session!.user.id as string;

  const slot = await prisma.cannesCoiffeurSlot.create({
    data: {
      startsAt,
      endsAt,
      label: body.label?.trim() || null,
      createdById: userId,
    },
    include: {
      booking: {
        include: { talent: { select: { id: true, prenom: true, nom: true } } },
      },
    },
  });

  return NextResponse.json(slot, { status: 201 });
}
