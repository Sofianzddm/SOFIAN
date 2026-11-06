import { NextRequest, NextResponse } from "next/server";
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

/**
 * URL présignée pour upload PDF direct navigateur → S3
 * (bypass limite 4.5 Mo Vercel — decks présentation souvent plus gros).
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
    if (!isS3Configured()) {
      return NextResponse.json(
        { error: "Stockage S3 non configuré — upload direct impossible." },
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

    if (contentType && contentType !== "application/pdf" && contentType !== "application/octet-stream") {
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
    const key = buildKey(
      "glowup-projets-outreach-presentations",
      `${campaignId}/${Date.now()}-${safeName}.pdf`
    );

    const signed = await createPresignedUpload({
      key,
      contentType: "application/pdf",
      expiresIn: 600,
    });

    return NextResponse.json({
      uploadUrl: signed.uploadUrl,
      publicUrl: signed.publicUrl,
      key: signed.key,
      contentType: signed.contentType,
    });
  } catch (error) {
    console.error("POST .../presentation/presign:", error);
    return NextResponse.json(
      { error: "Impossible de préparer l’upload." },
      { status: 500 }
    );
  }
}
