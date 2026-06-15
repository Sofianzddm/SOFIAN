import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// Signature Cloudinary pour upload direct depuis le lien public de l'événement.
// Scellée par slug : la signature n'est délivrée que pour un événement existant.
export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ slug: string }> }
) {
  const { slug } = await params;

  const event = await prisma.photoEvent.findUnique({
    where: { slug: slug.toLowerCase() },
    select: { id: true },
  });
  if (!event) {
    return NextResponse.json({ error: "Lien invalide" }, { status: 404 });
  }

  const timestamp = Math.round(Date.now() / 1000);
  const folder = "glowup-event-photos";
  const publicId = `${event.id}-${timestamp}-${Math.random()
    .toString(36)
    .slice(2, 8)}`;

  const signature = cloudinary.utils.api_sign_request(
    { timestamp, folder, public_id: publicId },
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
}
