import { v2 as cloudinary } from "cloudinary";
import { Prisma } from "@prisma/client";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

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

    const bytes = await file.arrayBuffer();
    const base64 = `data:${file.type};base64,${Buffer.from(bytes).toString("base64")}`;
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-dinner-event-photos",
      public_id: `dinner-event-client-${Date.now()}`,
      transformation: [
        { width: 2000, height: 2000, crop: "limit" },
        { quality: "auto:good" },
        { fetch_format: "auto" },
      ],
    });

    const currentPhotos = Array.isArray(campaign.eventPhotos)
      ? campaign.eventPhotos.map((v) => String(v))
      : [];
    const nextPhotos = [...currentPhotos, uploaded.secure_url];

    await prisma.dinnerCampaign.update({
      where: { id: campaign.id },
      data: {
        eventPhotos: nextPhotos as Prisma.InputJsonValue,
      },
    });

    return NextResponse.json({ success: true, url: uploaded.secure_url, eventPhotos: nextPhotos });
  } catch (error) {
    console.error("Erreur POST /api/strategy/dinner/public/[token]/upload-event-photo:", error);
    return NextResponse.json({ error: "Erreur upload photo evenement" }, { status: 500 });
  }
}

