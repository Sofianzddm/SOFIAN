import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";

// PATCH : met à jour les talents tagués sur une photo. Body : { talentIds: string[] }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id, photoId } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    talentIds?: string[];
  };

  const photo = await prisma.eventPhoto.findFirst({
    where: { id: photoId, eventId: id },
    select: { id: true },
  });
  if (!photo) {
    return NextResponse.json({ error: "Photo introuvable" }, { status: 404 });
  }

  const talentIds = Array.isArray(body.talentIds)
    ? Array.from(new Set(body.talentIds.filter((t) => typeof t === "string")))
    : [];

  // Remplace l'ensemble des tags en une transaction
  await prisma.$transaction([
    prisma.eventPhotoTalent.deleteMany({ where: { photoId } }),
    prisma.eventPhotoTalent.createMany({
      data: talentIds.map((talentId) => ({ photoId, talentId })),
      skipDuplicates: true,
    }),
  ]);

  return NextResponse.json({ ok: true, talentIds });
}

// DELETE : supprime une photo
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; photoId: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id, photoId } = await params;
  await prisma.eventPhoto
    .deleteMany({ where: { id: photoId, eventId: id } })
    .catch(() => null);

  return NextResponse.json({ ok: true });
}
