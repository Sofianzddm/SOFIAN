import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchInstagramPhotos } from "@/lib/instagram-import";

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Apify peut prendre ~30s

// Nombre de photos proposées dans la galerie de sélection.
const GALLERY_COUNT = 24;

/**
 * GET /api/talents/[id]/instagram-photos
 *
 * Récupère les dernières publications photo du compte Instagram du talent
 * pour alimenter la galerie de sélection du Kit Media. Les URLs renvoyées
 * sont les URLs Instagram d'origine (éphémères) : elles servent uniquement à
 * l'aperçu. Au moment où le TM clique sur une photo, elle est re-uploadée sur
 * Cloudinary via /api/talents/[id]/kit-photos/from-instagram.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const talent = await prisma.talent.findUnique({
    where: { id },
    select: { instagram: true },
  });

  if (!talent) {
    return NextResponse.json({ error: "Talent introuvable" }, { status: 404 });
  }

  if (!talent.instagram) {
    return NextResponse.json(
      { error: "Ce talent n'a pas de handle Instagram renseigné" },
      { status: 400 }
    );
  }

  if (!process.env.APIFY_TOKEN) {
    return NextResponse.json(
      {
        error:
          "APIFY_TOKEN non configuré. Ajoute la variable d'environnement APIFY_TOKEN.",
      },
      { status: 500 }
    );
  }

  try {
    const photos = await fetchInstagramPhotos(talent.instagram, GALLERY_COUNT);
    if (photos.length === 0) {
      return NextResponse.json(
        {
          error:
            "Aucune photo trouvée sur ce compte Instagram (compte privé ou vide ?)",
        },
        { status: 404 }
      );
    }
    return NextResponse.json({ photos });
  } catch (err) {
    console.error("[instagram-photos] Apify error:", err);
    return NextResponse.json(
      {
        error:
          err instanceof Error
            ? err.message
            : "Erreur lors de la récupération Instagram",
      },
      { status: 502 }
    );
  }
}
