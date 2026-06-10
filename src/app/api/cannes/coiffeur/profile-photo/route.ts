import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireCannesCoiffeurStaff } from "@/lib/cannes/auth";
import {
  COIFFEUR_PUBLIC_PROFILE_SETTING_KEY,
  COIFFEUR_PROFILE_S3_BASE_NAME,
  COIFFEUR_PROFILE_S3_FOLDER,
  photoUrlFromStoredValue,
  storedJsonForPhotoUrl,
} from "@/lib/cannes-coiffeur/public-profile-setting";
import { deleteFromS3, isS3Configured, uploadFileToS3 } from "@/lib/s3";

export const dynamic = "force-dynamic";

const MAX_BYTES = 12 * 1024 * 1024;

export async function GET() {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  if (!isS3Configured()) {
    return NextResponse.json({ photoUrl: null, storageReady: false });
  }

  const row = await prisma.cannesSharedSetting.findUnique({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
  });
  return NextResponse.json({
    photoUrl: photoUrlFromStoredValue(row?.value),
    storageReady: true,
  });
}

export async function POST(req: NextRequest) {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  if (!isS3Configured()) {
    return NextResponse.json(
      { error: "S3 non configuré (AWS_* manquants)" },
      { status: 503 }
    );
  }

  const formData = await req.formData().catch(() => null);
  const file = formData?.get("file");
  if (!(file instanceof File) || !file.size) {
    return NextResponse.json({ error: "Fichier image requis" }, { status: 400 });
  }

  if (!file.type.startsWith("image/")) {
    return NextResponse.json(
      { error: "Format accepte : image (jpeg, png, webp, gif)" },
      { status: 400 }
    );
  }

  if (file.size > MAX_BYTES) {
    return NextResponse.json(
      { error: "Image trop volumineuse (max 12 Mo)" },
      { status: 400 }
    );
  }

  const row = await prisma.cannesSharedSetting.findUnique({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
  });
  const previousUrl = photoUrlFromStoredValue(row?.value);
  if (previousUrl) {
    await deleteFromS3(previousUrl);
  }

  const photoUrl = await uploadFileToS3(file, {
    folder: COIFFEUR_PROFILE_S3_FOLDER,
    baseName: COIFFEUR_PROFILE_S3_BASE_NAME,
    maxWidth: 1200,
  });

  const saved = await prisma.cannesSharedSetting.upsert({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
    create: {
      key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY,
      value: storedJsonForPhotoUrl(photoUrl),
    },
    update: { value: storedJsonForPhotoUrl(photoUrl) },
  });

  return NextResponse.json({ photoUrl: photoUrlFromStoredValue(saved.value) });
}

export async function DELETE() {
  const { error } = await requireCannesCoiffeurStaff();
  if (error) return error;

  const row = await prisma.cannesSharedSetting.findUnique({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
  });
  const previousUrl = photoUrlFromStoredValue(row?.value);
  if (previousUrl) {
    await deleteFromS3(previousUrl);
  }

  await prisma.cannesSharedSetting.upsert({
    where: { key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY },
    create: {
      key: COIFFEUR_PUBLIC_PROFILE_SETTING_KEY,
      value: storedJsonForPhotoUrl(null),
    },
    update: { value: storedJsonForPhotoUrl(null) },
  });

  return NextResponse.json({ ok: true, photoUrl: null });
}
