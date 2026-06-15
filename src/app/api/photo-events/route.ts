import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/requireAdmin";
import { uniqueEventSlug } from "@/lib/event-slug";

// GET : liste des événements (avec nombre de photos)
export async function GET(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const events = await prisma.photoEvent.findMany({
    orderBy: [{ date: "desc" }, { createdAt: "desc" }],
    include: {
      _count: { select: { photos: true } },
    },
  });

  return NextResponse.json({
    events: events.map((e) => ({
      id: e.id,
      nom: e.nom,
      date: e.date,
      lieu: e.lieu,
      logoUrl: e.logoUrl,
      createdAt: e.createdAt,
      photoCount: e._count.photos,
    })),
  });
}

// POST : crée un événement. Body : { nom, date?, lieu? }
export async function POST(request: NextRequest) {
  const session = await requireAdmin(request);
  if (!session) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as {
    nom?: string;
    date?: string | null;
    lieu?: string | null;
    logoUrl?: string | null;
  };

  const nom = (body.nom || "").trim();
  if (!nom) {
    return NextResponse.json({ error: "Le nom est requis" }, { status: 400 });
  }

  const slug = await uniqueEventSlug(nom);

  const event = await prisma.photoEvent.create({
    data: {
      nom,
      slug,
      date: body.date ? new Date(body.date) : null,
      lieu: body.lieu?.trim() || null,
      logoUrl: body.logoUrl?.trim() || null,
      createdById: session.user.id,
    },
  });

  return NextResponse.json({ event });
}
