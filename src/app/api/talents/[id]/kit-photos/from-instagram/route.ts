import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { v2 as cloudinary } from "cloudinary";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const KIT_PHOTOS_LENGTH = 10;

export const dynamic = "force-dynamic";
export const maxDuration = 60; // upload Cloudinary depuis une URL distante

function normalizeArray(arr: (string | null | undefined)[] | undefined) {
  const out: (string | null)[] = Array.from(
    { length: KIT_PHOTOS_LENGTH },
    () => null
  );
  if (Array.isArray(arr)) {
    for (let i = 0; i < KIT_PHOTOS_LENGTH; i++) {
      const v = arr[i];
      out[i] = typeof v === "string" && v.trim() ? v : null;
    }
  }
  return out;
}

/**
 * Vérifie que l'URL provient bien d'un CDN Instagram/Facebook, pour ne pas
 * permettre l'upload Cloudinary d'une URL arbitraire.
 */
function isInstagramCdnUrl(raw: string): boolean {
  try {
    const url = new URL(raw);
    if (url.protocol !== "https:") return false;
    const host = url.hostname.toLowerCase();
    return (
      host.endsWith("cdninstagram.com") ||
      host.endsWith("fbcdn.net") ||
      host.endsWith("instagram.com")
    );
  } catch {
    return false;
  }
}

/**
 * POST /api/talents/[id]/kit-photos/from-instagram
 * Body: { index: number, imageUrl: string }
 *
 * Re-upload sur Cloudinary une photo choisie dans la galerie Instagram
 * (les URLs Instagram étant éphémères) puis l'assigne au slot `index`.
 */
export async function POST(
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
    imageUrl?: string;
  };

  const index = Number(body.index);
  if (!Number.isInteger(index) || index < 0 || index >= KIT_PHOTOS_LENGTH) {
    return NextResponse.json(
      { error: `index invalide (0..${KIT_PHOTOS_LENGTH - 1})` },
      { status: 400 }
    );
  }

  const imageUrl = typeof body.imageUrl === "string" ? body.imageUrl.trim() : "";
  if (!imageUrl || !isInstagramCdnUrl(imageUrl)) {
    return NextResponse.json(
      { error: "URL Instagram invalide" },
      { status: 400 }
    );
  }

  const talent = await prisma.talent.findUnique({
    where: { id },
    select: { id: true, kitPhotos: true },
  });

  if (!talent) {
    return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
  }

  if (
    !process.env.CLOUDINARY_CLOUD_NAME ||
    !process.env.CLOUDINARY_API_KEY ||
    !process.env.CLOUDINARY_API_SECRET
  ) {
    return NextResponse.json(
      { error: "Cloudinary non configuré" },
      { status: 500 }
    );
  }

  let secureUrl: string;
  try {
    const uploaded = await cloudinary.uploader.upload(imageUrl, {
      folder: "glowup-talents",
      public_id: `${talent.id}-ig-${index}-${Date.now()}`,
      resource_type: "image",
    });
    secureUrl = uploaded.secure_url;
  } catch (err) {
    console.error("[kit-photos/from-instagram] Upload failed:", err);
    return NextResponse.json(
      { error: "Erreur lors de l'upload de la photo Instagram" },
      { status: 502 }
    );
  }

  const current = normalizeArray(talent.kitPhotos as (string | null)[]);
  current[index] = secureUrl;

  await prisma.talent.update({
    where: { id: talent.id },
    data: { kitPhotos: current.map((v) => v ?? "") },
  });

  return NextResponse.json({ kitPhotos: current });
}
