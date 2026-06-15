import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// POST public (scellé par slug) : ajoute une photo à l'événement.
// Body : { imageUrl, talentIds? }
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const event = await prisma.photoEvent.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    imageUrl?: string;
    talentIds?: string[];
    source?: string;
  };

  const imageUrl = (body.imageUrl || "").trim();
  if (!imageUrl) {
    return NextResponse.json({ error: "imageUrl requis" }, { status: 400 });
  }

  const source = body.source === "INDIVIDUEL" ? "INDIVIDUEL" : "OFFICIELLE";

  const count = await prisma.eventPhoto.count({ where: { eventId: event.id } });
  const talentIds = Array.isArray(body.talentIds)
    ? Array.from(new Set(body.talentIds.filter((t) => typeof t === "string")))
    : [];

  const photo = await prisma.eventPhoto.create({
    data: {
      eventId: event.id,
      imageUrl,
      position: count,
      source,
      talents: { create: talentIds.map((talentId) => ({ talentId })) },
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
      source: photo.source,
      talentIds: photo.talents.map((t) => t.talentId),
      talents: photo.talents.map((t) => ({
        id: t.talent.id,
        prenom: t.talent.prenom,
        nom: t.talent.nom,
      })),
    },
  });
}
