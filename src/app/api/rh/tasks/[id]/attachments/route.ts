import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { requireRhSessionFromRequest } from "@/lib/rh/auth";
import {
  addRhTaskAttachment,
  deleteRhTaskAttachment,
} from "@/lib/rh/tasks";

type Ctx = { params: Promise<{ id: string }> };

const EXT_OK =
  /\.(pdf|jpe?g|png|webp|gif|heic|heif|docx?|xlsx?|csv|txt|pptx?|zip|numbers|pages|key)$/i;

const ALLOWED_MIME = new Set([
  "application/pdf",
  "image/jpeg",
  "image/jpg",
  "image/png",
  "image/webp",
  "image/gif",
  "image/heic",
  "image/heif",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-powerpoint",
  "application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "application/zip",
  "application/x-zip-compressed",
  "text/plain",
  "text/csv",
  "application/csv",
  "text/comma-separated-values",
]);

function isImage(name: string, mime: string) {
  return (
    mime.startsWith("image/") ||
    /\.(jpe?g|png|webp|gif|heic|heif)$/i.test(name)
  );
}

function isAllowed(name: string, mime: string) {
  if (EXT_OK.test(name)) return true;
  if (!mime || mime === "application/octet-stream") return false;
  return ALLOWED_MIME.has(mime);
}

export async function POST(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;

  const formData = await request.formData();
  const file = formData.get("file");
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "Fichier manquant" }, { status: 400 });
  }
  if (file.size > 25 * 1024 * 1024) {
    return NextResponse.json(
      { error: "Fichier trop lourd (max 25 Mo)" },
      { status: 400 }
    );
  }

  const fileName = file.name || "fichier";
  const mime = file.type || "application/octet-stream";

  if (!isAllowed(fileName, mime)) {
    return NextResponse.json(
      {
        error:
          "Format non accepté (PDF, Excel, Word, PowerPoint, CSV, images, ZIP…)",
      },
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

  // Excel / Office / PDF → raw (auto les refuse souvent)
  const resourceType = isImage(fileName, mime) ? "image" : "raw";
  const safeId = `task-${id}-${Date.now()}-${fileName
    .replace(/[^a-zA-Z0-9._-]/g, "_")
    .slice(0, 80)}`;

  try {
    const uploaded = await cloudinary.uploader.upload(base64, {
      folder: "glowup-rh-tasks",
      public_id: safeId,
      resource_type: resourceType,
      use_filename: true,
      unique_filename: true,
    });

    const task = await addRhTaskAttachment(session.employee, id, {
      fileName,
      fileUrl: uploaded.secure_url,
      mimeType: mime,
      sizeBytes: file.size,
    });
    return NextResponse.json({ task }, { status: 201 });
  } catch (e) {
    console.error("[rh.tasks] attachment", e);
    const msg = e instanceof Error ? e.message : "Upload impossible";
    const status = msg.includes("refusé")
      ? 403
      : msg.includes("introuvable")
        ? 404
        : 500;
    return NextResponse.json(
      {
        error:
          status === 500
            ? "Upload impossible (Excel/PDF/Word acceptés jusqu’à 25 Mo)"
            : msg,
      },
      { status }
    );
  }
}

export async function DELETE(request: NextRequest, ctx: Ctx) {
  const session = await requireRhSessionFromRequest(request);
  if (!session) {
    return NextResponse.json({ error: "Non authentifié" }, { status: 401 });
  }
  const { id } = await ctx.params;
  const attachmentId = request.nextUrl.searchParams.get("attachmentId");
  if (!attachmentId) {
    return NextResponse.json(
      { error: "attachmentId manquant" },
      { status: 400 }
    );
  }
  try {
    const task = await deleteRhTaskAttachment(
      session.employee,
      id,
      attachmentId
    );
    return NextResponse.json({ task });
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Erreur";
    const status = msg.includes("refusé")
      ? 403
      : msg.includes("introuvable")
        ? 404
        : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
