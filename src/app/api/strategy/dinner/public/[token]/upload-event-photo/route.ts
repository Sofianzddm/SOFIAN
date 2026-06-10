import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { uploadFileToS3 } from "@/lib/s3";

function eventIsFinished(eventDate: Date | null): boolean {
  if (!eventDate) return false;
  const end = new Date(eventDate);
  end.setHours(23, 59, 59, 999);
  return Date.now() >= end.getTime();
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ token: string }> }
) {
  try {
    const { token } = await context.params;
    const campaign = await prisma.dinnerCampaign.findUnique({
      where: { clientAccessToken: token },
      select: { id: true, eventDate: true, eventPhotos: true },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Lien prive invalide" }, { status: 404 });
    }
    if (!eventIsFinished(campaign.eventDate)) {
      return NextResponse.json(
        { error: "Upload disponible uniquement apres la fin de l'evenement" },
        { status: 400 }
      );
    }

    const formData = await request.formData();
    const file = formData.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "Fichier requis" }, { status: 400 });
    if (!file.type.startsWith("image/")) {
      return NextResponse.json({ error: "Image requise" }, { status: 400 });
    }

    const url = await uploadFileToS3(file, {
      folder: "glowup-dinner-event-photos",
      baseName: `dinner-event-client-${Date.now()}`,
      maxWidth: 2000,
    });

    const currentPhotos = Array.isArray(campaign.eventPhotos)
      ? campaign.eventPhotos.map((v) => String(v))
      : [];
    const nextPhotos = [...currentPhotos, url];

    await prisma.dinnerCampaign.update({
      where: { id: campaign.id },
      data: {
        eventPhotos: nextPhotos as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, url, eventPhotos: nextPhotos });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/public/[token]/upload-event-photo:", error);
    return NextResponse.json({ error: "Erreur upload photo evenement" }, { status: 500 });
  }
}

