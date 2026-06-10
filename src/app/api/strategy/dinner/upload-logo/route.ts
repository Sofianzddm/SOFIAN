import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";
import { canAccessDinnerStrategy } from "@/app/api/strategy/dinner/_utils";
import { uploadFileToS3 } from "@/lib/s3";

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

    const url = await uploadFileToS3(file, {
      folder: "glowup-dinner-logos",
      baseName: `dinner-logo-${Date.now()}`,
      maxWidth: 1200,
    });

    return NextResponse.json({
      success: true,
      url,
    });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/upload-logo:", error);
    return NextResponse.json({ error: "Erreur lors de l'upload du logo" }, { status: 500 });
  }
}

