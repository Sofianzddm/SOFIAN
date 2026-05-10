import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import {
  COIFFEUR_PRESTATION_SLUG_RE,
} from "@/lib/cannes-coiffeur/availability";

export const dynamic = "force-dynamic";

/** Liste toutes les prestations (pour l’admin, y compris inactives). */
export async function GET() {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const rows = await prisma.cannesCoiffeurPrestation.findMany({
    orderBy: [{ sortOrder: "asc" }, { title: "asc" }],
  });

  return NextResponse.json(rows);
}

function normalizeSlug(s: string): string {
  return s
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

export async function POST(req: NextRequest) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const body = (await req.json().catch(() => ({}))) as {
    title?: string;
    slug?: string;
    durationMinutes?: number;
    bufferMinutes?: number;
    description?: string | null;
    sortOrder?: number;
    active?: boolean;
  };

  const title = body.title?.trim() ?? "";
  if (title.length < 2 || title.length > 120) {
    return NextResponse.json({ error: "titre invalide (2–120 caracteres)" }, { status: 400 });
  }

  let slug = body.slug?.trim() ? normalizeSlug(body.slug) : normalizeSlug(title);
  if (!COIFFEUR_PRESTATION_SLUG_RE.test(slug)) {
    return NextResponse.json(
      { error: "slug invalide (minuscules, chiffres, tirets)" },
      { status: 400 }
    );
  }

  const durationMinutes = Number(body.durationMinutes);
  const bufferMinutes = body.bufferMinutes !== undefined ? Number(body.bufferMinutes) : 5;
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5 || durationMinutes > 480) {
    return NextResponse.json({ error: "durationMinutes entre 5 et 480" }, { status: 400 });
  }
  if (!Number.isFinite(bufferMinutes) || bufferMinutes < 0 || bufferMinutes > 120) {
    return NextResponse.json({ error: "bufferMinutes entre 0 et 120" }, { status: 400 });
  }

  try {
    const row = await prisma.cannesCoiffeurPrestation.create({
      data: {
        title,
        slug,
        durationMinutes: Math.round(durationMinutes),
        bufferMinutes: Math.round(bufferMinutes),
        description: body.description?.trim() || null,
        sortOrder: Number.isFinite(body.sortOrder) ? Math.round(Number(body.sortOrder)) : 0,
        active: body.active !== false,
      },
    });
    return NextResponse.json(row, { status: 201 });
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
