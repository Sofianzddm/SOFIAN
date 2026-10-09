import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { analyzeJustificatif } from "@/lib/depenses-analyse";
import { mapDepenseCategorieToRhNature } from "@/lib/rh/expenses";

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
  const allowed = new Set([
    "application/pdf",
    "image/jpeg",
    "image/png",
    "image/webp",
    "image/heic",
  ]);
  if (file.type && !allowed.has(file.type)) {
    return NextResponse.json(
      { error: "Format non accepté (PDF ou image)" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const mime = file.type || "application/octet-stream";
  const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

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

    // OCR / IA — ne bloque jamais l’upload
    let analyse: {
      fournisseur: string | null;
      montantTTC: number | null;
      montantTVA: number | null;
      tauxTVA: number | null;
      date: string | null;
      categorie: string | null;
      natureRh: string | null;
      analyseLe: string;
    } | null = null;

    try {
      const raw = await analyzeJustificatif(buffer, mime);
      if (raw) {
        analyse = {
          ...raw,
          natureRh: mapDepenseCategorieToRhNature(raw.categorie),
        };
      }
    } catch (e) {
      console.warn("RH receipt OCR:", e);
    }

    return NextResponse.json({
      url: uploaded.secure_url,
      name: file.name,
      analyse,
    });
  } catch (e) {
    console.error("RH receipt upload:", e);
    return NextResponse.json({ error: "Upload impossible" }, { status: 500 });
  }
}
