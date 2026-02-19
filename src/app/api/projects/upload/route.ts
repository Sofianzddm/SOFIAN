import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const PROJECT_ROLES = [
  "ADMIN",
  "HEAD_OF",
  "HEAD_OF_INFLUENCE",
  "HEAD_OF_SALES",
] as const;

function hasProjectAccess(role: string) {
  return PROJECT_ROLES.includes(role as (typeof PROJECT_ROLES)[number]);
}

export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
    }

    const role = (session.user as { role?: string }).role || "TALENT";
    if (!hasProjectAccess(role)) {
      return NextResponse.json(
        { error: "Accès réservé" },
        { status: 403 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File;

    if (!file || !file.size) {
      return NextResponse.json(
        { error: "Fichier requis" },
        { status: 400 }
      );
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

    const result = await cloudinary.uploader.upload(base64, {
      folder: "glowup-projects",
      public_id: `project-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      transformation: [
        { width: 1920, height: 1080, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    return NextResponse.json({ url: result.secure_url });
  } catch (error) {
    console.error("Erreur upload projet:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload" },
      { status: 500 }
    );
  }
}
