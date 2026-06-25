import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessStrategy } from "@/app/api/strategy/_utils";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    if (!canAccessStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image requise" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const base64 = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-proposition-photos",
      public_id: `proposition-${Date.now()}`,
      transformation: [
        { width: 2400, height: 2400, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    return NextResponse.json({ success: true, url: uploaded.secure_url });
  } catch (error) {
    console.error("Erreur upload proposition photo:", error);
    return NextResponse.json({ error: "Erreur upload photo" }, { status: 500 });
  }
}
