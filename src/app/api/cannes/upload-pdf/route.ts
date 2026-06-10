import { NextRequest, NextResponse } from "next/server";
import { uploadFileToS3 } from "@/lib/s3";
import { requireCannesEditor } from "@/lib/cannes/auth";

export async function POST(req: NextRequest) {
  const { error } = await requireCannesEditor();
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

    const url = await uploadFileToS3(file, {
      folder: "glowup-cannes-pdfs",
      baseName: `cannes-pdf-${Date.now()}`,
      optimize: false,
    });

    return NextResponse.json({ url }, { status: 201 });
  } catch (e) {
    console.error("POST /api/cannes/upload-pdf:", e);
    return NextResponse.json({ error: "Erreur lors de l'upload du PDF" }, { status: 500 });
  }
}
