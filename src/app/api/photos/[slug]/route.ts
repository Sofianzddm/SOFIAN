import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { talentSlug } from "@/lib/talent-slug";

// Public (par slug nom/prénom, comme /kit/[slug]) : galerie des photos
// d'événements d'un talent.
export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  if (!slug) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  // Le slug n'est pas stocké en base : on le recalcule en mémoire sur les
  // talents non archivés, exactement comme la résolution du Kit Media.
  const talents = await prisma.talent.findMany({
    where: { isArchived: false },
    select: { id: true, prenom: true, nom: true },
  });

  const talent = talents.find(
    (t) => talentSlug(t.prenom, t.nom) === slug.toLowerCase()
  );

  if (!talent) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const tags = await prisma.eventPhotoTalent.findMany({
    where: { talentId: talent.id },
    select: {
      photo: {
        select: {
          id: true,
          imageUrl: true,
          position: true,
          source: true,
          createdAt: true,
          event: {
            select: { id: true, nom: true, date: true, lieu: true, logoUrl: true },
          },
        },
      },
    },
  });

  // Regroupe par événement
  type EventGroup = {
    id: string;
    nom: string;
    date: string | null;
    lieu: string | null;
    logoUrl: string | null;
    photos: { id: string; imageUrl: string; source: string }[];
    sortDate: number;
  };
  const groups = new Map<string, EventGroup>();

  for (const tag of tags) {
    const p = tag.photo;
    const ev = p.event;
    if (!groups.has(ev.id)) {
      groups.set(ev.id, {
        id: ev.id,
        nom: ev.nom,
        date: ev.date ? ev.date.toISOString() : null,
        lieu: ev.lieu,
        logoUrl: ev.logoUrl,
        photos: [],
        sortDate: (ev.date ?? p.createdAt).getTime(),
      });
    }
    groups
      .get(ev.id)!
      .photos.push({ id: p.id, imageUrl: p.imageUrl, source: p.source });
  }

  const events = Array.from(groups.values())
    .sort((a, b) => b.sortDate - a.sortDate)
    .map(({ sortDate: _sortDate, ...rest }) => rest);

  const totalPhotos = events.reduce((acc, e) => acc + e.photos.length, 0);

  return NextResponse.json({
    talent: { prenom: talent.prenom, nom: talent.nom },
    totalPhotos,
    events,
  });
}
