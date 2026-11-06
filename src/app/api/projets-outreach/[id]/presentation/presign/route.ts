import { NextRequest, NextResponse } from "next/server";
import { v2 as cloudinary } from "cloudinary";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import { canManagePresentation } from "@/lib/projets-outreach";
import {
  buildKey,
  createPresignedUpload,
  isS3Configured,
} from "@/lib/s3";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_SIZE = 20 * 1024 * 1024;
const FOLDER = "glowup-projets-outreach-presentations";

function sanitizeFileName(raw: string): string {
  return (
    raw
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\.pdf$/i, "")
      .replace(/[^a-zA-Z0-9-_]+/g, "-")
      .replace(/-+/g, "-")
      .replace(/^-|-$/g, "")
      .toLowerCase() || "presentation"
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
 * Prépare un upload PDF direct navigateur (bypass limite 4.5 Mo Vercel).
 * Prefère S3 si configuré, sinon signature Cloudinary (raw).
 */
export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canManagePresentation(session.user.role)) {
      return NextResponse.json(
        { error: "Tu n’as pas accès aux projets outreach." },
        { status: 403 }
      );
    }

    const s3Ok = isS3Configured();
    const cloudinaryOk = isCloudinaryConfigured();
    if (!s3Ok && !cloudinaryOk) {
      return NextResponse.json(
        {
          error:
            "Aucun stockage configuré (AWS S3 ou Cloudinary requis pour les gros PDF).",
        },
        { status: 503 }
      );
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const existing = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }

    const body = await request.json().catch(() => ({}));
    const fileName = String(body.fileName || body.name || "presentation.pdf");
    const contentType = String(body.contentType || "application/pdf")
      .trim()
      .toLowerCase();
    const size = Number(body.size);

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
    if (Number.isFinite(size) && size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 20 Mo)." },
        { status: 400 }
      );
    }

    const safeName = sanitizeFileName(fileName);

    if (s3Ok) {
      const key = buildKey(FOLDER, `${campaignId}/${Date.now()}-${safeName}.pdf`);
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

    // Fallback Cloudinary (prod actuelle : pas de AWS_* sur Vercel)
    cloudinary.config({
      cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
      api_key: process.env.CLOUDINARY_API_KEY,
      api_secret: process.env.CLOUDINARY_API_SECRET,
    });
    const timestamp = Math.round(Date.now() / 1000);
    const publicId = `${campaignId}-${timestamp}-${safeName}`;
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
    console.error("POST .../presentation/presign:", error);
    return NextResponse.json(
      { error: "Impossible de préparer l’upload." },
      { status: 500 }
    );
  }
}
