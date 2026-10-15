import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getAppSession } from "@/lib/getAppSession";
import {
  canManagePresentation,
  canAccessProjetsOutreach,
} from "@/lib/projets-outreach";
import {
  uploadBufferToS3,
  buildKey,
  isS3Configured,
  deleteFromS3,
} from "@/lib/s3";

type RouteContext = { params: Promise<{ id: string }> };

const MAX_SIZE = 20 * 1024 * 1024;

function isCloudinaryConfigured(): boolean {
  return Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET
  );
}

async function uploadPresentationPdf(
  buffer: Buffer,
  campaignId: string,
  safeName: string
): Promise<string> {
  if (isS3Configured()) {
    const key = buildKey(
      "glowup-projets-outreach-presentations",
      `${campaignId}/${Date.now()}-${safeName}.pdf`
    );
    return uploadBufferToS3(buffer, { key, contentType: "application/pdf" });
  }

  const { v2: cloudinary } = await import("cloudinary");
  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });
  const base64 = `data:application/pdf;base64,${buffer.toString("base64")}`;
  const uploaded = await cloudinary.uploader.upload(base64, {
    folder: "glowup-projets-outreach-presentations",
    public_id: `${campaignId}-${Date.now()}-${safeName}`,
    resource_type: "raw",
  });
  return uploaded.secure_url;
}

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
    if (!isS3Configured() && !isCloudinaryConfigured()) {
      return NextResponse.json(
        { error: "Aucun stockage de fichiers configuré (S3 ou Cloudinary requis)." },
        { status: 503 }
      );
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const existing = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      select: {
        id: true,
        title: true,
        presentationPdfUrl: true,
      },
    });
    if (!existing) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }

    const formData = await request.formData();
    const file = formData.get("file");
    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Fichier PDF requis." }, { status: 400 });
    }
    const isPdf =
      file.type === "application/pdf" ||
      file.name.toLowerCase().endsWith(".pdf");
    if (!isPdf) {
      return NextResponse.json(
        { error: "Seuls les fichiers PDF sont acceptés." },
        { status: 400 }
      );
    }
    if (file.size > MAX_SIZE) {
      return NextResponse.json(
        { error: "Fichier trop volumineux (max 20 Mo)." },
        { status: 400 }
      );
    }

    const originalName = file.name || "presentation.pdf";
    const safeName = sanitizeFileName(originalName);
    const buffer = Buffer.from(await file.arrayBuffer());
    const url = await uploadPresentationPdf(buffer, campaignId, safeName);

    if (existing.presentationPdfUrl) {
      await deleteFromS3(existing.presentationPdfUrl);
    }

    const updated = await prisma.talentProspectingCampaign.update({
      where: { id: campaignId },
      data: {
        presentationPdfUrl: url,
        presentationFileName: originalName.replace(/\.pdf$/i, "") + ".pdf",
        presentationUploadedAt: new Date(),
      },
      select: {
        presentationPdfUrl: true,
        presentationFileName: true,
        presentationUploadedAt: true,
      },
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESENTATION_UPLOADED",
        message: `Présentation PDF ajoutée : ${updated.presentationFileName}`,
        payload: {
          fileName: updated.presentationFileName,
          url: updated.presentationPdfUrl,
        },
      },
    });

    return NextResponse.json({
      success: true,
      presentationPdfUrl: updated.presentationPdfUrl,
      presentationFileName: updated.presentationFileName,
      presentationUploadedAt: updated.presentationUploadedAt,
    });
  } catch (error) {
    console.error("POST /api/projets-outreach/[id]/presentation:", error);
    return NextResponse.json(
      { error: "Erreur lors de l'upload de la présentation." },
      { status: 500 }
    );
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(_request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canManagePresentation(session.user.role)) {
      return NextResponse.json(
        { error: "Tu n’as pas accès aux projets outreach." },
        { status: 403 }
      );
    }

    const { id } = await context.params;
    const campaignId = String(id || "").trim();
    const existing = await prisma.talentProspectingCampaign.findUnique({
      where: { id: campaignId },
      select: { id: true, presentationPdfUrl: true, presentationFileName: true },
    });
    if (!existing) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }
    if (!existing.presentationPdfUrl) {
      return NextResponse.json(
        { error: "Aucune présentation à supprimer." },
        { status: 400 }
      );
    }

    await deleteFromS3(existing.presentationPdfUrl);

    await prisma.talentProspectingCampaign.update({
      where: { id: campaignId },
      data: {
        presentationPdfUrl: null,
        presentationFileName: null,
        presentationUploadedAt: null,
      },
    });

    await prisma.prospectingCampaignEvent.create({
      data: {
        campaignId,
        actorId: session.user.id,
        type: "PRESENTATION_REMOVED",
        message: `Présentation PDF retirée${
          existing.presentationFileName ? ` : ${existing.presentationFileName}` : ""
        }`,
        payload: { fileName: existing.presentationFileName },
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("DELETE /api/projets-outreach/[id]/presentation:", error);
    return NextResponse.json(
      { error: "Erreur lors de la suppression de la présentation." },
      { status: 500 }
    );
  }
}

/** Lecture publique (auth) de l’URL — utile si le bucket n’est pas ouvert. */
export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const session = await getAppSession(request);
    if (!session?.user) {
      return NextResponse.json({ error: "Non autorisé" }, { status: 401 });
    }
    if (!canAccessProjetsOutreach(session.user.role)) {
      return NextResponse.json({ error: "Accès refusé." }, { status: 403 });
    }

    const { id } = await context.params;
    const campaign = await prisma.talentProspectingCampaign.findUnique({
      where: { id: String(id || "").trim() },
      select: {
        presentationPdfUrl: true,
        presentationFileName: true,
        presentationUploadedAt: true,
      },
    });
    if (!campaign) {
      return NextResponse.json({ error: "Projet introuvable." }, { status: 404 });
    }
    if (!campaign.presentationPdfUrl) {
      return NextResponse.json(
        { error: "Aucune présentation sur ce projet." },
        { status: 404 }
      );
    }

    return NextResponse.json({
      presentationPdfUrl: campaign.presentationPdfUrl,
      presentationFileName: campaign.presentationFileName,
      presentationUploadedAt: campaign.presentationUploadedAt,
    });
  } catch (error) {
    console.error("GET /api/projets-outreach/[id]/presentation:", error);
    return NextResponse.json({ error: "Erreur serveur" }, { status: 500 });
  }
}
