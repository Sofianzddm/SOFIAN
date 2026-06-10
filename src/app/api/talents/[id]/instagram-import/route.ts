import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { fetchInstagramPhotos } from "@/lib/instagram-import";
import { uploadFileToS3 } from "@/lib/s3";

const KIT_PHOTOS_LENGTH = 10;
// Comme la photo principale est déjà utilisée en couverture, on importe
// 9 photos additionnelles pour remplir les slots 0..8.
const IMPORT_COUNT = 9;

export const dynamic = "force-dynamic";
export const maxDuration = 60; // Apify + S3 peuvent prendre ~30s

/**
 * POST /api/talents/[id]/instagram-import
 * Body: { overwrite?: boolean }
 *
 * - Récupère le handle IG du talent
 * - Appelle Apify pour récupérer les 9 derniers posts photo
 * - Re-upload chaque image sur Cloudinary (URLs Instagram expirent)
 * - Remplit kitPhotos (slots 0..8). Slot 9 (bonus) laissé intact.
 *
 * Par défaut, on ne remplace **que les slots vides** pour ne pas écraser
 * un choix manuel du TM. Si `overwrite: true`, on remplace tout.
 */
export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
  }

  const { id } = await params;
  const body = (await req.json().catch(() => ({}))) as { overwrite?: boolean };

  const talent = await prisma.talent.findUnique({
    where: { id },
    select: { id: true, prenom: true, nom: true, instagram: true, kitPhotos: true },
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

  // 1. Récupère les photos via Apify
  let igPhotos;
  try {
    igPhotos = await fetchInstagramPhotos(talent.instagram, IMPORT_COUNT);
  } catch (err) {
    console.error("[instagram-import] Apify error:", err);
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

  if (igPhotos.length === 0) {
    return NextResponse.json(
      {
        error:
          "Aucune photo trouvée sur ce compte Instagram (compte privé ou vide ?)",
      },
      { status: 404 }
    );
  }

  // 2. Normalise le tableau actuel
  const current: (string | null)[] = Array.from(
    { length: KIT_PHOTOS_LENGTH },
    (_, i) => {
      const v = (talent.kitPhotos as string[] | undefined)?.[i];
      return typeof v === "string" && v.trim() ? v : null;
    }
  );

  // 3. Pour chaque photo IG, on upload sur Cloudinary et on remplit un slot
  const overwrite = !!body.overwrite;
  const errors: string[] = [];
  let imported = 0;

  for (let i = 0; i < igPhotos.length && i < IMPORT_COUNT; i++) {
    if (!overwrite && current[i]) {
      // Slot déjà rempli manuellement, on respecte
      continue;
    }
    try {
      // Re-upload depuis l'URL Instagram (qui expire) vers notre S3.
      const url = await uploadFileToS3(
        { url: igPhotos[i].url },
        {
          folder: "glowup-talents",
          baseName: `${talent.id}-ig-${i}-${Date.now()}`,
          maxWidth: 2000,
        }
      );
      current[i] = url;
      imported += 1;
    } catch (err) {
      console.error(`[instagram-import] Upload slot ${i} failed:`, err);
      errors.push(`Slot ${i} : ${err instanceof Error ? err.message : "upload"}`);
    }
  }

  // 4. Persiste
  await prisma.talent.update({
    where: { id: talent.id },
    data: { kitPhotos: current.map((v) => v ?? "") },
  });

  return NextResponse.json({
    imported,
    requested: igPhotos.length,
    kitPhotos: current,
    errors: errors.length > 0 ? errors : undefined,
  });
}
