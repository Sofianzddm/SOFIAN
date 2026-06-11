import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import {
  COIFFEUR_PUBLIC_PROFILE_SETTING_KEY,
  COIFFEUR_PROFILE_CLOUDINARY_FOLDER,
  COIFFEUR_PROFILE_CLOUDINARY_PUBLIC_ID,
  coiffeurProfileCloudinaryFullPublicId,
  photoUrlFromStoredValue,
  storedJsonForPhotoUrl,
} from "@/lib/cannes-coiffeur/public-profile-setting";

export const dynamic = "force-dynamic";

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

const MAX_BYTES = 12 * 1024 * 1024;

function cloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

export async function GET() {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  if (!cloudinaryConfigured()) {
    return NextResponse.json({ photoUrl: null, cloudinaryReady: false });
  }

  const row = await prisma.cannesSharedSetting.findUnique({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
  });
  return NextResponse.json({
    photoUrl: photoUrlFromStoredValue(row?.value),
    cloudinaryReady: true,
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  if (!cloudinaryConfigured()) {
    return NextResponse.json(
      { error: "Cloudinary non configure (CLOUDINARY_* manquants)" },
      { status: 503 }
    );
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Fichier image requis" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json({ error: "Format accepte : image (jpeg, png, webp, gif)" }, { status: 400 });
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: "Image trop volumineuse (max 12 Mo)" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const base64 = `data:${file.type};base64,${buffer.toString("base64")}`;

  const result = await cloudinary.uploader.upload(base64, {
    folder: COIFFEUR_PROFILE_CLOUDINARY_FOLDER,
    public_id: COIFFEUR_PROFILE_CLOUDINARY_PUBLIC_ID,
    overwrite: true,
    invalidate: true,
    transformation: [{ width: 1200, height: 1200, crop: "limit" }, { quality: "auto:good" }, { fetch_format: "auto" }],
  });

  const photoUrl = result.secure_url as string;
  const saved = await prisma.cannesSharedSetting.upsert({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
    create: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY, value: storedJsonForPhotoUrl(photoUrl) },
    update: { value: storedJsonForPhotoUrl(photoUrl) },
  });

  return NextResponse.json({ photoUrl: photoUrlFromStoredValue(saved.value) });
}

export async function DELETE() {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  if (cloudinaryConfigured()) {
    try {
      await cloudinary.uploader.destroy(coiffeurProfileCloudinaryFullPublicId(), { invalidate: true });
    } catch {
      // image absente ou déjà supprimée
    }
  }

  await prisma.cannesSharedSetting.upsert({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
    create: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY, value: storedJsonForPhotoUrl(null) },
    update: { value: storedJsonForPhotoUrl(null) },
  });

  return NextResponse.json({ ok: true, photoUrl: null });
}
