import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireAdmin } from "@/lib/cannes/auth";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(req: NextRequest) {
  const { error } = await requireAdmin();
  if (error) return error;

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    }

    const isPdfMime = file.type === "application/pdf";
    const isPdfByName = file.name.toLowerCase().endsWith(".pdf");
    if (!isPdfMime && !isPdfByName) {
      return NextResponse.json({ error: "Le fichier doit etre un PDF" }, { status: 400 });
    }

    const maxSize = 15 * 1024 * 1024;
    if (file.size > maxSize) {
      return NextResponse.json({ error: "Fichier trop volumineux (max 15MB)" }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);
    const base64 = `data:${file.type || "application/pdf"};base64,${buffer.toString("base64")}`;

    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-cannes-pdfs",
      public_id: `cannes-pdf-${Date.now()}`,
      resource_type: "auto",
    });

    return NextResponse.json({ url: uploaded.secure_url }, { status: 201 });
  } catch (e) {
    console.error("POST /api/cannes/upload-pdf:", e);
    return NextResponse.json({ error: "Erreur lors de l'upload du PDF" }, { status: 500 });
  }
}
