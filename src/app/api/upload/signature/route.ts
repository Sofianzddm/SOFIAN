import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { buildKey, createPresignedUpload, extFromContentType } from "@/lib/s3";

// Génère une URL présignée pour upload direct du fichier vers S3 (bypass serveur).
export async function POST(request: Request) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { talentId, contentType } = await request.json();

    if (!talentId) {
      return NextResponse.json({ error: "talentId requis" }, { status: 400 });
    }

    const ct = contentType || "image/jpeg";
    const timestamp = Math.round(new Date().getTime() / 1000);
    const key = buildKey(
      "glowup-talents",
      `${talentId}-${timestamp}.${extFromContentType(ct)}`
    );

    const { uploadUrl, publicUrl } = await createPresignedUpload({
      key,
      contentType: ct,
    });

    return NextResponse.json({ uploadUrl, publicUrl, key });
  } catch (error) {
    console.error("Erreur signature S3:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
