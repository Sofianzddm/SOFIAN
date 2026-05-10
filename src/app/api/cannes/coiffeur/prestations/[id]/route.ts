import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import { COIFFEUR_PRESTATION_SLUG_RE } from "@/lib/cannes-coiffeur/availability";

export const dynamic = "force-dynamic";

function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;
  const { id } = await params;

  const existing = await prisma.cannesCoiffeurPrestation.findUnique({ where: { id } });
  if (!existing) return NextResponse.json({ error: "Introuvable" }, { status: 404 });

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    slug?: string;
    durationMinutes?: number;
    bufferMinutes?: number;
    description?: string | null;
    sortOrder?: number;
    active?: boolean;
  };

  const title = body.title !== undefined ? body.title.trim() : existing.title;
  if (title.length < 2 || title.length > 120) {
    return NextResponse.json({ error: "titre invalide" }, { status: 400 });
  }

  let slug = existing.slug;
  if (body.slug !== undefined) {
    slug = normalizeSlug(body.slug || title);
    if (!COIFFEUR_PRESTATION_SLUG_RE.test(slug)) {
      return NextResponse.json({ error: "slug invalide" }, { status: 400 });
    }
  }

  const durationMinutes =
    body.durationMinutes !== undefined ? Number(body.durationMinutes) : existing.durationMinutes;
  const bufferMinutes =
    body.bufferMinutes !== undefined ? Number(body.bufferMinutes) : existing.bufferMinutes;

  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    return NextResponse.json({ error: "durationMinutes entre 5 et 480" }, { status: 400 });
  }
  if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) {
    return NextResponse.json({ error: "bufferMinutes entre 0 et 120" }, { status: 400 });
  }

  try {
    const row = await prisma.cannesCoiffeurPrestation.update({
      where: { id },
      data: {
        title,
        slug,
        durationMinutes: Math.round(durationMinutes),
        bufferMinutes: Math.round(bufferMinutes),
        description:
          body.description === undefined ? existing.description : body.description?.trim() || null,
        sortOrder:
          body.sortOrder !== undefined && Number.isFinite(body.sortOrder)
            ? Math.round(Number(body.sortOrder))
            : existing.sortOrder,
        active: body.active !== undefined ? Boolean(body.active) : existing.active,
      },
    });
    return NextResponse.json(row);
  } catch (e: unknown) {
    if (
      typeof e === "object" &&
      e !== null &&
      "code" in e &&
      (e as { code: string }).code === "P2002"
    ) {
      return NextResponse.json({ error: "Ce slug existe deja" }, { status: 409 });
    }
    throw e;
  }
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;
  const { id } = await params;

  const nb = await prisma.cannesCoiffeurAvailability.count({ where: { prestationId: id } });
  if (nb > 0) {
    return NextResponse.json(
      {
        error: `Cette prestation est encore liée à ${nb} règle(s) dans « Disponibilités ». Modifie ou supprime ces lignes (autre prestation), puis réessaie. Tu peux aussi la désactiver : elle disparaît du lien public sans être supprimée.`,
      },
      { status: 409 }
    );
  }

  try {
    await prisma.cannesCoiffeurPrestation.delete({ where: { id } });
  } catch {
    return NextResponse.json({ error: "Introuvable" }, { status: 404 });
  }

  return NextResponse.json({ ok: true });
}
