import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

// Public (lien privé non indexé) : toutes les photos d'un événement.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const event = await prisma.photoEvent.findUnique({
    where: { slug: slug.toLowerCase() },
    select: {
      id: true,
      nom: true,
      date: true,
      lieu: true,
      logoUrl: true,
      photos: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        select: { id: true, imageUrl: true },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  return NextResponse.json({
    event: {
      nom: event.nom,
      date: event.date ? event.date.toISOString() : null,
      lieu: event.lieu,
      logoUrl: event.logoUrl,
    },
    totalPhotos: event.photos.length,
    photos: event.photos.map((p) => ({ id: p.id, imageUrl: p.imageUrl })),
  });
}
