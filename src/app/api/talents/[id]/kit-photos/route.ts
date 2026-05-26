import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const KIT_PHOTOS_LENGTH = 10;

function normalizeArray(arr: (string | null | undefined)[] | undefined) {
  const out: (string | null)[] = Array.from({ length: KIT_PHOTOS_LENGTH }, () => null);
  if (Array.isArray(arr)) {
    for (let i = 0; i < KIT_PHOTOS_LENGTH; i++) {
      const v = arr[i];
      out[i] = typeof v === "string" && v.trim() ? v : null;
    }
  }
  return out;
}

// GET : retourne le tableau des 10 slots (toujours longueur 10, null pour les vides)
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const talent = await prisma.talent.findUnique({
    where: { id },
    select: { kitPhotos: true },
  });

  if (!talent) {
    return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
  }

  return NextResponse.json({
    kitPhotos: normalizeArray(talent.kitPhotos as (string | null)[]),
  });
}

// PATCH : modifie un slot (ajoute / supprime). Body : { index: number, url: string | null }
export async function PATCH(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    index?: number;
    url?: string | null;
  };

  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= KIT_PHOTOS_LENGTH) {
    return NextResponse.json(
      { error: `index invalide (0..${KIT_PHOTOS_LENGTH - 1})` },
      { status: 400 }
    );
  }

  const talent = await prisma.talent.findUnique({
    where: { id },
    select: { kitPhotos: true },
  });

  if (!talent) {
    return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
  }

  const current = normalizeArray(talent.kitPhotos as (string | null)[]);
  current[index] = typeof body.url === "string" && body.url.trim() ? body.url : null;

  // Prisma n'accepte pas `null` dans un String[] : on remplace les null par "" et on filtre
  // au retour côté API publique. C'est plus simple que de stocker un tableau compact.
  await prisma.talent.update({
    where: { id },
    data: {
      kitPhotos: current.map((v) => v ?? ""),
    },
  });

  return NextResponse.json({ kitPhotos: current });
}

// PUT : remplace tout le tableau d'un coup. Body : { kitPhotos: (string|null)[] }
export async function PUT(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as {
    kitPhotos?: (string | null)[];
  };

  const next = normalizeArray(body.kitPhotos);

  const talent = await prisma.talent.findUnique({
    where: { id },
    select: { id: true },
  });

  if (!talent) {
    return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
  }

  await prisma.talent.update({
    where: { id },
    data: { kitPhotos: next.map((v) => v ?? "") },
  });

  return NextResponse.json({ kitPhotos: next });
}
