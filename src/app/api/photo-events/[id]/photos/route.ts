import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

// POST : ajoute une photo à l'événement. Body : { imageUrl, talentIds? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    imageUrl?: string;
    talentIds?: string[];
  };

  const imageUrl = (body.imageUrl || "").trim();
  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl requis" }, { status: 400 });
  }

  const event = await prisma.photoEvent.findUnique({
    where: { id },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }

  const count = await prisma.eventPhoto.count({ where: { eventId: id } });
  const talentIds = Array.isArray(body.talentIds)
    ? Array.from(new Set(body.talentIds.filter((t) => typeof t === "string")))
    : [];

  const photo = await prisma.eventPhoto.create({
    data: {
      eventId: id,
      imageUrl,
      position: count,
      talents: {
        create: talentIds.map((talentId) => ({ talentId })),
      },
    },
    include: {
      talents: {
        include: { talent: { select: { id: true, prenom: true, nom: true } } },
      },
    },
  });

  return NextResponse.json({
    photo: {
      id: photo.id,
      imageUrl: photo.imageUrl,
      position: photo.position,
      talentIds: photo.talents.map((t) => t.talentId),
      talents: photo.talents.map((t) => ({
        id: t.talent.id,
        prenom: t.talent.prenom,
        nom: t.talent.nom,
      })),
    },
  });
}
