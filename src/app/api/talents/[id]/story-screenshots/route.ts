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
    const slot = formData.get("slot") as "views30d" | "views7d" | "linkClicks30d" | null;
    const files = formData.getAll("files") as File[];

    if (!slot || !["views30d", "views7d", "linkClicks30d"].includes(slot)) {
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

    const existing = stats?.storyScreenshots as any;
    let base: {
      views30d: string[];
      views7d: string[];
      linkClicks30d: string[];
    } = { views30d: [], views7d: [], linkClicks30d: [] };

    if (Array.isArray(existing)) {
      base.views30d = existing.filter((u: any) => typeof u === "string");
    } else if (existing && typeof existing === "object") {
      base.views30d = (existing.views30d || []).filter((u: any) => typeof u === "string");
      base.views7d = (existing.views7d || []).filter((u: any) => typeof u === "string");
      base.linkClicks30d = (existing.linkClicks30d || []).filter(
        (u: any) => typeof u === "string"
      );
    }

    // Ajouter les nouvelles URLs au slot existant (bouton + = ajout)
    if (slot === "views30d") {
      base.views30d = [...base.views30d, ...uploadedUrls];
    } else if (slot === "views7d") {
      base.views7d = [...base.views7d, ...uploadedUrls];
    } else if (slot === "linkClicks30d") {
      base.linkClicks30d = [...base.linkClicks30d, ...uploadedUrls];
    }

    await prisma.talentStats.upsert({
      where: { talentId },
      update: { storyScreenshots: base },
      create: { talentId, storyScreenshots: base },
    });

    return NextResponse.json({
      success: true,
      views30d: base.views30d,
      views7d: base.views7d,
      linkClicks30d: base.linkClicks30d,
    });
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
    const slot = body.slot as "views30d" | "views7d" | "linkClicks30d" | null;
    const urls = Array.isArray(body.urls) ? body.urls.filter((u: unknown) => typeof u === "string") : [];

    if (!slot || !["views30d", "views7d", "linkClicks30d"].includes(slot)) {
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
    const existing = stats?.storyScreenshots as any;
    const base: { views30d: string[]; views7d: string[]; linkClicks30d: string[] } = {
      views30d: [],
      views7d: [],
      linkClicks30d: [],
    };
    if (Array.isArray(existing)) {
      base.views30d = existing.filter((u: any) => typeof u === "string");
    } else if (existing && typeof existing === "object") {
      base.views30d = (existing.views30d || []).filter((u: any) => typeof u === "string");
      base.views7d = (existing.views7d || []).filter((u: any) => typeof u === "string");
      base.linkClicks30d = (existing.linkClicks30d || []).filter((u: any) => typeof u === "string");
    }

    if (slot === "views30d") base.views30d = urls;
    else if (slot === "views7d") base.views7d = urls;
    else base.linkClicks30d = urls;

    await prisma.talentStats.upsert({
      where: { talentId },
      update: { storyScreenshots: base },
      create: { talentId, storyScreenshots: base },
    });

    return NextResponse.json({
      success: true,
      views30d: base.views30d,
      views7d: base.views7d,
      linkClicks30d: base.linkClicks30d,
    });
  } catch (error) {
    console.error("Erreur PATCH story screenshots:", error);
    return NextResponse.json(
      { error: "Erreur lors de la mise à jour" },
      { status: 500 }
    );
  }
}

