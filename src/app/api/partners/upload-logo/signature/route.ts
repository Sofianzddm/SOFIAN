import { v2 as cloudinary } from "cloudinary";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Génère une signature pour upload direct côté client du logo partenaire
export async function POST(request: Request) {
  try {
    // Vérifier l'authentification
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }

    const { partnerId } = await request.json();

    if (!partnerId) {
      return NextResponse.json({ error: "partnerId requis" }, { status: 400 });
    }

    const timestamp = Math.round(new Date().getTime() / 1000);
    const folder = "glowup-partners";
    const publicId = `partner-${partnerId}-${timestamp}`;

    // Générer la signature
    const signature = cloudinary.utils.api_sign_request(
      {
        timestamp,
        folder,
        public_id: publicId,
      },
      process.env.CLOUDINARY_API_SECRET!
    );

    return NextResponse.json({
      signature,
      timestamp,
      folder,
      publicId,
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
    });
  } catch (error) {
    console.error("Erreur signature logo partenaire:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
