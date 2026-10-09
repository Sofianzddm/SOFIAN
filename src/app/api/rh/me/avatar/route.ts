import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import prisma from "@/lib/prisma";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import { writeRhAudit } from "@/lib/rh/workflow";

/** Upload / suppression photo de profil salarié. */
export async function POST(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > 5 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Image trop lourde (max 5 Mo)" },
      { status: 400 }
    );
  }
  const mime = file.type || "";
  if (!mime.startsWith("image/")) {
    return NextResponse.json(
      { error: "Image JPG / PNG / WEBP attendue" },
      { status: 400 }
    );
  }

  const buffer = Buffer.from(await file.arrayBuffer());
  const base64 = `data:${mime};base64,${buffer.toString("base64")}`;

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  try {
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-avatars",
      public_id: `avatar-${session.employee.id}`,
      overwrite: true,
      transformation: [
        { width: 400, height: 400, crop: "fill", gravity: "face" },
        { quality: "auto", fetch_format: "auto" },
      ],
    });

    const emp = await prisma.rhEmployee.update({
      where: { id: session.employee.id },
      data: { avatarUrl: uploaded.secure_url },
      select: { avatarUrl: true },
    });

    await writeRhAudit({
      actorId: session.employee.id,
      targetId: session.employee.id,
      action: "avatar.update",
      detail: { url: emp.avatarUrl },
    });

    return NextResponse.json({ ok: true, avatarUrl: emp.avatarUrl });
  } catch (e) {
    console.error("Avatar RH:", e);
    return NextResponse.json(
      { error: e instanceof Error ? e.message : "Upload impossible" },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  await prisma.rhEmployee.update({
    where: { id: session.employee.id },
    data: { avatarUrl: null },
  });
  await writeRhAudit({
    actorId: session.employee.id,
    targetId: session.employee.id,
    action: "avatar.delete",
    detail: {},
  });
  return NextResponse.json({ ok: true });
}
