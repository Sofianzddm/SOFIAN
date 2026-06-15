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
        select: {
          id: true,
          imageUrl: true,
          source: true,
          talents: {
            include: {
              talent: { select: { id: true, prenom: true, nom: true } },
            },
          },
        },
      },
    },
  });

  if (!event) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  // Liste des talents disponibles pour l'identification (mention multi-talents).
  const talentOptions = await prisma.talent.findMany({
    where: { isArchived: false },
    select: { id: true, prenom: true, nom: true, photo: true },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  return NextResponse.json({
    event: {
      id: event.id,
      nom: event.nom,
      date: event.date ? event.date.toISOString() : null,
      lieu: event.lieu,
      logoUrl: event.logoUrl,
    },
    totalPhotos: event.photos.length,
    photos: event.photos.map((p) => ({
      id: p.id,
      imageUrl: p.imageUrl,
      source: p.source,
      talentIds: p.talents.map((t) => t.talentId),
      talents: p.talents.map((t) => ({
        id: t.talent.id,
        prenom: t.talent.prenom,
        nom: t.talent.nom,
      })),
    })),
    talentOptions,
  });
}
