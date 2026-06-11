import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy } from "@/app/api/strategy/dinner/_utils";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    }
    const role = String(session.user.role || "");
    if (!canAccessDinnerStrategy(role)) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Format invalide (image attendue)" }, { status: 400 });
    }
    if (file.size > 10 * 1024 * 1024) {
      return NextResponse.json({ error: "Le fichier depasse 10MB" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-dinner-logos",
      public_id: `dinner-logo-${Date.now()}`,
      transformation: [
        { width: 1200, height: 1200, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    return NextResponse.json({
      success: true,
      url: uploaded.secure_url,
    });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/upload-logo:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du logo" }, { status: 500 });
  }
}

