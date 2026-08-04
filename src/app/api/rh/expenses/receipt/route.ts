import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";

export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > 8 * 1024 * 1024) {
    return NextResponse.json({ error: "Fichier trop lourd (max 8 Mo)" }, { status: 400 });
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = `data:${file.type || "application/octet-stream"};base64,${buffer.toString("base64")}`;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-receipts",
      public_id: `rh-${session.employee.id}-${Date.now()}`,
      resource_type: "auto",
    });
    return NextResponse.json({
      url: uploaded.secure_url,
      name: file.name,
    });
  } catch (e) {
    console.error("RH receipt upload:", e);
    return NextResponse.json({ error: "Upload impossible" }, { status: 500 });
  }
}
