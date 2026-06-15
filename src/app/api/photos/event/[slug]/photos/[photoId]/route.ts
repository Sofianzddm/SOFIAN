import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

async function resolveEventId(slug: string): Promise<string | null> {
  const event = await prisma.photoEvent.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true },
  });
  return event?.id ?? null;
}

// PATCH public (scellé par slug) : met à jour les talents tagués sur une photo.
// Body : { talentIds: string[] }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ slug: string; photoId: string }> }
) {
  const { slug, photoId } = await params;
  const eventId = await resolveEventId(slug);
  if (!eventId) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const photo = await prisma.eventPhoto.findFirst({
    where: { id: photoId, eventId },
    select: { id: true },
  });
  if (!photo) {
    return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    talentIds?: string[];
  };
  const talentIds = Array.isArray(body.talentIds)
    ? Array.from(new Set(body.talentIds.filter((t) => typeof t === "string")))
    : [];

  await prisma.$transaction([
    prisma.eventPhotoTalent.deleteMany({ where: { photoId } }),
    prisma.eventPhotoTalent.createMany({
      data: talentIds.map((talentId) => ({ photoId, talentId })),
      skipDuplicates: true,
    }),
  ]);

  return NextResponse.json({ ok: true, talentIds });
}

// DELETE public (scellé par slug) : supprime une photo de l'événement.
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string; photoId: string }> }
) {
  const { slug, photoId } = await params;
  const eventId = await resolveEventId(slug);
  if (!eventId) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  await prisma.eventPhoto
    .deleteMany({ where: { id: photoId, eventId } })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
