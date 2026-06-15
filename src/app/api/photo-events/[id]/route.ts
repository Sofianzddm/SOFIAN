import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { uniqueEventSlug } from "@/lib/event-slug";

// GET : détail d'un événement (photos + tags talents + options de talents)
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;

  const event = await prisma.photoEvent.findUnique({
    where: { id },
    include: {
      photos: {
        orderBy: [{ position: "asc" }, { createdAt: "asc" }],
        include: {
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
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }

  // Filet de sécurité : un événement créé avant l'ajout des slugs n'en a pas.
  let slug = event.slug;
  if (!slug) {
    slug = await uniqueEventSlug(event.nom, event.id);
    await prisma.photoEvent
      .update({ where: { id: event.id }, data: { slug } })
      .catch(() => null);
  }

  // Options de talents pour le tagging (tous les talents non archivés)
  const talentOptions = await prisma.talent.findMany({
    where: { isArchived: false },
    select: { id: true, prenom: true, nom: true, photo: true },
    orderBy: [{ prenom: "asc" }, { nom: "asc" }],
  });

  return NextResponse.json({
    event: {
      id: event.id,
      nom: event.nom,
      slug,
      date: event.date,
      lieu: event.lieu,
      logoUrl: event.logoUrl,
      createdAt: event.createdAt,
      photos: event.photos.map((p) => ({
        id: p.id,
        imageUrl: p.imageUrl,
        position: p.position,
        source: p.source,
        talentIds: p.talents.map((t) => t.talentId),
        talents: p.talents.map((t) => ({
          id: t.talent.id,
          prenom: t.talent.prenom,
          nom: t.talent.nom,
        })),
      })),
    },
    talentOptions,
  });
}

// PATCH : modifie un événement. Body : { nom?, date?, lieu? }
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as {
    nom?: string;
    date?: string | null;
    lieu?: string | null;
    logoUrl?: string | null;
  };

  const data: {
    nom?: string;
    date?: Date | null;
    lieu?: string | null;
    logoUrl?: string | null;
  } = {};
  if (typeof body.nom === "string") {
    const nom = body.nom.trim();
    if (!nom) {
      return NextResponse.json({ error: "Le nom est requis" }, { status: 400 });
    }
    data.nom = nom;
  }
  if (body.date !== undefined) {
    data.date = body.date ? new Date(body.date) : null;
  }
  if (body.lieu !== undefined) {
    data.lieu = body.lieu?.trim() || null;
  }
  if (body.logoUrl !== undefined) {
    data.logoUrl = body.logoUrl?.trim() || null;
  }

  const event = await prisma.photoEvent
    .update({ where: { id }, data })
    .catch(() => null);

  if (!event) {
    return NextResponse.json({ error: "Événement introuvable" }, { status: 404 });
  }

  return NextResponse.json({ event });
}

// DELETE : supprime un événement (cascade photos + tags)
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const { id } = await params;
  await prisma.photoEvent.delete({ where: { id } }).catch(() => null);

  return NextResponse.json({ ok: true });
}
