import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Emplacements de screenshots supportés :
//  - Stories  : views30d / views7d / linkClicks30d
//  - Démographie : geo / age / pays / ville
const ALLOWED_SLOTS = [
  "views30d",
  "views7d",
  "linkClicks30d",
  "geo",
  "age",
  "pays",
  "ville",
] as const;
type Slot = (typeof ALLOWED_SLOTS)[number];

// Reconstruit un objet complet { slot: string[] } à partir de la valeur JSON
// stockée, en gérant l'ancien format (tableau simple = anciennes stories 30j)
// et en préservant tous les slots existants.
function normalizeScreens(existing: unknown): Record<Slot, string[]> {
  const base = Object.fromEntries(
    ALLOWED_SLOTS.map((s) => [s, [] as string[]])
  ) as Record<Slot, string[]>;

  if (Array.isArray(existing)) {
    base.views30d = existing.filter((u): u is string => typeof u === "string");
  } else if (existing && typeof existing === "object") {
    const obj = existing as Record<string, unknown>;
    for (const s of ALLOWED_SLOTS) {
      base[s] = Array.isArray(obj[s])
        ? (obj[s] as unknown[]).filter((u): u is string => typeof u === "string")
        : [];
    }
  }
  return base;
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const role = session.user.role;
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"].includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: talentId } = await params;

    const formData = await request.formData();
    const slot = formData.get("slot") as Slot | null;
    const files = formData.getAll("files") as File[];

    if (!slot || !ALLOWED_SLOTS.includes(slot)) {
      return NextResponse.json({ error: "Slot invalide" }, { status: 400 });
    }

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "Aucun fichier reçu" }, { status: 400 });
    }

    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true },
    });

    if (!talent) {
      return NextResponse.json({ error: "Talent non trouvé" }, { status: 404 });
    }

    const uploadedUrls: string[] = [];

    for (const file of files) {
      if (!file.type.startsWith("image/")) {
        continue;
      }
      const bytes = await file.arrayBuffer();
      const buffer = Buffer.from(bytes);
      const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

      const result = await cloudinary.uploader.upload(base64, {
        folder: "glowup-talent-stories",
        public_id: `${talentId}-story-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
      });

      if (result.secure_url) {
        uploadedUrls.push(result.secure_url);
      }
    }

    if (uploadedUrls.length === 0) {
      return NextResponse.json(
        { error: "Aucun screenshot valide uploadé sur Cloudinary" },
        { status: 400 }
      );
    }

    // Récupérer l'état actuel des screenshots
    const stats = await prisma.talentStats.findUnique({
      where: { talentId },
    });

    const base = normalizeScreens(stats?.storyScreenshots);

    // Ajouter les nouvelles URLs au slot existant (bouton + = ajout)
    base[slot] = [...base[slot], ...uploadedUrls];

    await prisma.talentStats.upsert({
      where: { talentId },
      update: { storyScreenshots: base },
      create: { talentId, storyScreenshots: base },
    });

    return NextResponse.json({ success: true, ...base });
  } catch (error) {
    console.error("Erreur upload screenshots stories (API):", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload des screenshots" },
      { status: 500 }
    );
  }
}

// PATCH : mettre à jour la liste des URLs d'un slot (supprimer une ou plusieurs images)
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const role = session.user.role;
    if (!["ADMIN", "HEAD_OF", "HEAD_OF_INFLUENCE", "TM"].includes(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const { id: talentId } = await params;
    const body = await request.json();
    const slot = body.slot as Slot | null;
    const urls = Array.isArray(body.urls)
      ? body.urls.filter((u: unknown): u is string => typeof u === "string")
      : [];

    if (!slot || !ALLOWED_SLOTS.includes(slot)) {
      return NextResponse.json({ error: "Slot invalide" }, { status: 400 });
    }

    const talent = await prisma.talent.findUnique({
      where: { id: talentId },
      select: { id: true },
    });
    if (!talent) {
      return NextResponse.json({ error: "Talent non trouvé" }, { status: 404 });
    }

    const stats = await prisma.talentStats.findUnique({ where: { talentId } });
    const base = normalizeScreens(stats?.storyScreenshots);
    base[slot] = urls;

    await prisma.talentStats.upsert({
      where: { talentId },
      update: { storyScreenshots: base },
      create: { talentId, storyScreenshots: base },
    });

    return NextResponse.json({ success: true, ...base });
  } catch (error) {
    console.error("Erreur PATCH story screenshots:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}

