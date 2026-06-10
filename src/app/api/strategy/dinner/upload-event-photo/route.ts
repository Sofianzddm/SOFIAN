import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy } from "@/app/api/strategy/dinner/_utils";
import { uploadFileToS3 } from "@/lib/s3";

export async function POST(request: NextRequest) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) return NextResponse.json({ error: "Non autorise" }, { status: 401 });
    if (!canAccessDinnerStrategy(String(session.user.role || ""))) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image requise" }, { status: 400 });
    }

    const url = await uploadFileToS3(file, {
      folder: "glowup-dinner-event-photos",
      baseName: `dinner-event-${Date.now()}`,
      maxWidth: 2000,
    });

    return NextResponse.json({ success: true, url });
  } catch (error) {
    console.error("Erreur upload event photo:", error);
    return NextResponse.json({ error: "Erreur upload photo evenement" }, { status: 500 });
  }
}

