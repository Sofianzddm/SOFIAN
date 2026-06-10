import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildKey, createPresignedUpload, extFromContentType } from "@/lib/s3";

// Génère une URL présignée pour upload direct du logo de la marque (presskit manuel) vers S3.
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { brandId, contentType } = await request.json();

    if (!brandId) {
      return NextResponse.json({ error: "brandId requis" }, { status: 400 });
    }

    const ct = contentType || "image/png";
    const timestamp = Math.round(new Date().getTime() / 1000);
    const key = buildKey(
      "glowup-presskit-brands",
      `presskit-brand-${brandId}-${timestamp}.${extFromContentType(ct)}`
    );

    const { uploadUrl, publicUrl } = await createPresignedUpload({
      key,
      contentType: ct,
    });

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    console.error("Erreur signature logo presskit:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
