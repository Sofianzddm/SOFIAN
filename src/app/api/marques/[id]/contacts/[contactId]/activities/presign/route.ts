import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import prisma from "@/lib/prisma";
import { canWriteMarqueContactActivities } from "@/lib/marque-crm-access";
import {
  buildKey,
  createPresignedUpload,
  isS3Configured,
} from "@/lib/s3";

type RouteContext = { params: Promise<{ id: string; contactId: string }> };

const FOLDER = "glowup-marque-contact-notes";

function sanitizeFileName(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "note"
  );
}

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

/**
 * Prépare un upload PDF direct navigateur (S3 présigné, sinon Cloudinary).
 * Bypass la limite ~4.5 Mo du body Vercel.
 */
export async function POST(request: NextRequest, { params }: RouteContext) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    const s3Ok = isS3Configured();
    const cloudinaryOk = isCloudinaryConfigured();
    if (!s3Ok && !cloudinaryOk) {
      return NextResponse.json(
        {
          error:
            "Aucun stockage configuré (AWS S3 ou Cloudinary requis pour les PDF).",
        },
        { status: 503 }
      );
    }

    const { id: marqueId, contactId } = await params;
    const contact = await prisma.marqueContact.findFirst({
      where: { id: contactId, marqueId },
      select: { id: true, marque: { select: { assignedToId: true } } },
    });
    if (!contact) {
      return NextResponse.json({ error: "Contact introuvable" }, { status: 404 });
    }
    if (
      !canWriteMarqueContactActivities({
        role: session.user.role,
        userId: session.user.id,
        assignedToId: contact.marque.assignedToId,
      })
    ) {
      return NextResponse.json({ error: "Permissions insuffisantes" }, { status: 403 });
    }

    const body = await request.json().catch(() => ({}));
    const fileName = String(body.fileName || body.name || "note.pdf");
    const contentType = String(body.contentType || "application/pdf")
      .trim()
      .toLowerCase();

    if (
      contentType &&
      contentType !== "application/pdf" &&
      contentType !== "application/octet-stream"
    ) {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés." },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(fileName);

    if (s3Ok) {
      const key = buildKey(
        FOLDER,
        `${marqueId}/${contactId}/${Date.now()}-${safeName}.pdf`
      );
      const signed = await createPresignedUpload({
        key,
        contentType: "application/pdf",
        expiresIn: 600,
      });
      return NextResponse.json({
        provider: "s3",
        uploadUrl: signed.uploadUrl,
        publicUrl: signed.publicUrl,
        key: signed.key,
        contentType: signed.contentType,
      });
    }

    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${contactId}-${timestamp}-${safeName}`;
    const signature = cloudinary.utils.api_sign_request(
      { timestamp, folder: FOLDER, public_id: publicId },
      process.env.CLOUDINARY_API_SECRET!
    );

    return NextResponse.json({
      provider: "cloudinary",
      cloudName: process.env.CLOUDINARY_CLOUD_NAME,
      apiKey: process.env.CLOUDINARY_API_KEY,
      signature,
      timestamp,
      folder: FOLDER,
      publicId,
    });
  } catch (error) {
    console.error("POST contact activity presign:", error);
    return NextResponse.json(
      { error: "Impossible de préparer l’upload." },
      { status: 500 }
    );
  }
}
