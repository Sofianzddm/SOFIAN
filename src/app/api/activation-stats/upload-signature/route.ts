import { v2 as cloudinary } from "cloudinary";
import { NextRequest, NextResponse } from "next/server";
import { getAppSession } from "@/lib/getAppSession";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

export async function POST(request: NextRequest) {
  const session = await getAppSession(request);
  if (!session?.user) {
    return NextResponse.json({ error: "Non autorise" }, { status: 401 });
  }

  const { reportTalentId } = (await request.json()) as { reportTalentId?: string };
  if (!reportTalentId) {
    return NextResponse.json({ error: "reportTalentId requis" }, { status: 400 });
  }

  const timestamp = Math.round(new Date().getTime() / 1000);
  const folder = "glowup-activation-stats";
  const publicId = `${reportTalentId}-${timestamp}-${Math.random().toString(36).slice(2, 8)}`;

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
